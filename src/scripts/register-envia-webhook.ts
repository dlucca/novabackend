// src/scripts/register-envia-webhook.ts
// Usage: WEBHOOK_URL=https://your-backend.railway.app/webhooks/envia npx medusa exec ./src/scripts/register-envia-webhook.ts

export default async function registerEnviaWebhook() {
  const queriesUrl = process.env.ENVIA_QUERIES_URL
  const token = process.env.ENVIA_API_TOKEN
  const webhookUrl = process.env.WEBHOOK_URL

  if (!queriesUrl) throw new Error("ENVIA_QUERIES_URL env var is not set")
  if (!token) throw new Error("ENVIA_API_TOKEN env var is not set")
  if (!webhookUrl) throw new Error("WEBHOOK_URL env var is not set (e.g. https://your-backend.railway.app/webhooks/envia)")

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }

  // Step 1: Discover available webhook type IDs
  console.log("Fetching available webhook types...")
  const typesRes = await fetch(`${queriesUrl}/webhook-types`, { headers })
  const typesBody = (await typesRes.json()) as { data: Array<{ id: number; name: string; description: string }> }
  console.log("Available types:", JSON.stringify(typesBody.data, null, 2))

  // Pick the tracking event type — inspect the list above and set the correct ID.
  const trackingType = typesBody.data?.find(
    (t) => t.name?.toLowerCase().includes("track") || t.description?.toLowerCase().includes("track")
  )
  if (!trackingType) {
    console.error("Could not auto-detect tracking webhook type. Set TYPE_ID env var manually.")
    console.error("Available types:", typesBody.data)
    process.exit(1)
  }

  const typeId = process.env.ENVIA_WEBHOOK_TYPE_ID
    ? parseInt(process.env.ENVIA_WEBHOOK_TYPE_ID, 10)
    : trackingType.id

  console.log(`Using webhook type_id=${typeId} (${trackingType.name})`)
  console.log(`Registering URL: ${webhookUrl}`)

  // Step 2: Register the webhook
  const regRes = await fetch(`${queriesUrl}/webhooks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type_id: typeId,
      url: webhookUrl,
      active: 1,
    }),
  })

  const regBody = await regRes.json()

  if (!regRes.ok) {
    console.error("Failed to register webhook:", regBody)
    process.exit(1)
  }

  console.log("Webhook registered successfully!")
  console.log("Response:", JSON.stringify(regBody, null, 2))
  console.log("")
  console.log("Save the webhook ID to your env vars:")
  console.log(`  ENVIA_WEBHOOK_ID=${(regBody as any).data?.id ?? "<id from response>"}`)
}
