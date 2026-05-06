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

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { estado, motivo_rechazo } = req.body as {
    estado: string
    motivo_rechazo?: string
  }

  if (!estado || !VALID_TARGETS.includes(estado as ValidTarget)) {
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

  const allowed = ALLOWED_TRANSITIONS[current.estado] ?? []
  if (current.estado !== estado && !allowed.includes(estado)) {
    return res.status(409).json({
      error: `Transición inválida: ${current.estado} → ${estado}`,
      hint: current.estado === "enviado"
        ? "La postulación ya tiene muestras enviadas y no puede modificarse."
        : `Transiciones permitidas desde ${current.estado}: ${allowed.join(", ") || "ninguna"}`,
    })
  }

  // Build the patch. We set timestamps the FIRST time we hit a state, but
  // leave them untouched on re-entry so the audit trail keeps the original
  // moment (e.g. if you revert→re-approve, aprobado_en stays as the first time).
  const patch: Record<string, unknown> = { id, estado }

  if (estado === "aprobado" && !current.aprobado_en) {
    patch.aprobado_en = new Date()
  }
  if (estado === "rechazado") {
    if (!current.rechazado_en) patch.rechazado_en = new Date()
    if (motivo_rechazo !== undefined) patch.motivo_rechazo = motivo_rechazo || null
  }

  const [updated] = await influencerService.updateInfluencerApplications([
    patch as any,
  ])

  return res.json({ influencer_application: updated })
}
