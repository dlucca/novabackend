type SendEmailParams = {
  to: string
  subject: string
  html: string
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn("[Resend] RESEND_API_KEY not set — skipping email to", params.to)
    return
  }

  const from = process.env.RESEND_FROM_EMAIL ?? "Novapatch <hola@novapatch.mx>"

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  })

  if (!response.ok) {
    let message = `Resend error ${response.status}`
    try {
      const body = (await response.json()) as { message?: string; name?: string }
      if (body.message) message = body.message
    } catch { /* non-JSON body */ }
    throw new Error(message)
  }
}
