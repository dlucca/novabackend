// src/scripts/test-envia-shipment.ts
//
// Genera UNA etiqueta de prueba contra Envia con la WAREHOUSE actual,
// para validar que los nuevos campos (name, company, email, reference)
// se honran y que el formulario de recolección de Envia ya no pide
// "Capture el nombre de la persona...".
//
// Uso:
//   railway run npx medusa exec ./src/scripts/test-envia-shipment.ts            -> genera y deja vivo
//   railway run npx medusa exec ./src/scripts/test-envia-shipment.ts cancel     -> genera y cancela
//   railway run npx medusa exec ./src/scripts/test-envia-shipment.ts only-rate  -> solo cotiza, no genera
//
// Notas:
// - Cualquier shipment generado es REAL. Si NO pasás "cancel", queda activo
//   en tu cuenta de Envia y consume crédito hasta que lo canceles a mano.
// - El destino es un domicilio público de prueba (Palacio de Bellas Artes,
//   CDMX). Cambiar si querés probar contra una zona específica.

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { EnviaClient } from "../lib/envia-client"
import { WAREHOUSE } from "../config/warehouse"
import type { EnviaAddress, EnviaPackage } from "../lib/envia-client"

// Destino de prueba — Palacio de Bellas Artes, CDMX. Pública, fácil de
// reconocer y dentro de zona urbana para que cualquier carrier cotice.
const TEST_DESTINATION: EnviaAddress = {
  name: "Cliente de Prueba",
  phone: "+525555555555",
  street: "Av. Juárez",
  number: "S/N",
  district: "Centro",
  city: "Cuauhtémoc",
  state: "DIF",
  country: "MX",
  postalCode: "06050",
}

const TEST_PACKAGE: EnviaPackage = {
  type: "box",
  content: "Vitamin patches (TEST)",
  amount: 1,
  declaredValue: 100,
  lengthUnit: "CM",
  weightUnit: "KG",
  weight: 0.2,
  dimensions: { length: 20, width: 15, height: 3 },
}

export default async function testEnviaShipment({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const mode = (args?.[0] ?? "").toLowerCase() // "", "cancel", "only-rate"

  const apiToken = process.env.ENVIA_API_TOKEN
  const apiUrl = process.env.ENVIA_API_URL
  if (!apiToken || !apiUrl) {
    logger.error(
      "[test-envia] Faltan ENVIA_API_TOKEN / ENVIA_API_URL. Corré con `railway run` desde un environment configurado."
    )
    return
  }

  logger.info(`[test-envia] mode=${mode || "generate-keep"}`)
  logger.info(`[test-envia] origin=${JSON.stringify(WAREHOUSE)}`)
  logger.info(`[test-envia] destination=${JSON.stringify(TEST_DESTINATION)}`)

  const client = new EnviaClient({ apiUrl, apiToken })

  const shipmentReq = {
    origin: WAREHOUSE,
    destination: TEST_DESTINATION,
    packages: [TEST_PACKAGE],
    shipment: { type: 1 as const },
    settings: {
      currency: "MXN",
      printFormat: "PDF",
      printSize: "PAPER_LETTER",
    },
  }

  // ─── Solo cotización (más barato, no genera nada) ──────────────────────
  if (mode === "only-rate") {
    try {
      const rate = await client.getRate(shipmentReq)
      if (!rate) {
        logger.warn(
          "[test-envia] Envia no devolvió tarifas. Puede ser una validación de los datos del origin/destination."
        )
        return
      }
      logger.info(
        `[test-envia] ✓ Cotización OK — carrier=${rate.carrier} service=${rate.service} ` +
        `precio=${rate.totalPrice} ${rate.currency} ETA=${rate.deliveryEstimate}`
      )
      logger.info(
        "[test-envia] Si esto pasa sin errores, los nuevos campos del origin se aceptan. " +
        "Para validar el FORM de recolección hay que generar etiqueta — corré el script sin args."
      )
    } catch (err) {
      logger.error(
        `[test-envia] FAIL en cotización: ${err instanceof Error ? err.message : String(err)}`
      )
    }
    return
  }

  // ─── Generación de etiqueta real ────────────────────────────────────────
  let result
  try {
    result = await client.generateShipment(shipmentReq)
  } catch (err) {
    logger.error(
      `[test-envia] FAIL al generar etiqueta: ${err instanceof Error ? err.message : String(err)}`
    )
    return
  }

  logger.info(
    "[test-envia] ✓ Etiqueta generada:\n" +
      `  shipment_id     = ${result.shipmentId}\n` +
      `  carrier         = ${result.carrier} ${result.service}\n` +
      `  tracking_number = ${result.trackingNumber}\n` +
      `  label_url       = ${result.label}\n` +
      `  track_url       = ${result.trackUrl}\n` +
      `  total_price     = ${result.totalPrice}`
  )

  // ─── Cancelación inmediata si se pidió ──────────────────────────────────
  if (mode === "cancel") {
    try {
      await client.cancelShipment({
        shipmentId: result.shipmentId,
        carrier: result.carrier,
        trackingNumber: result.trackingNumber,
      })
      logger.info(`[test-envia] ✓ Etiqueta cancelada (refund pendiente según carrier).`)
    } catch (err) {
      logger.error(
        `[test-envia] FAIL al cancelar (la etiqueta queda activa): ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
    return
  }

  logger.info(
    "[test-envia] Etiqueta queda ACTIVA en tu cuenta de Envia.\n" +
      "  → Probá pedir una recolección desde el dashboard para esta etiqueta.\n" +
      "  → Verificá si el form ya NO pide \"Capture el nombre de la persona...\".\n" +
      "  → Cuando termines de probar, cancelá la etiqueta desde Envia para refund."
  )
}
