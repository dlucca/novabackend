import { useState } from "react"
import {
  FocusModal,
  Button,
  Input,
  Label,
  toast,
  Heading,
  Text,
} from "@medusajs/ui"

type Props = {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function NewInfluencerModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    influencer_name: "",
    handle: "",
    code: "",
    value: "10",
    ends_at: "",
  })
  const [saving, setSaving] = useState(false)

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    if (!form.influencer_name || !form.code || !form.value || !form.ends_at) {
      toast.error("Completa todos los campos obligatorios")
      return
    }

    const code = form.code.toUpperCase().trim()
    const discountValue = parseFloat(form.value)
    if (isNaN(discountValue) || discountValue <= 0 || discountValue > 100) {
      toast.error("El descuento debe ser entre 1 y 100")
      return
    }

    setSaving(true)
    try {
      // Step 1: Create the promotion
      const promoRes = await fetch("/admin/promotions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          type: "standard",
          is_automatic: false,
          application_method: {
            type: "percentage",
            target_type: "order",
            value: discountValue,
            allocation: "across",
          },
        }),
      })

      if (!promoRes.ok) {
        const err = await promoRes.json().catch(() => ({}))
        toast.error(err?.message ?? "Error al crear la promoción")
        return
      }

      const { promotion } = await promoRes.json()

      // Step 2: Create the campaign and link the promotion
      const campaignRes = await fetch("/admin/campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // INF|Name|@handle encodes influencer info — parsed by the admin UI
          name: `INF|${form.influencer_name.trim()}|${form.handle.trim()}`,
          campaign_identifier: `influencer-${code.toLowerCase()}`,
          starts_at: new Date().toISOString(),
          ends_at: new Date(form.ends_at + "T23:59:59").toISOString(),
          promotions: [{ id: promotion.id }],
        }),
      })

      if (!campaignRes.ok) {
        const err = await campaignRes.json().catch(() => ({}))
        toast.error(err?.message ?? "Error al crear la campaña. El código fue creado pero sin fecha de expiración. Ve a Promociones en el admin para eliminarlo e intenta de nuevo.")
        return
      }

      toast.success(`Código ${code} creado exitosamente`)
      setForm({ influencer_name: "", handle: "", code: "", value: "10", ends_at: "" })
      onCreated()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <FocusModal open={open} onOpenChange={(v) => !v && onClose()}>
      <FocusModal.Content>
        <FocusModal.Header>
          <Button onClick={onClose} variant="secondary" size="small">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} size="small" isLoading={saving}>
            Crear código
          </Button>
        </FocusModal.Header>

        <FocusModal.Body className="flex flex-col items-center py-16">
          <div className="w-full max-w-lg flex flex-col gap-6">
            <div>
              <Heading>Nuevo código de influencer</Heading>
              <Text className="text-ui-fg-muted mt-1">
                El código se convierte automáticamente a mayúsculas.
              </Text>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="influencer_name">Nombre del influencer *</Label>
              <Input
                id="influencer_name"
                placeholder="Gaby Ramírez"
                value={form.influencer_name}
                onChange={(e) => handleChange("influencer_name", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="handle">Handle / red social</Label>
              <Input
                id="handle"
                placeholder="@gabyfit"
                value={form.handle}
                onChange={(e) => handleChange("handle", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="code">Código de descuento *</Label>
              <Input
                id="code"
                placeholder="GABY20"
                value={form.code}
                onChange={(e) =>
                  handleChange("code", e.target.value.toUpperCase())
                }
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="value">Porcentaje de descuento (%) *</Label>
              <Input
                id="value"
                type="number"
                min="1"
                max="100"
                placeholder="20"
                value={form.value}
                onChange={(e) => handleChange("value", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="ends_at">Fecha de expiración *</Label>
              <Input
                id="ends_at"
                type="date"
                value={form.ends_at}
                onChange={(e) => handleChange("ends_at", e.target.value)}
              />
            </div>
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}
