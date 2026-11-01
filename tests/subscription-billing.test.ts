import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"

const owner = "11111111-1111-4111-8111-111111111111"
const other = "22222222-2222-4222-8222-222222222222"
let database: PGlite

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
  for (const name of [
    "202610130002_runtime.sql",
    "202610130003_admin_catalog.sql",
    "202611010001_openrouter.sql",
    "202611010002_subscription.sql",
    "202611010003_platform_connections.sql",
    "202611010004_manual_model_prices.sql",
  ]) {
    await database.exec(
      await readFile(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        "utf8"
      )
    )
  }
  await database.query("select public.brix_subscription_pricing($1)", [
    {
      markupPercent: 30,
      creditUsd: 0.01,
      modelMarkups: {},
      fixedCredits: { test: 13 },
      rateUnits: { test: "generation" },
    },
  ])
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

const key = "33333333-3333-4333-8333-333333333333"
const job = {
  submit_key: key,
  surface: "image",
  model_id: "test",
  model_label: "Test",
  model_path: "test",
  settings: {},
  input_media: [],
  aspect: 1,
}
async function quote() {
  const q = await database.query<{ version: string }>(
    "select version from brix_private.subscription_pricing"
  )
  return {
    credits: 13,
    usd: 0.13,
    providerUsd: 0.1,
    modelId: "test",
    priceVersion: q.rows[0].version,
    unit: "generation",
    quantity: 1,
  }
}
async function reserve() {
  return database.query<{ result: { id: string; created: boolean } }>(
    "select public.brix_start_subscription_generation($1,$2,$3,$4) as result",
    [owner, job, {}, await quote()]
  )
}
describe("subscription credit integrity", () => {
  it("restricts private tables and credit RPCs", async () => {
    await database.exec("set role authenticated")
    await expect(
      database.query("select public.brix_subscription_account($1)", [owner])
    ).rejects.toThrow(/permission denied/)
    await expect(
      database.query("select * from brix_private.credit_ledger")
    ).rejects.toThrow(/permission denied/)
  })
  it("applies duplicate Stripe events and invoices only once", async () => {
    await database.query(
      "select public.brix_subscription_account($1,'cus_test')",
      [owner]
    )
    const payload = {
      userId: owner,
      customerId: "cus_test",
      credits: 20,
      bucket: "topup",
      reference: "checkout:one",
      eventId: "evt_one",
      eventCreated: 1,
    }
    for (const p of [payload, payload, { ...payload, eventId: "evt_two" }])
      await database.query("select public.brix_subscription_stripe_event($1)", [
        p,
      ])
    expect(
      (
        await database.query<{ topup: number }>(
          "select topup from brix_private.billing_accounts where user_id=$1",
          [owner]
        )
      ).rows[0].topup
    ).toBe(20)
  })
  it("serializes duplicate reservations, never overspends, refunds once", async () => {
    const results = await Promise.all([reserve(), reserve()])
    expect(results.map((r) => r.rows[0].result.created).sort()).toEqual([
      false,
      true,
    ])
    const id = results[0].rows[0].result.id
    await expect(
      database.query(
        "select public.brix_start_subscription_generation($1,$2,$3,$4)",
        [owner, { ...job, submit_key: other }, {}, await quote()]
      )
    ).rejects.toThrow(/Not enough credits/)
    await expect(
      database.query(
        "select public.brix_settle_subscription_generation($1,'failed')",
        [id]
      )
    ).rejects.toThrow(/not terminal/)
    await database.query(
      "update public.brix_generations set status='failed' where id=$1",
      [id]
    )
    await Promise.all(
      [1, 2].map(() =>
        database.query(
          "select public.brix_settle_subscription_generation($1,'failed')",
          [id]
        )
      )
    )
    expect(
      (
        await database.query<{ topup: number }>(
          "select topup from brix_private.billing_accounts where user_id=$1",
          [owner]
        )
      ).rows[0].topup
    ).toBe(20)
    expect(
      (
        await database.query(
          "select * from brix_private.credit_ledger where reference=$1",
          [`refund:${id}`]
        )
      ).rows
    ).toHaveLength(1)
    await expect(
      database.query("delete from brix_private.credit_ledger")
    ).rejects.toThrow(/immutable/)
  })
  it("rejects old pricing versions and unpriced variable-cost models", async () => {
    await expect(
      database.query(
        "select public.brix_start_subscription_generation($1,$2,$3,$4)",
        [
          owner,
          { ...job, submit_key: other },
          {},
          { ...(await quote()), priceVersion: other },
        ]
      )
    ).rejects.toThrow(/Price changed/)
    await expect(
      database.query(
        "select public.brix_start_subscription_generation($1,$2,$3,$4)",
        [
          owner,
          { ...job, model_id: "unpriced", submit_key: other },
          {},
          { ...(await quote()), modelId: "unpriced", providerUsd: null },
        ]
      )
    ).rejects.toThrow(/customer price/)
  })
  it("old events cannot regress a canceled subscription", async () => {
    const payload = {
      userId: owner,
      customerId: "cus_test",
      subscriptionId: "sub_test",
      eventId: "evt_cancel",
      eventCreated: 100,
      plan: "free",
      status: "canceled",
    }
    await database.query("select public.brix_subscription_stripe_event($1)", [
      payload,
    ])
    await database.query("select public.brix_subscription_stripe_event($1)", [
      {
        ...payload,
        eventId: "evt_old",
        eventCreated: 99,
        plan: "plus",
        status: "active",
      },
    ])
    expect(
      (
        await database.query<{ status: string }>(
          "select status from brix_private.billing_accounts where user_id=$1",
          [owner]
        )
      ).rows[0].status
    ).toBe("canceled")
  })
  it("annual allowance grants only due months and deduplicates refills", async () => {
    const start = Math.floor(Date.now() / 1000) - 45 * 86400
    const payload = {
      userId: owner,
      customerId: "cus_test",
      subscriptionId: "sub_annual",
      eventId: "evt_annual",
      eventCreated: 101,
      plan: "starter",
      status: "active",
      credits: 1000,
      bucket: "subscription",
      reference: "invoice:annual",
      annual: true,
      periodStart: start,
      periodEnd: start + 365 * 86400,
    }
    await database.query("select public.brix_subscription_stripe_event($1)", [
      payload,
    ])
    await Promise.all(
      [1, 2].map(() =>
        database.query("select public.brix_refill_subscription_allowances()")
      )
    )
    expect(
      (
        await database.query<{ subscription: number }>(
          "select subscription from brix_private.billing_accounts where user_id=$1",
          [owner]
        )
      ).rows[0].subscription
    ).toBe(2000)
    expect(
      (
        await database.query(
          "select * from brix_private.credit_ledger where reference like 'annual-refill:%'"
        )
      ).rows
    ).toHaveLength(1)
  })
})

describe("subscription admin price and review state", () => {
  it("supports a fixed price on a token model and preserves it in reservations", async () => {
    await database.query("select public.brix_subscription_pricing($1)", [
      {
        markupPercent: 30,
        creditUsd: 0.01,
        modelMarkups: {},
        fixedCredits: { test: 5 },
      },
    ])
    const current = await quote()
    const result = await database.query<{ result: { id: string } }>(
      "select public.brix_start_subscription_generation($1,$2,$3,$4) as result",
      [
        owner,
        { ...job, submit_key: "44444444-4444-4444-8444-444444444444" },
        {},
        { ...current, providerUsd: null, credits: 5 },
      ]
    )
    expect(
      (
        await database.query<{ credit_cost: number }>(
          "select credit_cost from public.brix_generations where id=$1",
          [result.rows[0].result.id]
        )
      ).rows[0].credit_cost
    ).toBe(5)
  })
  it("flags refunded payments for owner review without an unsafe balance change", async () => {
    const before = (
      await database.query(
        "select subscription,topup from brix_private.billing_accounts where user_id=$1",
        [owner]
      )
    ).rows
    const payload = {
      userId: owner,
      customerId: "cus_test",
      eventId: "evt_refund",
      eventCreated: 102,
      billingReview: "Refund ch_test needs manual credit review",
    }
    await database.query("select public.brix_subscription_stripe_event($1)", [
      payload,
    ])
    await database.query("select public.brix_subscription_stripe_event($1)", [
      payload,
    ])
    expect(
      (
        await database.query(
          "select subscription,topup from brix_private.billing_accounts where user_id=$1",
          [owner]
        )
      ).rows
    ).toEqual(before)
    expect(
      (
        await database.query<{ reviews: { review: string }[] }>(
          "select public.brix_subscription_billing_reviews() as reviews"
        )
      ).rows[0].reviews[0].review
    ).toContain("ch_test")
  })
})

describe("trusted plan concurrency", () => {
  it("allows two Starter videos, then blocks a client-supplied higher plan", async () => {
    await database.query("select public.brix_subscription_pricing($1)", [
      {
        markupPercent: 30,
        creditUsd: 0.01,
        modelMarkups: {},
        fixedCredits: { test: 1 },
      },
    ])
    await database.query("select public.brix_subscription_stripe_event($1)", [
      {
        userId: owner,
        customerId: "cus_test",
        eventId: "evt_starter_cap",
        eventCreated: 300,
        plan: "starter",
        status: "active",
        subscriptionId: "sub_starter",
        credits: 100,
        bucket: "topup",
        reference: "checkout:startercap",
      },
    ])
    const current = { ...(await quote()), credits: 1 }
    for (let n = 0; n < 2; n++)
      await database.query(
        "select public.brix_start_subscription_generation($1,$2,$3,$4)",
        [
          owner,
          { ...job, surface: "video", submit_key: randomUUID() },
          {},
          current,
        ]
      )
    await expect(
      database.query(
        "select public.brix_start_subscription_generation($1,$2,$3,$4)",
        [
          owner,
          { ...job, surface: "video", submit_key: randomUUID(), plan: "ultra" },
          {},
          current,
        ]
      )
    ).rejects.toThrow(/active generation on this surface/)
  })
  it("allows eight Plus images and ignores a client plan when enforcing the ninth", async () => {
    await database.query(
      "select public.brix_subscription_account($1,'cus_plus')",
      [other]
    )
    await database.query("select public.brix_subscription_stripe_event($1)", [
      {
        userId: other,
        customerId: "cus_plus",
        eventId: "evt_plus_cap",
        eventCreated: 300,
        plan: "plus",
        status: "active",
        subscriptionId: "sub_plus",
        credits: 100,
        bucket: "topup",
        reference: "checkout:pluscap",
      },
    ])
    const current = { ...(await quote()), credits: 1 }
    for (let n = 0; n < 8; n++)
      await database.query(
        "select public.brix_start_subscription_generation($1,$2,$3,$4)",
        [other, { ...job, submit_key: randomUUID() }, {}, current]
      )
    await expect(
      database.query(
        "select public.brix_start_subscription_generation($1,$2,$3,$4)",
        [
          other,
          { ...job, submit_key: randomUUID(), plan: "ultra" },
          {},
          current,
        ]
      )
    ).rejects.toThrow(/active generation on this surface/)
    expect(
      (
        await database.query<{ topup: number }>(
          "select topup from brix_private.billing_accounts where user_id=$1",
          [other]
        )
      ).rows[0].topup
    ).toBe(92)
  })
})

describe("manual per-model rate billing", () => {
  it("scales by verified batch size and seconds and rejects tampered quantity", async () => {
    const uid = randomUUID()
    await database.query("insert into auth.users(id) values($1)", [uid])
    await database.query(
      "select public.brix_subscription_account($1,'cus_units')",
      [uid]
    )
    await database.query("select public.brix_subscription_stripe_event($1)", [
      {
        userId: uid,
        customerId: "cus_units",
        eventId: "evt_unitfund",
        eventCreated: 500,
        plan: "ultra",
        status: "active",
        subscriptionId: "sub_units",
        credits: 100,
        bucket: "topup",
        reference: "checkout:unitfund",
      },
    ])
    const settings = {
      markupPercent: 999,
      creditUsd: 0.01,
      modelMarkups: { unpriced: 900 },
      fixedCredits: { test: 3 },
      rateUnits: { test: "image" },
    }
    await database.query("select public.brix_subscription_pricing($1)", [
      settings,
    ])
    const unitJob = { ...job, submit_key: randomUUID() }
    const q = { ...(await quote()), unit: "image", quantity: 4, credits: 12 }
    await database.query(
      "select public.brix_start_subscription_generation($1,$2,$3,$4)",
      [uid, unitJob, { batch_size: 4 }, q]
    )
    await expect(
      database.query(
        "select public.brix_start_subscription_generation($1,$2,$3,$4)",
        [
          uid,
          { ...job, submit_key: randomUUID() },
          { batch_size: 4 },
          { ...q, quantity: 1, credits: 3 },
        ]
      )
    ).rejects.toThrow(/Price changed/)
    await expect(
      database.query(
        "select public.brix_start_subscription_generation($1,$2,$3,$4)",
        [
          uid,
          { ...job, submit_key: randomUUID(), model_id: "unpriced" },
          {},
          { ...q, modelId: "unpriced" },
        ]
      )
    ).rejects.toThrow(/set a customer price/)
    await database.query("select public.brix_subscription_pricing($1)", [
      { ...settings, rateUnits: { test: "second" } },
    ])
    const secondsQuote = {
      ...(await quote()),
      unit: "second",
      quantity: 10,
      credits: 30,
    }
    await database.query(
      "select public.brix_start_subscription_generation($1,$2,$3,$4)",
      [
        uid,
        { ...job, surface: "video", submit_key: randomUUID() },
        { duration: 10 },
        secondsQuote,
      ]
    )
    await expect(
      database.query(
        "select public.brix_start_subscription_generation($1,$2,$3,$4)",
        [
          uid,
          { ...job, surface: "video", submit_key: randomUUID() },
          {},
          { ...secondsQuote },
        ]
      )
    ).rejects.toThrow(/explicit duration/)
    await expect(
      database.query(
        "select public.brix_start_subscription_generation($1,$2,$3,$4)",
        [
          uid,
          { ...job, surface: "video", submit_key: randomUUID() },
          { duration: 10, seconds: 20 },
          secondsQuote,
        ]
      )
    ).rejects.toThrow(/quantity is unclear/)
    await expect(
      database.query(
        "select public.brix_start_subscription_generation($1,$2,$3,$4)",
        [
          uid,
          { ...job, surface: "video", submit_key: randomUUID() },
          { duration: 1.00000000000001 },
          { ...secondsQuote, quantity: 1.00000000000001, credits: 4 },
        ]
      )
    ).rejects.toThrow(/three decimal places/)
    await database.query(
      "select public.brix_start_subscription_generation($1,$2,$3,$4)",
      [
        uid,
        { ...job, surface: "video", submit_key: randomUUID() },
        { duration: 1.001 },
        { ...secondsQuote, quantity: 1.001, credits: 4 },
      ]
    )
    expect(
      (
        await database.query<{ topup: number }>(
          "select topup from brix_private.billing_accounts where user_id=$1",
          [uid]
        )
      ).rows[0].topup
    ).toBe(54)
  })
  it("rejects edits from an old admin tab without losing current prices", async () => {
    const settings = {
      markupPercent: 30,
      creditUsd: 0.01,
      modelMarkups: {},
      fixedCredits: { test: 9 },
      rateUnits: { test: "generation" },
    }
    await database.query("select public.brix_subscription_pricing($1)", [
      settings,
    ])
    const oldVersion = (await quote()).priceVersion
    await database.query("select public.brix_subscription_pricing($1)", [
      { ...settings, fixedCredits: { test: 11 } },
    ])
    await expect(
      database.query("select public.brix_subscription_pricing($1)", [
        { ...settings, expectedVersion: oldVersion },
      ])
    ).rejects.toThrow(/another tab/)
    expect(
      (
        await database.query<{ credits: number }>(
          "select (fixed_credits->>'test')::integer as credits from brix_private.subscription_pricing"
        )
      ).rows[0].credits
    ).toBe(11)
  })
})

const stripeMocks = vi.hoisted(() => ({
  listLineItems: vi.fn(),
  list: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({ rpc: stripeMocks.rpc }),
}))
vi.mock("@/lib/billing/stripe", () => ({
  stripe: () => ({
    checkout: {
      sessions: {
        listLineItems: stripeMocks.listLineItems,
        list: stripeMocks.list,
      },
    },
  }),
  topupPriceId: () => "price_small",
  planPriceId: () => "price_plan",
  planForPriceId: () => undefined,
  idOf: (value: unknown) => (typeof value === "string" ? value : undefined),
}))

describe("verified Stripe checkout grants", () => {
  it("rejects a paid checkout with mismatched money before applying credits", async () => {
    const { handleSubscriptionStripeEvent } =
      await import("@/lib/supabase/subscription-billing")
    stripeMocks.listLineItems.mockResolvedValue({
      data: [{ price: { id: "price_small" }, quantity: 1 }],
    })
    const event = {
      id: "evt_bad",
      created: 1,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_bad",
          mode: "payment",
          payment_status: "paid",
          metadata: { kind: "topup", pack: "small", credits: "500" },
          client_reference_id: owner,
          customer: "cus_test",
          currency: "usd",
          amount_total: 1,
        },
      },
    } as unknown as import("stripe").default.Event
    await expect(handleSubscriptionStripeEvent(event)).rejects.toThrow(
      /mismatch/
    )
    expect(stripeMocks.rpc).not.toHaveBeenCalled()
  })
  it("passes a valid paid checkout into the transactional idempotency RPC", async () => {
    const { handleSubscriptionStripeEvent } =
      await import("@/lib/supabase/subscription-billing")
    stripeMocks.rpc.mockResolvedValue({ data: true, error: null })
    const event = {
      id: "evt_good",
      created: 2,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_good",
          mode: "payment",
          payment_status: "paid",
          metadata: { kind: "topup", pack: "small", credits: "500" },
          client_reference_id: owner,
          customer: "cus_test",
          currency: "usd",
          amount_total: 500,
        },
      },
    } as unknown as import("stripe").default.Event
    expect(await handleSubscriptionStripeEvent(event)).toBe("processed")
    expect(stripeMocks.rpc).toHaveBeenCalledWith(
      "brix_subscription_stripe_event",
      {
        payload: expect.objectContaining({
          eventId: "evt_good",
          credits: 500,
          reference: "checkout:cs_good",
          customerId: "cus_test",
        }),
      }
    )
  })
  it("routes a verified charge refund to manual owner review", async () => {
    const { handleSubscriptionStripeEvent } =
      await import("@/lib/supabase/subscription-billing")
    stripeMocks.list.mockResolvedValue({
      data: [{ client_reference_id: owner, customer: "cus_test" }],
    })
    const event = {
      id: "evt_charge_refund",
      created: 3,
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_test",
          payment_intent: "pi_test",
          customer: "cus_test",
          amount: 500,
          amount_refunded: 500,
          currency: "usd",
        },
      },
    } as unknown as import("stripe").default.Event
    expect(await handleSubscriptionStripeEvent(event)).toBe("processed")
    expect(stripeMocks.rpc).toHaveBeenLastCalledWith(
      "brix_subscription_stripe_event",
      {
        payload: expect.objectContaining({
          eventId: "evt_charge_refund",
          customerId: "cus_test",
          billingReview: expect.stringContaining("ch_test"),
        }),
      }
    )
  })
})

describe("server manual customer quotes", () => {
  it("uses the same fractional-second credit total as SQL and never markup fallback", async () => {
    const { quoteSubscriptionCost } =
      await import("@/lib/supabase/subscription-billing")
    const settings = {
      version: owner,
      markup_percent: 30,
      credit_usd: 0.01,
      model_markups: { unpriced: 999 },
      fixed_credits: { test: 3 },
      rate_units: { test: "second" },
    }
    stripeMocks.rpc.mockResolvedValue({ data: settings, error: null })
    expect(
      await quoteSubscriptionCost(owner, "test", 0.01, { duration: 1.001 })
    ).toMatchObject({ credits: 4, usd: 0.04, unit: "second", quantity: 1.001 })
    await expect(
      quoteSubscriptionCost(owner, "unpriced", 0.01, {})
    ).rejects.toThrow(/set a customer price/)
    await expect(
      quoteSubscriptionCost(owner, "test", 0.01, { duration: 1.00000000000001 })
    ).rejects.toThrow(/three decimal places/)
  })
})
