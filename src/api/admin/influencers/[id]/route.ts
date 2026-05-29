import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INFLUENCER_MODULE } from "../../../../modules/influencer"
import InfluencerModuleService from "../../../../modules/influencer/service"

// Allowed manual transitions. Note `enviado` is intentionally NOT reachable
// via this endpoint — it's set only by sendInfluencerSamplesWorkflow because
// shipping has side effects (Order creation, Envia label, email).
//
// "from" states that block any change at all:
//   - enviado: shipping is irreversible. The order is real, the label is
//     real, the influencer already has a tracking link. We don't want admins
//     to accidentally revert this.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pendiente: ["aprobado", "rechazado"],
  aprobado: ["pendiente", "rechazado"], // revert / change-of-mind
  rechazado: ["pendiente"],              // revert
  enviado: [],                           // terminal
  en_revision: ["aprobado", "rechazado", "pendiente"], // legacy state
}

const VALID_TARGETS = ["pendiente", "aprobado", "rechazado"] as const
type ValidTarget = (typeof VALID_TARGETS)[number]

type AddressPatch = {
  street?: string | null
  interior?: string | null
  colonia?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  instructions?: string | null
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { estado, motivo_rechazo, direccion } = req.body as {
    estado?: string
    motivo_rechazo?: string
    direccion?: AddressPatch
  }

  // Both fields are optional independently. A request with only `direccion`
  // edits the address without changing state — useful when an influencer
  // mistyped their address and Envia couldn't generate a label.
  if (estado !== undefined && !VALID_TARGETS.includes(estado as ValidTarget)) {
    return res.status(400).json({
      error: `estado debe ser uno de: ${VALID_TARGETS.join(", ")}`,
    })
  }

  const influencerService: InfluencerModuleService = req.scope.resolve(INFLUENCER_MODULE)

  // Fetch current state to validate the transition. Without this we'd allow
  // re-shipping (enviado→aprobado→re-ship) which would create a second order.
  const current = await influencerService.retrieveInfluencerApplication(id)
  if (!current) {
    return res.status(404).json({ error: "Postulación no encontrada" })
  }

  if (estado !== undefined) {
    const allowed = ALLOWED_TRANSITIONS[current.estado] ?? []
    if (current.estado !== estado && !allowed.includes(estado)) {
      return res.status(409).json({
        error: `Transición inválida: ${current.estado} → ${estado}`,
        hint: current.estado === "enviado"
          ? "La postulación ya tiene muestras enviadas y no puede modificarse."
          : `Transiciones permitidas desde ${current.estado}: ${allowed.join(", ") || "ninguna"}`,
      })
    }
  }

  // Address edits are blocked once the shipment is out — at that point the
  // label is real and the package is in transit, so changing the saved
  // address would just create a confusing audit trail.
  if (direccion !== undefined && current.estado === "enviado") {
    return res.status(409).json({
      error: "No se puede editar la dirección de una postulación ya enviada.",
    })
  }

  // Build the patch. We set timestamps the FIRST time we hit a state, but
  // leave them untouched on re-entry so the audit trail keeps the original
  // moment (e.g. if you revert→re-approve, aprobado_en stays as the first time).
  const patch: Record<string, unknown> = { id }

  if (estado !== undefined) {
    patch.estado = estado
    if (estado === "aprobado" && !current.aprobado_en) {
      patch.aprobado_en = new Date()
    }
    if (estado === "rechazado") {
      if (!current.rechazado_en) patch.rechazado_en = new Date()
      if (motivo_rechazo !== undefined) patch.motivo_rechazo = motivo_rechazo || null
    }
  }

  if (direccion !== undefined) {
    const prev = (current.direccion as AddressPatch | null) ?? {}
    patch.direccion = {
      street: direccion.street ?? prev.street ?? null,
      interior: direccion.interior ?? prev.interior ?? null,
      colonia: direccion.colonia ?? prev.colonia ?? null,
      city: direccion.city ?? prev.city ?? null,
      state: direccion.state ?? prev.state ?? null,
      zip: direccion.zip ?? prev.zip ?? null,
      instructions: direccion.instructions ?? prev.instructions ?? null,
    }
  }

  const [updated] = await influencerService.updateInfluencerApplications([
    patch as any,
  ])

  return res.json({ influencer_application: updated })
}
