begin;

create table brix_private.openrouter_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.brix_profiles(id) on delete cascade,
  encrypted_credentials text not null,
  key_label text not null check (char_length(key_label) between 1 and 24),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index brix_one_active_openrouter_connection
  on brix_private.openrouter_connections(user_id) where active;
alter table brix_private.openrouter_connections enable row level security;
revoke all on brix_private.openrouter_connections from public, anon, authenticated;
grant select, insert, update, delete on brix_private.openrouter_connections to service_role;

create function public.brix_openrouter_put_connection(target_user_id uuid, ciphertext text, masked_label text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare connection_id uuid;
begin
  perform 1 from public.brix_profiles where id = target_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  update brix_private.openrouter_connections set active = false where user_id = target_user_id and active;
  insert into brix_private.openrouter_connections(user_id, encrypted_credentials, key_label)
    values(target_user_id, ciphertext, masked_label) returning id into connection_id;
  return connection_id;
end;
$$;
create function public.brix_openrouter_get_connection(target_user_id uuid, target_connection_id uuid default null)
returns table(id uuid, encrypted_credentials text) language sql security definer set search_path = '' as $$
  select c.id, c.encrypted_credentials from brix_private.openrouter_connections c
    where c.user_id = target_user_id and ((target_connection_id is null and c.active) or c.id = target_connection_id);
$$;
create function public.brix_openrouter_disconnect_connection(target_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  update brix_private.openrouter_connections set active = false where user_id = target_user_id and active;
$$;
create function public.brix_openrouter_connection_status(target_user_id uuid)
returns table(key_label text, created_at timestamptz) language sql security definer set search_path = '' as $$
  select c.key_label, c.created_at from brix_private.openrouter_connections c where c.user_id = target_user_id and c.active;
$$;

alter table public.brix_generations alter column connection_id drop not null;
alter table public.brix_generations add column if not exists provider text not null default 'higgsfield';
alter table public.brix_generations add column openrouter_connection_id uuid;
alter table public.brix_generations add constraint brix_openrouter_generation_connection
  foreign key (openrouter_connection_id, user_id) references brix_private.openrouter_connections(id, user_id);

create function public.brix_start_openrouter_generation(target_user_id uuid, target_connection_id uuid, job jsonb, request_body jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job_id uuid; existing_provider text; active_count integer;
begin
  perform 1 from public.brix_profiles where id = target_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  select id, provider into job_id, existing_provider from public.brix_generations
    where user_id = target_user_id and submit_key = (job->>'submit_key')::uuid;
  if found then
    if existing_provider <> 'openrouter' then raise exception 'Submit key belongs to a different provider'; end if;
    return jsonb_build_object('id', job_id, 'created', false);
  end if;
  perform 1 from brix_private.openrouter_connections
    where id = target_connection_id and user_id = target_user_id and active;
  if not found then raise exception 'Connect your OpenRouter API key again'; end if;
  select count(*) into active_count from public.brix_generations
    where user_id = target_user_id and status in ('pending_submit', 'queued', 'in_progress');
  if active_count >= 4 then raise exception 'Wait for an active generation to finish'; end if;
  if job->>'surface' <> 'image' or (job->>'model_id') not like 'or:%' then raise exception 'Unsupported OpenRouter generation'; end if;
  insert into public.brix_generations(user_id, connection_id, openrouter_connection_id, provider, submit_key, surface,
    model_id, model_label, model_path, prompt, settings, input_media, provider_cost_estimate, aspect, preset_id)
  values(target_user_id, null, target_connection_id, 'openrouter', (job->>'submit_key')::uuid, 'image',
    job->>'model_id', job->>'model_label', job->>'model_path', job->>'prompt', job->'settings', job->'input_media',
    (job->>'provider_cost_estimate')::numeric, (job->>'aspect')::double precision, job->>'preset_id')
  returning id into job_id;
  insert into brix_private.generation_requests(generation_id, request_body) values(job_id, request_body);
  return jsonb_build_object('id', job_id, 'created', true);
end;
$$;

revoke all on function public.brix_openrouter_put_connection(uuid, text, text),
  public.brix_openrouter_get_connection(uuid, uuid), public.brix_openrouter_disconnect_connection(uuid),
  public.brix_openrouter_connection_status(uuid), public.brix_start_openrouter_generation(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.brix_openrouter_put_connection(uuid, text, text),
  public.brix_openrouter_get_connection(uuid, uuid), public.brix_openrouter_disconnect_connection(uuid),
  public.brix_openrouter_connection_status(uuid), public.brix_start_openrouter_generation(uuid, uuid, jsonb, jsonb)
  to service_role;
commit;
