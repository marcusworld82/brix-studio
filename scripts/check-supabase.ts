import "./load-env"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { createServerClient } from "@supabase/ssr"
import { createSupabaseServiceClient } from "../lib/supabase/server"
import { encryptCredentials } from "../lib/supabase/credential-cipher"
import { finishUpload, removeUpload } from "../lib/supabase/media"
import { newProject, ownProject, changeProject } from "../lib/supabase/library"

// Opt-in hosted smoke test. No provider generation, real key, or email is sent.
const appUrl = process.env.BRIX_CHECK_URL ?? "http://localhost:3000"
const service = createSupabaseServiceClient()
const users: string[] = []
const fixturePassword = randomUUID() + "Aa1!"
const cookies: Record<string, string> = {}
let storagePath: string | undefined
try {
  for (let i = 0; i < 2; i++) {
    const { data, error } = await service.auth.admin.createUser({
      email: `brix-check-${randomUUID()}@example.com`,
      email_confirm: true,
      password: fixturePassword,
    })
    assert.ifError(error)
    assert(data.user)
    users.push(data.user.id)
  }
  const session = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () =>
          Object.entries(cookies).map(([name, value]) => ({ name, value })),
        setAll: (values) =>
          values.forEach((c) => {
            cookies[c.name] = c.value
          }),
      },
    }
  )
  const { error: loginError } = await session.auth.signInWithPassword({
    email: (await service.auth.admin.getUserById(users[0]!)).data.user!.email!,
    password: fixturePassword,
  })
  assert.ifError(loginError)
  const headers = {
    cookie: Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join("; "),
    origin: appUrl,
    "content-type": "application/json",
  }
  const get = async (path: string) =>
    fetch(`${appUrl}${path}`, { headers, redirect: "manual" })
  const action = async (name: string, args: unknown[]) => {
    const manifest = JSON.parse(
      await readFile(".next/dev/server/server-reference-manifest.json", "utf8")
    )
    const id = Object.entries(manifest.node).find(
      ([, v]) => (v as { exportedName?: string }).exportedName === name
    )?.[0]
    assert(id, `${name} must be compiled`)
    const result = await fetch(`${appUrl}/account`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "text/plain;charset=UTF-8",
        "Next-Action": id,
      },
      body: JSON.stringify(args),
    })
    assert.equal(result.status, 200)
    return result.text()
  }
  const me = await (await get("/api/me")).json()
  assert.equal(me.user.id, users[0])
  assert.equal(me.mode, "api-key")
  assert.equal(me.connection.connected, false)
  const cipher = encryptCredentials(
    "test-key-id:test-key-secret",
    users[0]!,
    process.env.API_KEY_ENCRYPTION_SECRET!
  )
  assert.ifError(
    (
      await service.rpc("brix_put_connection", {
        target_user_id: users[0]!,
        ciphertext: cipher,
        masked_label: "•••• test",
      })
    ).error
  )
  if (!process.env.BRIX_CHECK_URL) {
    await get("/account")
    const denied = await action("saveApiConnectionAction", [
      { keyId: "test-key-id", keySecret: "test-key-secret", userId: users[1] },
    ])
    assert(denied.includes('"ok":false'))
    const connected = await action("saveApiConnectionAction", [
      { keyId: "test-key-id", keySecret: "test-key-secret" },
    ])
    assert(connected.includes('"ok":true'))
    assert(!connected.includes("test-key-secret"))
  }
  const saved = await (await get("/api/me")).json()
  assert.equal(saved.connection.connected, true)
  assert(!JSON.stringify(saved).includes("test-key-secret"))
  const outsider = await service.rpc("brix_get_connection", {
    target_user_id: users[1]!,
    target_connection_id: (
      await service.rpc("brix_get_connection", { target_user_id: users[0]! })
    ).data![0]!.id,
  })
  assert.deepEqual(outsider.data, [])
  const project = await newProject(users[0]!, "BRIX smoke check")
  await assert.rejects(ownProject(users[1]!, project.id))
  await changeProject(users[0]!, project.id)
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1cAAAAASUVORK5CYII=",
    "base64"
  )
  const input = {
    name: "smoke.png",
    size: bytes.length,
    contentType: "image/png",
  }
  const ticketResponse = await fetch(`${appUrl}/api/upload`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  })
  assert.equal(ticketResponse.status, 200)
  const prepared = await ticketResponse.json()
  storagePath = new URL(prepared.ticket.public_url).pathname.slice(
    "/api/media/".length
  )
  const uploaded = await fetch(prepared.ticket.upload_url, {
    method: "PUT",
    headers: prepared.ticket.upload_headers,
    body: bytes,
  })
  assert.equal(uploaded.ok, true)
  const row = await finishUpload(users[0]!, {
    ...input,
    publicUrl: prepared.ticket.public_url,
    token: prepared.token,
  })
  await assert.rejects(
    finishUpload(users[1]!, {
      ...input,
      publicUrl: prepared.ticket.public_url,
      token: prepared.token,
    })
  )
  assert.equal((await get(`/api/media/${storagePath}`)).status, 307)
  const privateRead = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/brix-media/${storagePath}`
  )
  assert.equal(privateRead.ok, false)
  assert.equal(
    (await get(`/api/media/${users[1]}/uploads/other.png`)).status,
    404
  )
  assert.equal((await get("/admin")).status, 404)
  assert.equal(
    (await get("/api/test/mailbox?to=owner@example.com")).status,
    404
  )
  for (const path of [
    "/account",
    "/assets",
    "/video",
    "/effects",
    "/templates",
  ])
    assert.equal((await get(path)).status, 200, `${path} must load`)
  assert.equal(
    (await fetch(`${appUrl}/assets`, { redirect: "manual" })).status,
    307
  )
  await removeUpload(users[0]!, row.id)
  storagePath = undefined
  console.log(
    "PASS: hosted sign-in, masked API connection, owner isolation, projects, private signed upload, authenticated media, admin denial, studio pages"
  )
} finally {
  if (storagePath)
    await service.storage.from("brix-media").remove([storagePath])
  for (const id of users) await service.auth.admin.deleteUser(id)
}
