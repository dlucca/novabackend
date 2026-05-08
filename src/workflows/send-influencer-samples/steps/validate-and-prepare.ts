// src/workflows/send-influencer-samples/steps/validate-and-prepare.ts
//
// Loads the application + resolves the Once-tier variant for each parche
// the influencer chose. Fails the workflow early (before any state mutation)
// if anything's missing — no need for compensation here.

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { INFLUENCER_MODULE } from "../../../modules/influencer"
import InfluencerModuleService from "../../../modules/influencer/service"

type Input = { application_id: string }

export type ValidatedSampleData = {
  application_id: string
  customer_email: string
  customer_first_name: string
  customer_last_name: string
  customer_phone: string
  shipping_address: {
    first_name: string
    last_name: string
    address_1: string
    address_2: string | null
    city: string
    province: string
    country_code: string
    postal_code: string
    phone: string
    metadata: { instructions?: string | null; reference?: string | null }
  }
  line_items: Array<{
    title: string
    variant_id: string
    sku: string | null
    unit_price: number
    quantity: number
    metadata: Record<string, unknown>
  }>
  parches: string[]
}

export const validateAndPrepareStep = createStep(
  "validate-and-prepare",
  async ({ application_id }: Input, { container }) => {
    const influencerService: InfluencerModuleService = container.resolve(INFLUENCER_MODULE)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const application = await influencerService.retrieveInfluencerApplication(application_id) as any

    if (!application) {
      throw new Error(`Postulación ${application_id} no existe`)
    }
    if (application.estado !== "aprobado") {
      throw new Error(
        `Solo se pueden enviar muestras a postulaciones aprobadas. Estado actual: ${application.estado}`
      )
    }
    if (application.pedido_id) {
      throw new Error(
        `Esta postulación ya tiene una orden de muestras asociada (${application.pedido_id})`
      )
    }
    const parches: string[] = application.parches ?? []
    if (!parches.length) {
      throw new Error("La postulación no tiene parches seleccionados")
    }
    if (!application.direccion) {
      throw new Error("La postulación no tiene dirección de envío")
    }

    // Resolve the "once" SKU per parche — the seed creates SKUs as
    // `${handle}-once` for the one-time variant. We use `once` for samples so
    // we don't accidentally trigger any subscription side-effects.
    const skus = parches.map((p) => `${p}-once`)

    const { data: variants } = await query.graph({
      entity: "product_variant",
      filters: { sku: skus },
      fields: ["id", "title", "sku", "product.title"],
    })

    if (!variants.length) {
      throw new Error(
        `No se encontraron variantes para los parches seleccionados (skus: ${skus.join(", ")})`
      )
    }

    // Build line items in the order the influencer picked them, even if some
    // are missing — but fail loudly so we don't ship a partial set silently.
    const variantBySku = new Map(variants.map((v: any) => [v.sku, v]))
    const missing = skus.filter((s) => !variantBySku.has(s))
    if (missing.length) {
      throw new Error(`Variantes faltantes en la base: ${missing.join(", ")}`)
    }

    const direccion = application.direccion as Record<string, string | null>
    const fullName = (application.nombre as string).trim().split(/\s+/)
    const firstName = fullName[0] ?? "Cliente"
    const lastName = fullName.slice(1).join(" ") || "—"

    // Compose the shipping address. Envia uses `street + number` separately
    // when generating labels, but Medusa's order shipping_address uses the
    // legacy `address_1 + address_2` pair. The Envia adapter that runs later
    // already knows how to read this pair.
    //
    // Sanitize the interior — influencers often write "Int. 102" or "INT 5"
    // in the interior field, which would produce "Int Int. 102" if we
    // blindly prepend our own "Int" prefix. Strip any leading variant of
    // "int" / "interior" / "depto" before composing.
    const street = (direccion.street ?? "").trim()
    const sanitizedInterior = (direccion.interior ?? "")
      .trim()
      .replace(/^(int(erior)?\.?|depto\.?|departamento)\s*/i, "")
      .trim()
    const interior = sanitizedInterior ? ` Int ${sanitizedInterior}` : ""

    const data: ValidatedSampleData = {
      application_id,
      customer_email: application.email,
      customer_first_name: firstName,
      customer_last_name: lastName,
      // Phone isn't collected in the influencer form — we send a placeholder
      // and rely on Envia's pickup-side process if the carrier needs to call.
      // (The pickup contact is the warehouse, not the recipient.)
      customer_phone: "+520000000000",
      shipping_address: {
        first_name: firstName,
        last_name: lastName,
        address_1: `${street}${interior}`,
        address_2: direccion.colonia ?? null,
        city: direccion.city ?? "",
        province: direccion.state ?? "",
        country_code: "mx",
        postal_code: direccion.zip ?? "",
        phone: "+520000000000",
        metadata: {
          instructions: direccion.instructions ?? null,
          reference: direccion.instructions ?? null,
        },
      },
      line_items: skus.map((sku) => {
        const v = variantBySku.get(sku) as any
        return {
          title: v.product?.title ?? v.title ?? sku,
          variant_id: v.id,
          sku: v.sku ?? null,
          unit_price: 0,
          quantity: 1,
          metadata: {
            is_sample: true,
            sample_for_application: application_id,
          },
        }
      }),
      parches,
    }

    return new StepResponse(data, null)
  }
)
