import "./load-env"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import {
  createSupabaseServiceClient,
  createSupabaseVerificationClient,
} from "../lib/supabase/server"
const base = process.env.BRIX_CHECK_URL ?? "http://localhost:3000"
const service = createSupabaseServiceClient()
const email = `brix-password-check-${randomUUID()}@example.com`
const password = randomUUID() + "aA1!"
const replacement = randomUUID() + "bB2!"
const jar: Record<string, string> = {}
let id: string | undefined
function cookies(response: Response) {
  for (const c of response.headers.getSetCookie()) {
    const pair = c.split(";")[0]!
    const at = pair.indexOf("=")
    jar[pair.slice(0, at)] = pair.slice(at + 1)
  }
}
async function request(path: string, options: RequestInit = {}) {
  const result = await fetch(base + path, {
    ...options,
    redirect: "manual",
    headers: {
      origin: base,
      cookie: Object.entries(jar)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
      ...options.headers,
    },
  })
  cookies(result)
  return result
}
async function actionIds() {
  if (!process.env.BRIX_CHECK_URL) {
    await request("/login")
    return Object.fromEntries(
      Object.entries(
        JSON.parse(
          await readFile(
            ".next/dev/server/server-reference-manifest.json",
            "utf8"
          )
        ).node
      ).map(([key, value]) => [
        (value as { exportedName: string }).exportedName,
        key,
      ])
    )
  }
  const html = await (await request("/login")).text()
  let urls = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
    (m) => new URL(m[1]!, base).href
  )
  const seen = new Set<string>()
  const result: Record<string, string> = {}
  for (let depth = 0; depth < 2; depth++) {
    const batch = urls.filter((u) => !seen.has(u))
    urls = []
    for (const u of batch) seen.add(u)
    const scripts = await Promise.all(
      batch.map(async (u) => ({ u, body: await (await fetch(u)).text() }))
    )
    for (const { u, body } of scripts) {
      for (const m of body.matchAll(
        /([a-f0-9]{42})"[^;]{0,180}"(loginPasswordAction|setPasswordAction|signOutAction)"/g
      ))
        result[m[2]!] = m[1]!
      urls.push(
        ...[...body.matchAll(/["'](\.\/[^"']+\.js)["']/g)].map(
          (m) => new URL(m[1]!, u).href
        )
      )
    }
  }
  // Compile reset form's public action reference too.
  const resetHtml = await (
    await request(`/login/reset-password?token_hash=${"a".repeat(64)}`)
  ).text()
  const resetUrls = [...resetHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
    (m) => new URL(m[1]!, base).href
  )
  for (const u of resetUrls) {
    const body = await (await fetch(u)).text()
    for (const m of body.matchAll(
      /([a-f0-9]{42})"[^;]{0,180}"(setPasswordAction)"/g
    ))
      result[m[2]!] = m[1]!
  }
  return result
}
try {
  const { data, error } = await service.auth.admin.generateLink({
    type: "signup",
    email,
    password,
  })
  assert.ifError(error)
  assert(data.user)
  assert(data.properties)
  id = data.user.id
  assert(!data.user.email_confirmed_at)
  assert(
    (
      await createSupabaseVerificationClient().auth.signInWithPassword({
        email,
        password,
      })
    ).error
  )
  const verified = await request(
    `/auth/confirm?token_hash=${data.properties.hashed_token}&type=signup&next=/account`
  )
  assert.equal(verified.status, 307)
  assert.equal(new URL(verified.headers.get("location")!).pathname, "/login")
  assert.equal((await (await request("/api/me")).json()).user, null)
  const replay = await request(
    `/auth/confirm?token_hash=${data.properties.hashed_token}&type=signup`
  )
  assert(new URL(replay.headers.get("location")!).pathname.includes("error"))
  const ids = await actionIds()
  const call = async (name: string, args: unknown[]) => {
    assert(ids[name], `${name} reference is available`)
    const response = await request(
      name === "setPasswordAction" ? "/login/reset-password" : "/login",
      {
        method: "POST",
        headers: {
          "Next-Action": ids[name]!,
          "content-type": "text/plain;charset=UTF-8",
        },
        body: JSON.stringify(args),
      }
    )
    const text = await response.text()
    return { response, text }
  }
  assert(
    (
      await call("loginPasswordAction", [
        { email, password: "incorrect-password" },
      ])
    ).text.includes('"ok":false')
  )
  assert(
    (
      await call("loginPasswordAction", [
        { email, password, callbackUrl: "/account" },
      ])
    ).text.includes('"ok":true')
  )
  assert.equal((await (await request("/api/me")).json()).user.id, id)
  await call("signOutAction", [])
  assert.equal((await (await request("/api/me")).json()).user, null)
  assert(
    (await call("loginPasswordAction", [{ email, password }])).text.includes(
      '"ok":true'
    )
  )
  assert.equal((await (await request("/api/me")).json()).user.id, id)
  assert.ifError(
    (await service.from("brix_profiles").update({ role: "admin" }).eq("id", id))
      .error
  )
  const { data: recovery, error: recoveryError } =
    await service.auth.admin.generateLink({ type: "recovery", email })
  assert.ifError(recoveryError)
  assert(recovery.properties)
  await request(
    `/login/reset-password?token_hash=${recovery.properties.hashed_token}`
  )
  const updatedIds = await actionIds()
  Object.assign(ids, updatedIds)
  assert(
    (
      await call("setPasswordAction", [
        {
          tokenHash: recovery.properties.hashed_token,
          password: replacement,
          confirmPassword: replacement,
        },
      ])
    ).text.includes('"ok":true')
  )
  assert.equal((await (await request("/api/me")).json()).user, null)
  assert(
    (
      await call("setPasswordAction", [
        {
          tokenHash: recovery.properties.hashed_token,
          password: password,
          confirmPassword: password,
        },
      ])
    ).text.includes('"ok":false')
  )
  assert(
    (await call("loginPasswordAction", [{ email, password }])).text.includes(
      '"ok":false'
    )
  )
  assert(
    (
      await call("loginPasswordAction", [{ email, password: replacement }])
    ).text.includes('"ok":true')
  )
  assert.equal((await (await request("/api/me")).json()).user.role, "admin")
  assert.equal((await request("/admin")).status, 200)
  console.log(
    "PASS: verification without browser login, token replay rejection, wrong password rejection, login/logout/relogin, password reset, old password rejection, preserved admin role"
  )
} finally {
  if (id) await service.auth.admin.deleteUser(id)
}
