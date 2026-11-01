begin;
alter table public.brix_generations alter column connection_id drop not null;
alter table public.brix_generations
  add column if not exists provider text not null default 'higgsfield',
  add column billing_source text not null default 'higgsfield-api' check(billing_source in ('higgsfield-api','subscription')),
  add column credit_cost bigint not null default 0 check(credit_cost >= 0),
  add column refunded_credits bigint not null default 0 check(refunded_credits >= 0);
create table brix_private.billing_accounts (
 user_id uuid primary key references public.brix_profiles(id),
 subscription bigint not null default 0 check(subscription >= 0), topup bigint not null default 0 check(topup >= 0),
 plan text not null default 'free' check(plan in ('free','starter','plus','ultra')),
 billing_review text, customer_id text unique, subscription_id text, status text not null default 'none', event_created bigint not null default 0, next_refill timestamptz, refill_start timestamptz, refill_index integer not null default 1, refill_end timestamptz, refill_credits bigint not null default 0
);
create table brix_private.subscription_pricing (
 singleton boolean primary key default true check(singleton), version uuid not null default gen_random_uuid(),
 markup_percent numeric not null default 30 check(markup_percent between 0 and 10000),
 credit_usd numeric not null default 0.01 check(credit_usd > 0 and credit_usd <= 100),
 model_markups jsonb not null default '{}', fixed_credits jsonb not null default '{}'
);
insert into brix_private.subscription_pricing(singleton) values(true);
create table brix_private.credit_ledger (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.brix_profiles(id),
 reference text not null unique, subscription_delta bigint not null, topup_delta bigint not null,
 snapshot jsonb not null default '{}', created_at timestamptz not null default now()
);
create table brix_private.stripe_events (id text primary key, created_at timestamptz not null default now());
create table brix_private.credit_reservations (
 generation_id uuid primary key references public.brix_generations(id), user_id uuid not null references public.brix_profiles(id),
 subscription bigint not null, topup bigint not null, outcome text check(outcome in ('complete','failed')),
 snapshot jsonb not null
);
-- Only service RPCs can mutate balances. Ledger entries are append-only even for service callers.
create function brix_private.reject_ledger_mutation() returns trigger language plpgsql as $$
begin raise exception 'Credit ledger is immutable'; end; $$;
create trigger immutable_ledger before update or delete on brix_private.credit_ledger for each row execute function brix_private.reject_ledger_mutation();
create function public.brix_subscription_account(target_user_id uuid, customer text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a brix_private.billing_accounts;
begin
 insert into brix_private.billing_accounts(user_id) values(target_user_id) on conflict do nothing;
 if customer is not null then update brix_private.billing_accounts set customer_id=coalesce(customer_id,customer) where user_id=target_user_id; end if;
 select * into a from brix_private.billing_accounts where user_id=target_user_id;
 return to_jsonb(a);
end; $$;
create function public.brix_subscription_pricing(settings jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; pair record;
begin
 if settings is not null then
  if jsonb_typeof(settings->'modelMarkups') <> 'object' then raise exception 'Invalid model markups'; end if;
  for pair in select * from jsonb_each_text(settings->'modelMarkups') loop
   if pair.value::numeric < 0 or pair.value::numeric > 10000 then raise exception 'Invalid markup'; end if;
  end loop;
  update brix_private.subscription_pricing set version=gen_random_uuid(),markup_percent=(settings->>'markupPercent')::numeric,
   credit_usd=(settings->>'creditUsd')::numeric,model_markups=settings->'modelMarkups',fixed_credits=coalesce(settings->'fixedCredits','{}') where singleton;
 end if;
 select to_jsonb(p) into result from brix_private.subscription_pricing p where singleton;
 return result;
end; $$;
create function public.brix_start_subscription_generation(target_user_id uuid, job jsonb, request_body jsonb, quote jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a brix_private.billing_accounts; p brix_private.subscription_pricing; gid uuid; cost bigint; sub bigint; markup numeric;
begin
 perform public.brix_subscription_account(target_user_id);
 select * into a from brix_private.billing_accounts where user_id=target_user_id for update;
 select id into gid from public.brix_generations where user_id=target_user_id and submit_key=(job->>'submit_key')::uuid;
 if found then return jsonb_build_object('id',gid,'created',false); end if;
 select * into p from brix_private.subscription_pricing where singleton for share;
 if (quote->>'priceVersion') is distinct from p.version::text or (quote->>'modelId') is distinct from (job->>'model_id') then raise exception 'Price changed, refresh your quote'; end if;
 if (quote->>'providerUsd')::numeric < 0 then raise exception 'Invalid cost'; end if;
 markup=coalesce((p.model_markups->>(job->>'model_id'))::numeric,p.markup_percent);
 if p.fixed_credits ? (job->>'model_id') or quote->>'providerUsd' is null then
  cost=(p.fixed_credits->>(job->>'model_id'))::bigint;
  if cost is null or cost <= 0 then raise exception 'Model needs an admin credit price'; end if;
 else cost=greatest(1,ceil((quote->>'providerUsd')::numeric*(1+markup/100)/p.credit_usd)); end if;
 if cost <> (quote->>'credits')::bigint then raise exception 'Price changed, refresh your quote'; end if;
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
create function public.brix_settle_subscription_generation(target_generation_id uuid, outcome text)
returns void language plpgsql security definer set search_path='' as $$
declare r brix_private.credit_reservations; terminal text;
begin
 if outcome not in ('complete','failed') then raise exception 'Invalid outcome'; end if;
 select * into r from brix_private.credit_reservations where generation_id=target_generation_id for update;
 if not found or r.outcome is not null then return; end if;
 select status into terminal from public.brix_generations where id=target_generation_id;
 if (outcome='complete' and terminal<>'completed') or (outcome='failed' and terminal not in ('failed','nsfw','canceled')) then raise exception 'Generation is not terminal'; end if;
 update brix_private.credit_reservations set outcome=brix_settle_subscription_generation.outcome where generation_id=target_generation_id;
 if outcome='failed' then
  update brix_private.billing_accounts set subscription=subscription+r.subscription,topup=topup+r.topup where user_id=r.user_id;
  insert into brix_private.credit_ledger(user_id,reference,subscription_delta,topup_delta,snapshot) values(r.user_id,'refund:'||target_generation_id,r.subscription,r.topup,r.snapshot);
  update public.brix_generations set refunded_credits=r.subscription+r.topup where id=target_generation_id;
 end if;
end; $$;
-- Stripe validation happens server-side before this transactional, idempotent write.
create function public.brix_subscription_stripe_event(payload jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare a brix_private.billing_accounts; uid uuid; amount bigint; bucket text;
begin
 uid=(payload->>'userId')::uuid;
 perform public.brix_subscription_account(uid);
 select * into a from brix_private.billing_accounts where user_id=uid for update;
 if a.customer_id is null or a.customer_id <> payload->>'customerId' then raise exception 'Stripe customer mismatch'; end if;
 insert into brix_private.stripe_events(id) values(payload->>'eventId') on conflict do nothing;
 if not found then return false; end if;
 amount=coalesce((payload->>'credits')::bigint,0); bucket=payload->>'bucket';
 if amount<0 then raise exception 'Invalid grant'; end if;
 if amount>0 then
  insert into brix_private.credit_ledger(user_id,reference,subscription_delta,topup_delta,snapshot)
   values(uid,payload->>'reference',case when bucket='subscription' then amount else 0 end,case when bucket='topup' then amount else 0 end,payload) on conflict do nothing;
  if found then update brix_private.billing_accounts set subscription=subscription+case when bucket='subscription' then amount else 0 end,topup=topup+case when bucket='topup' then amount else 0 end where user_id=uid; end if;
 end if;
 if payload->>'bucket'='subscription' and not coalesce((payload->>'annual')::boolean,false) and (payload->>'eventCreated')::bigint >= a.event_created then update brix_private.billing_accounts set next_refill=null where user_id=uid; end if;
 if coalesce((payload->>'annual')::boolean,false) and (payload->>'eventCreated')::bigint >= a.event_created then
 update brix_private.billing_accounts set refill_start=to_timestamp((payload->>'periodStart')::double precision),refill_index=1,next_refill=to_timestamp((payload->>'periodStart')::double precision)+interval '1 month', refill_end=to_timestamp((payload->>'periodEnd')::double precision),refill_credits=amount where user_id=uid;
 end if;
 if payload ? 'billingReview' then update brix_private.billing_accounts set billing_review=payload->>'billingReview' where user_id=uid; end if;
 if payload ? 'status' and (payload->>'eventCreated')::bigint >= a.event_created then
  update brix_private.billing_accounts set plan=payload->>'plan',status=payload->>'status',subscription_id=payload->>'subscriptionId',event_created=(payload->>'eventCreated')::bigint where user_id=uid;
 end if;
 return true;
end; $$;
create function public.brix_refill_subscription_allowances() returns integer language plpgsql security definer set search_path='' as $$
declare a brix_private.billing_accounts; granted integer=0;
begin
 for a in select * from brix_private.billing_accounts where next_refill <= now() and next_refill < refill_end and status in ('active','trialing') for update skip locked loop
  while a.refill_index < 12 and a.next_refill <= now() and a.next_refill < a.refill_end loop
   insert into brix_private.credit_ledger(user_id,reference,subscription_delta,topup_delta)
    values(a.user_id,'annual-refill:'||a.subscription_id||':'||a.next_refill::text,a.refill_credits,0) on conflict do nothing;
   if found then update brix_private.billing_accounts set subscription=subscription+a.refill_credits where user_id=a.user_id; granted=granted+1; end if;
   a.refill_index=a.refill_index+1;
   a.next_refill=a.refill_start+make_interval(months=>a.refill_index);
  end loop;
  update brix_private.billing_accounts set next_refill=case when a.refill_index < 12 then a.next_refill else null end,refill_index=a.refill_index where user_id=a.user_id;
 end loop;
 return granted;
end; $$;
create function public.brix_subscription_billing_reviews() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('userId',user_id,'review',billing_review)), '[]'::jsonb) from brix_private.billing_accounts where billing_review is not null;
$$;
revoke all on function public.brix_subscription_billing_reviews() from public,anon,authenticated;
grant execute on function public.brix_subscription_billing_reviews() to service_role;
revoke all on function public.brix_refill_subscription_allowances() from public,anon,authenticated;
grant execute on function public.brix_refill_subscription_allowances() to service_role;
revoke all on function public.brix_subscription_account(uuid,text),public.brix_subscription_pricing(jsonb),public.brix_start_subscription_generation(uuid,jsonb,jsonb,jsonb),public.brix_settle_subscription_generation(uuid,text),public.brix_subscription_stripe_event(jsonb) from public,anon,authenticated;
grant execute on function public.brix_subscription_account(uuid,text),public.brix_subscription_pricing(jsonb),public.brix_start_subscription_generation(uuid,jsonb,jsonb,jsonb),public.brix_settle_subscription_generation(uuid,text),public.brix_subscription_stripe_event(jsonb) to service_role;
alter table brix_private.billing_accounts enable row level security;
alter table brix_private.subscription_pricing enable row level security;
alter table brix_private.credit_ledger enable row level security;
alter table brix_private.stripe_events enable row level security;
alter table brix_private.credit_reservations enable row level security;
commit;
