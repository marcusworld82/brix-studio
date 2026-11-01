#!/usr/bin/env node
/** Export source only, never the running workspace or its private data. */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  copyFileSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim()
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== "--out"))
  throw new Error("Usage: node scripts/export-editions.mjs [--out DIRECTORY]")
const output = resolve(args[1] ?? join(root, "release"))
const dirs = new Set([
  "app",
  "components",
  "emails",
  "generation",
  "lib",
  "styles",
  "supabase",
])
const roots = new Set([
  ".gitignore",
  ".vercelignore",
  "auth.ts",
  "instrumentation.ts",
  "proxy.ts",
  "next.config.ts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "postcss.config.mjs",
  "tsconfig.json",
  "eslint.config.mjs",
  "components.json",
  ".prettierrc",
  ".prettierignore",
  "vercel.json",
])
const scripts = new Set([
  "scripts/check-client-secrets.mjs",
  "scripts/check-personal-setup.ts",
  "scripts/export-editions.mjs",
  "scripts/sync-models.mjs",
  "scripts/sync-live-catalog.ts",
  "scripts/load-env.ts",
])
const docs = new Set([
  "docs/personal-edition-setup.md",
  "docs/editions-handover.md",
  "docs/subscription-integration.md",
])
const examples = [
  "editions/personal.env.example",
  "editions/subscription.env.example",
]
const tracked = new Set(
  execFileSync("git", ["ls-files", "--cached", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
)
const candidates = new Set([
  ...execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" }
  )
    .split("\0")
    .filter(Boolean),
  ...examples,
])
const forbidden =
  /(^|\/)(?:\.git|\.vercel|\.next|\.data|node_modules|uploads?|privateuploads|private|credentials?|secrets?|fixtures?|__fixtures__|screenshots?|test-results|playwright-report|coverage|_research|_reference)(?:\/|$)/i
function allowed(path) {
  if (
    path.includes("\\") ||
    path.split("/").some((segment) => ["..", "."].includes(segment)) ||
    forbidden.test(path)
  )
    return false
  if (examples.includes(path)) return true
  if (/(^|\/)(?:\.env[^/]*|[^/]*\.env(?:\.[^/]*)?)$/i.test(path)) return false
  if (/\.(?:pem|key|p12|pfx|log|tsbuildinfo|sqlite|db|zip|gz|har)$/i.test(path))
    return false
  if (roots.has(path) || scripts.has(path) || docs.has(path)) return true
  if (path.startsWith("public/"))
    return (
      tracked.has(path) &&
      /\.(?:jpg|jpeg|png|webp|avif|svg|mp4|webm|woff|woff2|ttf|ico)$/i.test(
        path
      )
    )
  return (
    dirs.has(path.split("/")[0]) &&
    /\.(?:ts|tsx|mjs|js|css|json|sql|svg|d\.ts)$/i.test(path)
  )
}
const paths = [...candidates]
  .filter(allowed)
  .filter((path) => existsSync(join(root, path)))
  .sort()
for (const required of [...roots]
  .filter((path) =>
    [
      "package.json",
      "pnpm-lock.yaml",
      "next.config.ts",
      "tsconfig.json",
    ].includes(path)
  )
  .concat(examples, [...docs])) {
  if (!paths.includes(required))
    throw new Error(`Required release file missing: ${required}`)
}
const credentialPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/,
  /\bwhsec_[A-Za-z0-9]{16,}/,
  /\bsb_secret_[A-Za-z0-9_-]{12,}/,
  /\bre_[A-Za-z0-9_-]{24,}/,
  /https:\/\/[a-z0-9]{20}\.supabase\.co/i,
  /\bprj_[A-Za-z0-9]{20,}/,
]
for (const path of paths) {
  const full = join(root, path)
  if (!lstatSync(full).isFile() || lstatSync(full).isSymbolicLink())
    throw new Error(`Refusing non-regular release file: ${path}`)
  if (/\.(?:ts|tsx|mjs|js|json|sql|md|example|svg)$/.test(path)) {
    const text = readFileSync(full, "utf8")
    if (examples.includes(path)) {
      for (const line of text.split("\n")) {
        const assignment = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
        if (
          assignment &&
          /(?:SECRET|CREDENTIAL|ENCRYPTION|RESEND_KEY|SUPABASE.*KEY)/.test(
            assignment[1]
          ) &&
          assignment[2].trim()
        )
          throw new Error(
            `Nonempty credential field in ${path}: ${assignment[1]}. Value not printed.`
          )
      }
    }
    if (credentialPatterns.some((pattern) => pattern.test(text)))
      throw new Error(
        `Credential or deployment identifier pattern found in ${path}. No secret value printed.`
      )
  }
}
mkdirSync(output, { recursive: true })
const temporary = mkdtempSync(join(tmpdir(), "brix-export-"))
try {
  for (const edition of ["personal", "subscription"]) {
    const name = `brix-${edition}`
    const stage = join(temporary, name)
    mkdirSync(stage)
    for (const path of paths) {
      mkdirSync(dirname(join(stage, path)), { recursive: true })
      copyFileSync(join(root, path), join(stage, path))
    }
    copyFileSync(
      join(root, `editions/${edition}.env.example`),
      join(stage, ".env.example")
    )
    writeFileSync(
      join(stage, "README.md"),
      `# BRIX ${edition} edition\n\n${edition === "personal" ? "Customer-owned API studio. Each customer must configure their own backend and verified email sender before public use. No recurring BRIX subscription fee is configured." : "Frontend demo only. No real accounts, payments or provider generation. All financial examples are drafts."}\n\n1. Install a current supported Node.js version and pnpm.\n2. Run \`pnpm install --frozen-lockfile\`.\n3. Copy \`.env.example\` to \`.env.local\` and follow \`docs/personal-edition-setup.md\` for personal setup or \`docs/subscription-integration.md\` for the demo.\n4. Run \`pnpm exec tsx scripts/check-personal-setup.ts\`.\n5. Run \`pnpm dev\`. Open ${edition === "personal" ? "/image or /video" : "/subscription"}.\n6. Deploy only after the checks in \`docs/editions-handover.md\`. Use \`pnpm build\` and \`pnpm start\` for a production build.\n\nEdition mode: \`BRIX_EDITION=${edition}\`. Public branding variables are compiled into the browser bundle, so rebuild after changing them.\n\nThis archive includes source and curated public assets. It excludes private configuration, customer media, deployment IDs, internal notes and the internal test/fixture suite. No backend is pre-provisioned and no paid generation was performed during export.\n`
    )
    const files = [...paths, ".env.example", "README.md"].sort()
    const manifest = {
      edition,
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      sourceBranch: execFileSync("git", ["branch", "--show-current"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      files: files.map((path) => ({
        path,
        sha256: createHash("sha256")
          .update(readFileSync(join(stage, path)))
          .digest("hex"),
      })),
    }
    writeFileSync(
      join(stage, "release-manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n"
    )
    const archive = join(output, `${name}.tar.gz`)
    execFileSync("tar", ["-czf", archive, "-C", temporary, name])
    const listing = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
    for (const path of listing) {
      const relative = path.replace(`${name}/`, "").replace(/\/$/, "")
      if (!relative || (!relative.includes(".") && path.endsWith("/"))) continue
      if (
        forbidden.test(relative) ||
        (relative.includes(".env") &&
          ![".env.example", ...examples].includes(relative))
      )
        throw new Error(`Forbidden path in archive: ${relative}`)
    }
    console.log(
      `${name}: ${files.length + 1} files exported; archive path audit passed.`
    )
    console.log(archive)
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
