import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
let database: PGlite
const owner = "11111111-1111-4111-8111-111111111111"
const other = "22222222-2222-4222-8222-222222222222"
async function connect(user: string) {
  const result = await database.query<{ id: string }>(
    "select public.brix_openrouter_put_connection($1, $2, $3) as id",
    [user, "encrypted-fixture", "masked"]
  )
  return result.rows[0]!.id
}
function job(index = 1) {
  return {
    submit_key: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`,
    surface: "image",
    model_id: "or:openai/gpt-image-2.5-flare",
    model_label: "GPT Image 2.5 Flare",
    model_path: "openai/gpt-image-2.5-flare",
    prompt: "A forest",
    settings: {},
    input_media: [],
    provider_cost_estimate: null,
    aspect: 1,
  }
}
async function start(user: string, connection: string, index = 1) {
  return database.query<{ result: { id: string; created: boolean } }>(
    "select public.brix_start_openrouter_generation($1, $2, $3, $4) as result",
    [
      user,
      connection,
      JSON.stringify(job(index)),
      JSON.stringify({ prompt: "A forest" }),
    ]
  )
}
beforeAll(async () => {
  database = new PGlite()
  await database.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    grant usage on schema auth, public, storage to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant select, insert, delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/'))-1]; $$;
  `)
  for (const name of [
    "202610130001_brix_byok.sql",
    "202610130002_runtime.sql",
    "202610130003_admin_catalog.sql",
    "202611010001_openrouter.sql",
  ])
    await database.exec(
      await readFile(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        "utf8"
      )
    )
  await database.query("insert into auth.users(id) values ($1), ($2)", [
    owner,
    other,
  ])
}, 30000)
beforeEach(async () => {
  await database.exec(
    "reset role; truncate public.brix_generations cascade; delete from brix_private.openrouter_connections; set role service_role"
  )
})
afterAll(async () => {
  await database?.close()
})
describe("OpenRouter migration access boundaries and job lifecycle", () => {
  it("denies direct key access and every key RPC to browser roles", async () => {
    await connect(owner)
    for (const role of ["anon", "authenticated"]) {
      await database.exec(`reset role; set role ${role}`)
      await expect(
        database.query("select * from brix_private.openrouter_connections")
      ).rejects.toThrow("permission denied")
      for (const sql of [
        "select public.brix_openrouter_connection_status($1)",
        "select public.brix_openrouter_get_connection($1)",
        "select public.brix_openrouter_disconnect_connection($1)",
      ])
        await expect(database.query(sql, [owner])).rejects.toThrow(
          "permission denied"
        )
      await expect(
        database.query(
          "select public.brix_openrouter_put_connection($1, 'fixture', 'masked')",
          [owner]
        )
      ).rejects.toThrow("permission denied")
    }
  })
  it("scopes pinned connections to their owner and preserves old keys only for trusted in-flight work", async () => {
    const old = await connect(owner)
    const current = await connect(owner)
    const active = await database.query(
      "select * from public.brix_openrouter_get_connection($1)",
      [owner]
    )
    expect(active.rows).toMatchObject([{ id: current }])
    expect(
      (
        await database.query(
          "select * from public.brix_openrouter_get_connection($1, $2)",
          [other, old]
        )
      ).rows
    ).toEqual([])
    expect(
      (
        await database.query(
          "select * from public.brix_openrouter_get_connection($1, $2)",
          [owner, old]
        )
      ).rows
    ).toMatchObject([{ id: old }])
    await database.query(
      "select public.brix_openrouter_disconnect_connection($1)",
      [owner]
    )
    expect(
      (
        await database.query(
          "select * from public.brix_openrouter_get_connection($1)",
          [owner]
        )
      ).rows
    ).toEqual([])
  })
  it("starts one owner-scoped job and replays its submit key without creating a duplicate", async () => {
    const connection = await connect(owner)
    const first = (await start(owner, connection)).rows[0]!.result
    const replay = (await start(owner, connection)).rows[0]!.result
    expect(first.created).toBe(true)
    expect(replay).toEqual({ id: first.id, created: false })
    expect(
      (
        await database.query(
          "select user_id, provider, connection_id, openrouter_connection_id from public.brix_generations"
        )
      ).rows
    ).toEqual([
      {
        user_id: owner,
        provider: "openrouter",
        connection_id: null,
        openrouter_connection_id: connection,
      },
    ])
    expect(
      (await database.query("select * from brix_private.generation_requests"))
        .rows
    ).toHaveLength(1)
  })
  it("rejects another owner's connection and disconnected keys before creating jobs", async () => {
    const connection = await connect(owner)
    await expect(start(other, connection)).rejects.toThrow(
      "Connect your OpenRouter"
    )
    await database.query(
      "select public.brix_openrouter_disconnect_connection($1)",
      [owner]
    )
    await expect(start(owner, connection)).rejects.toThrow(
      "Connect your OpenRouter"
    )
    expect(
      (await database.query("select * from public.brix_generations")).rows
    ).toEqual([])
  })
  it("enforces the four-job limit and retains cross-owner foreign keys", async () => {
    const connection = await connect(owner)
    for (let index = 1; index <= 4; index++)
      await start(owner, connection, index)
    await expect(start(owner, connection, 5)).rejects.toThrow(
      "Wait for an active"
    )
    const firstId = (
      await database.query<{ id: string }>(
        "select id from public.brix_generations limit 1"
      )
    ).rows[0]!.id
    await expect(
      database.query(
        "update public.brix_generations set user_id = $1 where id = $2",
        [other, firstId]
      )
    ).rejects.toThrow("foreign key")
  })
})
