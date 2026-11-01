begin;
alter table brix_private.subscription_pricing add column rate_units jsonb not null default '{}';
create or replace function public.brix_subscription_pricing(settings jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; pair record;
begin
 if settings is not null then
  perform 1 from brix_private.subscription_pricing where singleton for update;
  if settings ? 'expectedVersion' and settings->>'expectedVersion' is distinct from (select version::text from brix_private.subscription_pricing where singleton) then raise exception 'Pricing changed in another tab. Refresh before saving.'; end if;
  for pair in select * from jsonb_each_text(coalesce(settings->'rateUnits','{}')) loop
   if pair.value not in ('generation','image','second') then raise exception 'Invalid customer rate unit'; end if;
  end loop;
  if jsonb_typeof(settings->'modelMarkups') <> 'object' then raise exception 'Invalid model markups'; end if;
  for pair in select * from jsonb_each_text(settings->'modelMarkups') loop
   if pair.value::numeric < 0 or pair.value::numeric > 10000 then raise exception 'Invalid markup'; end if;
  end loop;
  update brix_private.subscription_pricing set version=gen_random_uuid(),markup_percent=(settings->>'markupPercent')::numeric,
   credit_usd=(settings->>'creditUsd')::numeric,model_markups=settings->'modelMarkups',fixed_credits=coalesce(settings->'fixedCredits','{}'),rate_units=coalesce(settings->'rateUnits','{}') where singleton;
 end if;
 select to_jsonb(p) into result from brix_private.subscription_pricing p where singleton;
 return result;
end; $$;
create or replace function public.brix_start_subscription_generation(target_user_id uuid, job jsonb, request_body jsonb, quote jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a brix_private.billing_accounts; p brix_private.subscription_pricing; gid uuid; cost bigint; sub bigint; rate bigint; quantity numeric; unit text; value text; values_seen numeric[]; field text;
begin
 perform public.brix_subscription_account(target_user_id);
 select * into a from brix_private.billing_accounts where user_id=target_user_id for update;
 select id into gid from public.brix_generations where user_id=target_user_id and submit_key=(job->>'submit_key')::uuid;
 if found then return jsonb_build_object('id',gid,'created',false); end if;
 select * into p from brix_private.subscription_pricing where singleton for share;
 if (quote->>'priceVersion') is distinct from p.version::text or (quote->>'modelId') is distinct from (job->>'model_id') then raise exception 'Price changed, refresh your quote'; end if;
 if (quote->>'providerUsd')::numeric < 0 then raise exception 'Invalid cost'; end if;
 rate=(p.fixed_credits->>(job->>'model_id'))::bigint;
 if rate is null or rate<=0 then raise exception 'The studio owner must set a customer price for this model in Admin'; end if;
 unit=coalesce(p.rate_units->>(job->>'model_id'),'generation'); quantity=1;
 if unit<>'generation' then
  values_seen=ARRAY[]::numeric[];
  foreach field in array (case when unit='image' then array['n','num_images','num_outputs','batch_size'] else array['duration','duration_seconds','seconds'] end) loop
   if request_body->>field is not null then
    value=request_body->>field;
    if value !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'The generation quantity is unclear'; end if;
    quantity=value::numeric;
    if quantity<=0 or quantity>100000 or (unit='image' and trunc(quantity)<>quantity) then raise exception 'Invalid generation quantity'; end if;
    if unit='second' and trunc(quantity*1000)<>quantity*1000 then raise exception 'Per-second prices support durations with at most three decimal places. Use a per-request price for finer durations.'; end if;
    values_seen=array_append(values_seen,quantity);
   end if;
  end loop;
  if cardinality(values_seen)=0 then
   if unit='second' then raise exception 'This model needs an explicit duration for per-second pricing'; end if;
   quantity=1;
  elsif (select count(distinct x) from unnest(values_seen) x)>1 then raise exception 'The generation quantity is unclear';
  else quantity=values_seen[1]; end if;
 end if;
 cost=ceil(rate*quantity);
 if cost is distinct from (quote->>'credits')::bigint or unit is distinct from (quote->>'unit') or quantity is distinct from (quote->>'quantity')::numeric then raise exception 'Price changed, refresh your quote'; end if;
 if a.subscription+a.topup < cost then raise exception 'Not enough credits. Add credits before generating.'; end if;
 if (select count(*) from public.brix_generations where user_id=target_user_id and surface=job->>'surface' and status in ('pending_submit','queued','in_progress')) >=
  (case a.plan when 'starter' then case job->>'surface' when 'image' then 4 when 'video' then 2 else 2 end
   when 'plus' then case job->>'surface' when 'image' then 8 when 'video' then 6 else 4 end
   when 'ultra' then case job->>'surface' when 'image' then 12 when 'video' then 8 else 6 end
   else 1 end)
 then raise exception 'Wait for an active generation on this surface to finish'; end if;
 sub=least(a.subscription,cost);
 insert into public.brix_generations(user_id,connection_id,submit_key,surface,model_id,model_label,model_path,prompt,settings,input_media,provider_cost_estimate,aspect,preset_id,project_id,provider,billing_source,credit_cost)
 values(target_user_id,null,(job->>'submit_key')::uuid,job->>'surface',job->>'model_id',job->>'model_label',job->>'model_path',coalesce(job->>'prompt',''),coalesce(job->'settings','{}'),coalesce(job->'input_media','[]'),(quote->>'providerUsd')::numeric,coalesce((job->>'aspect')::double precision,1),job->>'preset_id',nullif(job->>'project_id','')::uuid,coalesce(job->>'provider','higgsfield'),'subscription',cost) returning id into gid;
 insert into brix_private.generation_requests(generation_id,request_body) values(gid,request_body);
 insert into brix_private.credit_reservations values(gid,target_user_id,sub,cost-sub,null,quote);
 update brix_private.billing_accounts set subscription=subscription-sub,topup=topup-(cost-sub) where user_id=target_user_id;
 insert into brix_private.credit_ledger(user_id,reference,subscription_delta,topup_delta,snapshot) values(target_user_id,'reserve:'||gid,-sub,-(cost-sub),quote);
 return jsonb_build_object('id',gid,'created',true);
end; $$;

create function public.brix_manual_pricing_ready() returns boolean language sql security definer set search_path='' as $$ select true; $$;
revoke all on function public.brix_manual_pricing_ready() from public,anon,authenticated;
grant execute on function public.brix_manual_pricing_ready() to service_role;
commit;
