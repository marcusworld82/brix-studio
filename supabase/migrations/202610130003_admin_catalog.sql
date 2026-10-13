alter table public.brix_templates add column cover_video_url text, add column sort_order integer not null default 0;
create table public.brix_presets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  data jsonb not null,
  active boolean not null default true,
  sort_order integer not null default 0
);
alter table public.brix_presets enable row level security;
create policy presets_read on public.brix_presets for select to anon, authenticated using (active);
grant select on public.brix_presets to anon, authenticated;
grant all on public.brix_presets to service_role;
create or replace function public.brix_start_generation(target_user_id uuid, target_connection_id uuid, job jsonb, request_body jsonb)
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
    provider_cost_estimate, aspect, preset_id, project_id)
  values(target_user_id, target_connection_id, (job->>'submit_key')::uuid,
    job->>'surface', job->>'model_id', job->>'model_label', job->>'model_path',
    job->>'prompt', job->'settings', job->'input_media',
    (job->>'provider_cost_estimate')::numeric, (job->>'aspect')::double precision, job->>'preset_id', nullif(job->>'project_id', '')::uuid)
  returning id into job_id;
  insert into brix_private.generation_requests(generation_id, request_body)
    values(job_id, request_body);
  return jsonb_build_object('id', job_id, 'created', true);
end;
$$;

