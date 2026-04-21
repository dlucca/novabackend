// Returns the customer-facing ETA string for a shipping address.
// Used by the confirmation email and the checkout success screen.
//
// We intentionally derive this from the shipping address state (zone),
// NOT from Envia's deliveryEstimate, because the label is generated
// asynchronously after order.placed — the customer needs an immediate
// answer at checkout.

const CDMX_ALIASES = ["cdmx", "ciudad de mexico", "distrito federal", "df", "mexico city"]
const EDOMEX_ALIASES = ["estado de mexico", "mexico", "edo. mex.", "edomex", "edo de mexico"]

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .trim()
}

export function resolveShippingEta(address: { country_code?: string | null; province?: string | null }): string {
  const country = (address.country_code ?? "").toLowerCase()
  if (country !== "mx") return ""

  const province = normalize(address.province ?? "")
  if (!province) return "3-5 días hábiles"

  if (CDMX_ALIASES.includes(province) || EDOMEX_ALIASES.includes(province)) {
    return "2-3 días hábiles"
  }

  return "3-5 días hábiles"
}
