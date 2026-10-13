-- New BRIX project only. No changes to the existing shared Supabase project.
-- Apply before switching the app from its legacy MongoDB implementation.
begin;

create schema brix_private;
revoke all on schema brix_private from public, anon, authenticated;
grant usage on schema brix_private to service_role;

create table public.brix_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table brix_private.higgsfield_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.brix_profiles(id) on delete cascade,
  encrypted_credentials text not null,
  key_label text not null check (char_length(key_label) between 1 and 24),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index brix_one_active_connection
  on brix_private.higgsfield_connections(user_id) where active;
alter table brix_private.higgsfield_connections enable row level security;
grant select, insert, update, delete on brix_private.higgsfield_connections to service_role;

-- Service-only RPCs keep the private schema out of the public Data API.
create function public.brix_put_connection(
  target_user_id uuid, ciphertext text, masked_label text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare connection_id uuid;
begin
  perform 1 from public.brix_profiles where id = target_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  update brix_private.higgsfield_connections set active = false
    where user_id = target_user_id and active;
  insert into brix_private.higgsfield_connections(user_id, encrypted_credentials, key_label)
    values (target_user_id, ciphertext, masked_label) returning id into connection_id;
  return connection_id;
end;
$$;

create function public.brix_get_connection(target_user_id uuid, target_connection_id uuid default null)
returns table(id uuid, encrypted_credentials text) language sql security definer set search_path = '' as $$
  select c.id, c.encrypted_credentials from brix_private.higgsfield_connections c
    where c.user_id = target_user_id and
      ((target_connection_id is null and c.active) or c.id = target_connection_id);
$$;

create function public.brix_disconnect_connection(target_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  update brix_private.higgsfield_connections set active = false
    where user_id = target_user_id and active;
$$;

create function public.brix_connection_status()
returns table(key_label text, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select c.key_label, c.created_at from brix_private.higgsfield_connections c
    where c.user_id = (select auth.uid()) and c.active;
$$;

revoke all on function public.brix_put_connection(uuid, text, text),
  public.brix_get_connection(uuid, uuid), public.brix_disconnect_connection(uuid),
  public.brix_connection_status() from public, anon, authenticated;
grant execute on function public.brix_put_connection(uuid, text, text),
  public.brix_get_connection(uuid, uuid), public.brix_disconnect_connection(uuid) to service_role;
grant execute on function public.brix_connection_status() to authenticated;

create table public.brix_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.brix_profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.brix_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.brix_profiles(id) on delete cascade,
  connection_id uuid not null,
  project_id uuid,
  submit_key uuid not null,
  surface text not null check (surface in ('image', 'video', 'audio')),
  model_id text not null,
  model_label text not null,
  model_path text not null,
  prompt text not null default '',
  settings jsonb not null default '{}',
  input_media jsonb not null default '[]',
  status text not null default 'pending_submit' check (
    status in ('pending_submit', 'queued', 'in_progress', 'completed', 'failed', 'nsfw', 'canceled')
  ),
  provider_request_id text,
  provider_cost_estimate numeric check (provider_cost_estimate >= 0),
  outputs jsonb not null default '[]',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, submit_key),
  foreign key (connection_id, user_id)
    references brix_private.higgsfield_connections(id, user_id),
  foreign key (project_id, user_id)
    references public.brix_projects(id, user_id) on delete set null (project_id)
);
create index brix_generation_library on public.brix_generations(user_id, created_at desc);
create index brix_in_flight on public.brix_generations(updated_at)
  where status in ('pending_submit', 'queued', 'in_progress');

-- Request bodies and provider URLs are server-only operational data.
create table brix_private.generation_requests (
  generation_id uuid primary key references public.brix_generations(id) on delete cascade,
  request_body jsonb not null,
  finalize_lease_until timestamptz
);
alter table brix_private.generation_requests enable row level security;
grant select, insert, update, delete on brix_private.generation_requests to service_role;

create table public.brix_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.brix_profiles(id) on delete cascade,
  storage_path text not null unique,
  kind text not null check (kind in ('image', 'video', 'audio')),
  name text not null,
  content_type text not null,
  bytes bigint not null check (bytes >= 0),
  created_at timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = user_id::text)
);

create table public.brix_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.brix_profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  surface text not null check (surface in ('image', 'video', 'audio')),
  model_id text not null,
  prompt text not null default '',
  settings jsonb not null default '{}',
  cover_path text,
  category text not null default 'general',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Profile creation is automatic. Admin assignment is a server-only operation.
create function public.brix_create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.brix_profiles(id) values (new.id);
  return new;
end;
$$;
revoke all on function public.brix_create_profile() from public, anon, authenticated;
create trigger brix_auth_user_created after insert on auth.users
  for each row execute function public.brix_create_profile();

alter table public.brix_profiles enable row level security;
alter table public.brix_projects enable row level security;
alter table public.brix_generations enable row level security;
alter table public.brix_uploads enable row level security;
alter table public.brix_templates enable row level security;

revoke all on public.brix_profiles, public.brix_projects, public.brix_generations,
  public.brix_uploads, public.brix_templates from anon, authenticated;
grant select on public.brix_profiles, public.brix_projects, public.brix_generations,
  public.brix_uploads, public.brix_templates to authenticated;
grant update(display_name) on public.brix_profiles to authenticated;
grant select, insert, update, delete on public.brix_profiles, public.brix_projects,
  public.brix_generations, public.brix_uploads, public.brix_templates to service_role;
grant select on public.brix_templates to anon;

create policy brix_own_profile on public.brix_profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy brix_update_name on public.brix_profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy brix_own_projects on public.brix_projects
  for select to authenticated using ((select auth.uid()) = user_id);
create policy brix_own_generations on public.brix_generations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy brix_own_uploads on public.brix_uploads
  for select to authenticated using ((select auth.uid()) = user_id);
create policy brix_visible_templates on public.brix_templates
  for select to anon, authenticated using (
    (owner_id is null and active) or (select auth.uid()) = owner_id
  );

-- Kept private. Files are served using short-lived signed URLs.
insert into storage.buckets(id, name, public, file_size_limit)
  values ('brix-media', 'brix-media', false, 209715200);
create policy brix_read_own_media on storage.objects
  for select to authenticated using (
    bucket_id = 'brix-media' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy brix_upload_own_media on storage.objects
  for insert to authenticated with check (
    bucket_id = 'brix-media' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy brix_delete_own_media on storage.objects
  for delete to authenticated using (
    bucket_id = 'brix-media' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
