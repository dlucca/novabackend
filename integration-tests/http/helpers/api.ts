// novabackend/integration-tests/http/helpers/api.ts

const BACKEND_URL = process.env.BACKEND_URL || "https://novapatch.care"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export { BACKEND_URL, PUBLISHABLE_KEY }

export async function getAdminToken(): Promise<string> {
  const resp = await fetch(`${BACKEND_URL}/auth/user/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.MEDUSA_ADMIN_EMAIL!,
      password: process.env.MEDUSA_ADMIN_PASSWORD!,
    }),
  })
  if (!resp.ok) throw new Error(`Admin auth failed: ${resp.status}`)
  const data = await resp.json()
  return data.token
}

export async function adminGet(path: string, token: string) {
  const resp = await fetch(`${BACKEND_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  })
  return { status: resp.status, body: await resp.json() }
}

export async function adminPost(path: string, token: string, body?: object) {
  const resp = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: resp.status, body: await resp.json() }
}

export async function adminPatch(path: string, token: string, body: object) {
  const resp = await fetch(`${BACKEND_URL}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  return { status: resp.status, body: await resp.json() }
}

export async function storePost(path: string, body?: object) {
  const resp = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: resp.status, body: await resp.json() }
}

export async function storeGet(path: string) {
  const resp = await fetch(`${BACKEND_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
  })
  return { status: resp.status, body: await resp.json() }
}

export async function createTestCart(): Promise<string> {
  const { body: productsBody } = await storeGet("/store/products?limit=1")
  const product = productsBody.products?.[0]
  if (!product) throw new Error("No products found in store")

  const variantId = product.variants?.[0]?.id
  if (!variantId) throw new Error("No variants found on product")

  const { body: regionsBody } = await storeGet("/store/regions")
  const regionId = regionsBody.regions?.[0]?.id
  if (!regionId) throw new Error("No regions found")

  const { body: cartBody } = await storePost("/store/carts", { region_id: regionId })
  const cartId = cartBody.cart?.id
  if (!cartId) throw new Error("Failed to create cart")

  await storePost(`/store/carts/${cartId}/line-items`, {
    variant_id: variantId,
    quantity: 1,
  })

  const { body: shippingBody } = await storeGet(`/store/shipping-options?cart_id=${cartId}`)
  const shippingId = shippingBody.shipping_options?.[0]?.id
  if (shippingId) {
    await storePost(`/store/carts/${cartId}/shipping-methods`, { option_id: shippingId })
  }

  return cartId
}
