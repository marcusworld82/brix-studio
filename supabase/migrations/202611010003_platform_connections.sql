begin;
create table brix_private.platform_connections (
 id uuid primary key default gen_random_uuid(),
 provider text not null check(provider in ('higgsfield','openrouter')),
 encrypted_credentials text not null,
 key_label text not null,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index brix_one_platform_provider on brix_private.platform_connections(provider) where active;
alter table brix_private.platform_connections enable row level security;
grant all on brix_private.platform_connections to service_role;
alter table public.brix_generations add column platform_connection_id uuid references brix_private.platform_connections(id);
alter table public.brix_generations add column provider_actual_cost numeric check(provider_actual_cost >= 0);
create function public.brix_platform_connection(target_provider text, pinned_id uuid default null)
returns table(id uuid, encrypted_credentials text,key_label text) language sql security definer set search_path='' as $$
 select c.id,c.encrypted_credentials,c.key_label from brix_private.platform_connections c where c.provider=target_provider and ((pinned_id is null and c.active) or c.id=pinned_id);
$$;
create function public.brix_put_platform_connection(target_provider text,ciphertext text,masked_label text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext('brix-platform-' || target_provider));
 update brix_private.platform_connections set active=false where provider=target_provider and active;
 if ciphertext is not null then
 insert into brix_private.platform_connections(provider,encrypted_credentials,key_label) values(target_provider,ciphertext,masked_label);
 end if;
end;
$$;
revoke all on function public.brix_platform_connection(text,uuid), public.brix_put_platform_connection(text,text,text) from public,anon,authenticated;
grant execute on function public.brix_platform_connection(text,uuid), public.brix_put_platform_connection(text,text,text) to service_role;
create function public.brix_pending_credit_settlements()
returns table(id uuid,status text) language sql security definer set search_path='' as $$
 select g.id,g.status from brix_private.credit_reservations r
 join public.brix_generations g on g.id=r.generation_id
 where r.outcome is null and g.status in ('completed','failed','nsfw','canceled')
 order by g.created_at limit 100;
$$;
revoke all on function public.brix_pending_credit_settlements() from public,anon,authenticated;
grant execute on function public.brix_pending_credit_settlements() to service_role;
commit;
