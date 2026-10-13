import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

const owner = "11111111-1111-4111-8111-111111111111"
const other = "22222222-2222-4222-8222-222222222222"
let database: PGlite

async function asUser(id: string) {
  await database.exec("set role authenticated")
  await database.query(
    "select set_config('request.jwt.claim.sub', $1, false)",
    [id]
  )
}

beforeAll(async () => {
  database = new PGlite()
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth, public, storage to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant select, insert, delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/'))-1];
    $$;
  `)
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202610130001_brix_byok.sql",
      import.meta.url
    ),
    "utf8"
  )
  await database.exec(migration)
  await database.query("insert into auth.users(id) values ($1), ($2)", [
    owner,
    other,
  ])
  await database.query(
    "insert into storage.objects(bucket_id, name) values ('brix-media', $1), ('brix-media', $2)",
    [`${owner}/uploads/own.png`, `${other}/uploads/private.png`]
  )
}, 30_000)

afterEach(async () => {
  await database.exec("reset role")
})
afterAll(async () => {
  await database?.close()
})

describe("Supabase BRIX migration and access boundaries", () => {
  it("creates profiles automatically and a private media bucket", async () => {
    expect(
      (await database.query("select id from public.brix_profiles")).rows
    ).toHaveLength(2)
    expect(
      (
        await database.query(
          "select public from storage.buckets where id = 'brix-media'"
        )
      ).rows
    ).toEqual([{ public: false }])
  })

  it("shows only the current user's profile and prevents admin self-promotion", async () => {
    await asUser(owner)
    expect(
      (await database.query("select id from public.brix_profiles")).rows
    ).toEqual([{ id: owner }])
    await expect(
      database.exec("update public.brix_profiles set role = 'admin'")
    ).rejects.toThrow(/permission denied/)
    await database.query(
      "update public.brix_profiles set display_name = $1 where id = $2",
      ["Owner", owner]
    )
  })

  it("hides raw credentials and denies service-only RPCs to users", async () => {
    await asUser(owner)
    await expect(
      database.exec("select * from brix_private.higgsfield_connections")
    ).rejects.toThrow(/permission denied/)
    await expect(
      database.query("select * from public.brix_get_connection($1)", [owner])
    ).rejects.toThrow(/permission denied/)
    await expect(
      database.query(
        "select public.brix_put_connection($1, 'encrypted', 'masked')",
        [owner]
      )
    ).rejects.toThrow(/permission denied/)
  })

  it("retains prior connections for in-flight jobs and scopes reads by owner", async () => {
    await database.exec("set role service_role")
    const first = (
      await database.query<{ id: string }>(
        "select public.brix_put_connection($1, 'first-cipher', 'masked-1111') as id",
        [owner]
      )
    ).rows[0]!.id
    const second = (
      await database.query<{ id: string }>(
        "select public.brix_put_connection($1, 'second-cipher', 'masked-2222') as id",
        [owner]
      )
    ).rows[0]!.id
    expect(
      (
        await database.query("select id from public.brix_get_connection($1)", [
          owner,
        ])
      ).rows
    ).toEqual([{ id: second }])
    expect(
      (
        await database.query(
          "select id from public.brix_get_connection($1, $2)",
          [owner, first]
        )
      ).rows
    ).toEqual([{ id: first }])
    expect(
      (
        await database.query(
          "select id from public.brix_get_connection($1, $2)",
          [other, first]
        )
      ).rows
    ).toEqual([])
    await database.exec("reset role")
    await asUser(owner)
    const status = (
      await database.query<{ key_label: string; created_at: Date }>(
        "select * from public.brix_connection_status()"
      )
    ).rows[0]!
    expect(Object.keys(status).sort()).toEqual(["created_at", "key_label"])
    expect(status.key_label).toBe("masked-2222")
  })

  it("blocks generation writes from the browser", async () => {
    await asUser(owner)
    await expect(
      database.exec("update public.brix_generations set status = 'completed'")
    ).rejects.toThrow(/permission denied/)
  })

  it("shows only the current user's generation history", async () => {
    const ownKey = (
      await database.query<{ id: string }>(
        "select public.brix_put_connection($1, 'owner-history-cipher', 'masked-own') as id",
        [owner]
      )
    ).rows[0]!.id
    const otherKey = (
      await database.query<{ id: string }>(
        "select public.brix_put_connection($1, 'other-history-cipher', 'masked-other') as id",
        [other]
      )
    ).rows[0]!.id
    await database.query(
      `insert into public.brix_generations(
      user_id, connection_id, submit_key, surface, model_id, model_label, model_path, prompt
    ) values ($1, $2, gen_random_uuid(), 'image', 'soul-2', 'Soul 2', 'higgsfield-ai/soul/v2/standard', $3)`,
      [owner, ownKey, "Owner history"]
    )
    await database.query(
      `insert into public.brix_generations(
      user_id, connection_id, submit_key, surface, model_id, model_label, model_path, prompt
    ) values ($1, $2, gen_random_uuid(), 'image', 'soul-2', 'Soul 2', 'higgsfield-ai/soul/v2/standard', $3)`,
      [other, otherKey, "Other private history"]
    )
    await asUser(owner)
    expect(
      (await database.query("select prompt from public.brix_generations")).rows
    ).toEqual([{ prompt: "Owner history" }])
  })

  it("rejects a generation linked to another user's provider connection", async () => {
    const otherKey = (
      await database.query<{ id: string }>(
        "select public.brix_put_connection($1, 'other-binding-cipher', 'masked-other') as id",
        [other]
      )
    ).rows[0]!.id
    await expect(
      database.query(
        `insert into public.brix_generations(
      user_id, connection_id, submit_key, surface, model_id, model_label, model_path
    ) values ($1, $2, gen_random_uuid(), 'image', 'soul-2', 'Soul 2', 'higgsfield-ai/soul/v2/standard')`,
        [owner, otherKey]
      )
    ).rejects.toThrow(/foreign key constraint/)
  })

  it("allows access only to the user's own private media folder", async () => {
    await asUser(owner)
    expect(
      (await database.query("select name from storage.objects")).rows
    ).toEqual([{ name: `${owner}/uploads/own.png` }])
    await expect(
      database.query(
        "insert into storage.objects(bucket_id, name) values ('brix-media', $1)",
        [`${other}/uploads/stolen.png`]
      )
    ).rejects.toThrow(/row-level security/)
  })

  it("rejects an empty project name", async () => {
    await expect(
      database.query(
        "insert into public.brix_projects(user_id, name) values ($1, '')",
        [owner]
      )
    ).rejects.toThrow(/check constraint/)
  })
})
