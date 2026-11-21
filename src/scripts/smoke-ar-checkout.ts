/**
 * Smoke test: end-to-end Argentina (MercadoPago) checkout over HTTP.
 *
 * Mirrors exactly what the storefront does, so it isolates whether a checkout
 * problem is in the backend or in the frontend wiring. It hits the real store
 * API + the custom /payment-sessions and /complete routes against a RUNNING
 * server (local dev or staging), generating a MercadoPago TEST card token
 * server-side so no browser SDK is needed.
 *
 * Node 24 runs this directly via native TypeScript type-stripping — no build
 * step. It uses only the global `fetch`; it does NOT boot Medusa, so point it
 * at a server that is already up.
 *
 * Run (local dev server on :9000):
 *   node src/scripts/smoke-ar-checkout.ts
 *
 * Run against staging:
 *   BASE_URL=https://<staging-host> node src/scripts/smoke-ar-checkout.ts
 *
 * Env (all optional — defaults target the current Railway data):
 *   BASE_URL            default http://localhost:9000
 *   MP_ACCESS_TOKEN     MercadoPago AR test access token (required; read from .env)
 *   PUBLISHABLE_KEY     x-publishable-api-key (default = "Storefront" key)
 *   AR_REGION_ID        default reg_01KP4XCXCFX44HTA01WVC885V2
 *   VARIANT_ID          default energy-monthly variant
 *   SALES_CHANNEL_ID    default Default Sales Channel
 *   SHIPPING_OPTION_ID  default "Envío estándar AR"
 *   MP_CARD_HOLDER      test-card outcome driver: APRO=approved (default),
 *                       OTHE=rejected, CONT=pending, etc.
 */

// ── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = (process.env.BASE_URL ?? "http://localhost:9000").replace(/\/$/, "")
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN ?? ""
const PUBLISHABLE_KEY =
  process.env.PUBLISHABLE_KEY ??
  "pk_1d4af25f8e704c4c53d0e99193a26ce0b09523c6583b67b373d55a14057d1fcb"
const AR_REGION_ID = process.env.AR_REGION_ID ?? "reg_01KP4XCXCFX44HTA01WVC885V2"
const VARIANT_ID = process.env.VARIANT_ID ?? "variant_01KNAF09MHT7KJ5TKS2VXWFQC4"
const SALES_CHANNEL_ID = process.env.SALES_CHANNEL_ID ?? "sc_01KNADXJNBPXSMEJ6DNMY9HV77"
const SHIPPING_OPTION_ID =
  process.env.SHIPPING_OPTION_ID ?? "so_01KPPR5B6XB7FKHYJEVTQVEVSE"
const MP_CARD_HOLDER = process.env.MP_CARD_HOLDER ?? "APRO"
const SMOKE_EMAIL = "smoke-test@novapatch.care"

// MercadoPago AR sandbox test card (Mastercard). Outcome is driven by the
// cardholder name (APRO/OTHE/CONT/...), not the number.
const TEST_CARD = {
  card_number: "5031755734530604",
  expiration_month: 11,
  expiration_year: 2030,
  security_code: "123",
}

type Json = Record<string, any>

const storeHeaders = {
  "Content-Type": "application/json",
  "x-publishable-api-key": PUBLISHABLE_KEY,
}

let step = 0
function log(msg: string) {
  console.log(`\n[${++step}] ${msg}`)
}
function ok(msg: string) {
  console.log(`    ✓ ${msg}`)
}
function fail(msg: string, detail?: unknown): never {
  console.error(`\n    ✗ ${msg}`)
  if (detail !== undefined) console.error(detail)
  process.exit(1)
}

async function api(method: string, path: string, body?: Json, headers = storeHeaders): Promise<Json> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    return fail(
      `Network error calling ${method} ${path}. Is the server up at ${BASE_URL}?`,
      err instanceof Error ? err.message : String(err)
    )
  }
  const text = await res.text()
  let parsed: Json = {}
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = { raw: text }
  }
  if (!res.ok) {
    return fail(`${method} ${path} → HTTP ${res.status}`, parsed)
  }
  return parsed
}

// ── MercadoPago card token (server-side, test mode) ───────────────────────────
async function createCardToken(): Promise<string> {
  const res = await fetch("https://api.mercadopago.com/v1/card_tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      ...TEST_CARD,
      cardholder: {
        name: MP_CARD_HOLDER,
        identification: { type: "DNI", number: "12345678" },
      },
    }),
  })
  const data = (await res.json()) as Json
  if (!res.ok || !data.id) {
    return fail("MercadoPago card_tokens failed", data)
  }
  if (data.live_mode === true) {
    return fail("Refusing to run: MercadoPago token is LIVE mode, not test. Use a TEST access token.")
  }
  return data.id as string
}

// ── Flow ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(70))
  console.log("Novapatch — Argentina checkout smoke test")
  console.log(`  BASE_URL=${BASE_URL}`)
  console.log(`  region=${AR_REGION_ID} variant=${VARIANT_ID}`)
  console.log(`  card holder=${MP_CARD_HOLDER} (APRO=approve, OTHE=reject)`)
  console.log("=".repeat(70))

  if (!MP_ACCESS_TOKEN) {
    fail("MP_ACCESS_TOKEN is not set. Export it or run with the backend .env loaded.")
  }

  log("Generating MercadoPago TEST card token")
  const mpToken = await createCardToken()
  ok(`token=${mpToken}`)

  log("Creating AR cart")
  const cartRes = await api("POST", "/store/carts", {
    region_id: AR_REGION_ID,
    sales_channel_id: SALES_CHANNEL_ID,
    email: SMOKE_EMAIL,
    metadata: { smoke_test: true },
  })
  const cartId: string = cartRes.cart?.id
  if (!cartId) fail("No cart id returned", cartRes)
  ok(`cart=${cartId} currency=${cartRes.cart?.currency_code}`)
  if (cartRes.cart?.currency_code !== "ars") {
    fail(`Cart currency is ${cartRes.cart?.currency_code}, expected ars — wrong region?`)
  }

  log("Adding line item")
  const itemRes = await api("POST", `/store/carts/${cartId}/line-items`, {
    variant_id: VARIANT_ID,
    quantity: 1,
  })
  const items = itemRes.cart?.items ?? []
  ok(`items=${items.length} subtotal=${itemRes.cart?.subtotal} ${itemRes.cart?.currency_code}`)
  if (items.length === 0) fail("Line item was not added", itemRes)

  log("Setting email + AR shipping address")
  await api("POST", `/store/carts/${cartId}`, {
    email: SMOKE_EMAIL,
    shipping_address: {
      first_name: "Smoke",
      last_name: "Test",
      address_1: "Av. Corrientes 1234",
      city: "Buenos Aires",
      province: "CABA",
      postal_code: "1043",
      country_code: "ar",
      phone: "1122334455",
    },
  })
  ok("address set")

  log("Adding AR shipping method")
  try {
    await api("POST", `/store/carts/${cartId}/shipping-methods`, {
      option_id: SHIPPING_OPTION_ID,
    })
    ok(`shipping option ${SHIPPING_OPTION_ID} added`)
  } catch {
    // api() exits on failure; this catch is unreachable, kept for intent clarity.
  }

  log("POST /payment-sessions (selects MercadoPago for ars)")
  const psRes = await api("POST", `/store/carts/${cartId}/payment-sessions`)
  const sessions = psRes.cart?.payment_collection?.payment_sessions ?? []
  const providerIds = sessions.map((s: Json) => s.provider_id)
  // Known backend quirk: this route returns the payment_collection queried
  // BEFORE the session is created, so payment_sessions is often an empty []
  // even on success. The session really exists and /complete reads it from the
  // DB, so we do not hard-fail here — /complete is the authoritative check.
  if (providerIds.includes("pp_mercadopago_mercadopago")) {
    ok(`payment_sessions providers=[${providerIds.join(", ")}]`)
  } else {
    ok(
      `collection=${psRes.cart?.payment_collection?.id} amount=${psRes.cart?.payment_collection?.amount} ` +
        `(response omits the freshly-created session — stale payload, continuing)`
    )
  }

  log("POST /complete with mp_card_token")
  const completeRes = await api("POST", `/store/carts/${cartId}/complete`, {
    mp_card_token: mpToken,
    email: SMOKE_EMAIL,
  })

  if (completeRes.type === "redirect") {
    fail(
      "Checkout returned a 3DS redirect — this main-branch flow charges direct. " +
        "Use an APRO test card that does not trigger 3DS.",
      completeRes
    )
  }

  const order = completeRes.order ?? completeRes
  const orderId = order?.id
  if (!orderId || !String(orderId).startsWith("order")) {
    fail("Cart completion did not return an order", completeRes)
  }

  console.log("\n" + "=".repeat(70))
  console.log("✅ SUCCESS — Argentina checkout completed")
  console.log(`   order_id     = ${orderId}`)
  console.log(`   display_id   = ${order.display_id ?? "n/a"}`)
  console.log(`   total        = ${order.total ?? "n/a"} ${order.currency_code ?? ""}`)
  console.log(`   email        = ${order.email ?? SMOKE_EMAIL}`)
  console.log(`   payment      = ${order.payment_status ?? "n/a"}`)
  console.log("=".repeat(70))
  console.log(
    "\nNote: this created a REAL order in the target DB. If BASE_URL points at\n" +
      "staging/prod, clean it up (it is flagged metadata.smoke_test=true on the cart)."
  )
}

main().catch((err) => fail("Unexpected error", err instanceof Error ? err.stack : err))
