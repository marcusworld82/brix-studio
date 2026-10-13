begin;

-- Masked connection reads are also server-only. The app verifies the session
-- before providing the target user ID; clients cannot select another account.
revoke execute on function public.brix_connection_status() from authenticated;
create function public.brix_user_connection_status(target_user_id uuid)
returns table(key_label text, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select c.key_label, c.created_at from brix_private.higgsfield_connections c
  where c.user_id = target_user_id and c.active;
$$;
revoke all on function public.brix_user_connection_status(uuid) from public, anon, authenticated;
grant execute on function public.brix_user_connection_status(uuid) to service_role;
create policy brix_service_connections on brix_private.higgsfield_connections
  for all to service_role using (true) with check (true);
create policy brix_service_requests on brix_private.generation_requests
  for all to service_role using (true) with check (true);

alter table public.brix_generations
  add column aspect double precision not null default 1,
  add column error_kind text,
  add column preset_id text,
  add column finalize_lease_until timestamptz,
  add column finalize_lease_token uuid;
alter table public.brix_uploads add column metadata jsonb not null default '{}';

create table brix_private.rate_limits (
  key text primary key,
  count integer not null,
  expires_at timestamptz not null
);
alter table brix_private.rate_limits enable row level security;
grant select, insert, update, delete on brix_private.rate_limits to service_role;
create policy brix_service_rate_limits on brix_private.rate_limits
  for all to service_role using (true) with check (true);

create function public.brix_rate_limit(target_key text, request_limit integer, period_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_count integer;
begin
  if request_limit < 1 or period_seconds < 1 or period_seconds > 86400 then
    raise exception 'Invalid rate limit';
  end if;
  insert into brix_private.rate_limits(key, count, expires_at)
    values(target_key, 1, now() + make_interval(secs => period_seconds))
  on conflict(key) do update set
    count = case when rate_limits.expires_at <= now() then 1 else rate_limits.count + 1 end,
    expires_at = case when rate_limits.expires_at <= now() then now() + make_interval(secs => period_seconds) else rate_limits.expires_at end
  returning count into current_count;
  return current_count <= request_limit;
end;
$$;

create function public.brix_start_generation(target_user_id uuid, target_connection_id uuid, job jsonb, request_body jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job_id uuid; active_count integer;
begin
  perform 1 from public.brix_profiles where id = target_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  select id into job_id from public.brix_generations
    where user_id = target_user_id and submit_key = (job->>'submit_key')::uuid;
  if found then return jsonb_build_object('id', job_id, 'created', false); end if;
  perform 1 from brix_private.higgsfield_connections
    where id = target_connection_id and user_id = target_user_id and active;
  if not found then raise exception 'Connect your API key again'; end if;
  select count(*) into active_count from public.brix_generations
    where user_id = target_user_id and status in ('pending_submit', 'queued', 'in_progress');
  if active_count >= 4 then raise exception 'Wait for an active generation to finish'; end if;
  insert into public.brix_generations(user_id, connection_id, submit_key, surface,
    model_id, model_label, model_path, prompt, settings, input_media,
    provider_cost_estimate, aspect, preset_id)
  values(target_user_id, target_connection_id, (job->>'submit_key')::uuid,
    job->>'surface', job->>'model_id', job->>'model_label', job->>'model_path',
    job->>'prompt', job->'settings', job->'input_media',
    (job->>'provider_cost_estimate')::numeric, (job->>'aspect')::double precision, job->>'preset_id')
  returning id into job_id;
  insert into brix_private.generation_requests(generation_id, request_body)
    values(job_id, request_body);
  return jsonb_build_object('id', job_id, 'created', true);
end;
$$;

create function public.brix_claim_generation(target_generation_id uuid)
returns setof public.brix_generations language sql security definer set search_path = '' as $$
  update public.brix_generations set finalize_lease_until = now() + interval '2 minutes',
    finalize_lease_token = gen_random_uuid()
  where id = target_generation_id and status in ('pending_submit', 'queued', 'in_progress')
    and (finalize_lease_until is null or finalize_lease_until < now())
  returning *;
$$;

revoke all on function public.brix_rate_limit(text, integer, integer),
  public.brix_start_generation(uuid, uuid, jsonb, jsonb), public.brix_claim_generation(uuid)
  from public, anon, authenticated;
grant execute on function public.brix_rate_limit(text, integer, integer),
  public.brix_start_generation(uuid, uuid, jsonb, jsonb), public.brix_claim_generation(uuid) to service_role;

commit;
