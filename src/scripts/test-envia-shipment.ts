// src/scripts/test-envia-shipment.ts
//
// Standalone runner — NO requiere boot de Medusa ni conexión a la DB.
// Solo usa ENVIA_API_TOKEN + WAREHOUSE_* del environment para validar
// directamente contra Envia.
//
// Uso (con railway run para que inyecte env vars):
//   railway run npx ts-node --transpile-only ./src/scripts/test-envia-shipment.ts only-rate   # solo cotiza, gratis
//   railway run npx ts-node --transpile-only ./src/scripts/test-envia-shipment.ts             # genera, queda viva
//   railway run npx ts-node --transpile-only ./src/scripts/test-envia-shipment.ts cancel      # genera y cancela
//
// Notas:
// - El destino es un domicilio público (Palacio de Bellas Artes, CDMX).
// - Las etiquetas generadas son REALES y consumen crédito en Envia.
//   Si NO pasás "cancel", quedan activas hasta que las canceles a mano.
// - "only-rate" no genera nada — útil para confirmar que los nuevos
//   campos del origin (name / company / email) no rompen el request.

import { EnviaClient } from "../lib/envia-client"
import { WAREHOUSE } from "../config/warehouse"
import type { EnviaAddress, EnviaPackage } from "../lib/envia-client"

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

async function main() {
  const mode = (process.argv[2] ?? "").toLowerCase()
  const apiToken = process.env.ENVIA_API_TOKEN
  const apiUrl = process.env.ENVIA_API_URL
  if (!apiToken || !apiUrl) {
    console.error(
      "[test-envia] Faltan ENVIA_API_TOKEN / ENVIA_API_URL en el environment."
    )
    process.exit(1)
  }

  console.log(`[test-envia] mode=${mode || "generate-keep"}`)
  console.log(`[test-envia] origin=${JSON.stringify(WAREHOUSE, null, 2)}`)
  console.log(`[test-envia] destination=${JSON.stringify(TEST_DESTINATION, null, 2)}`)

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

  if (mode === "only-rate") {
    try {
      const rate = await client.getRate(shipmentReq)
      if (!rate) {
        console.warn(
          "[test-envia] Envia no devolvió tarifas. Puede ser una validación de los datos del origin/destination."
        )
        return
      }
      console.log(
        `[test-envia] ✓ Cotización OK — carrier=${rate.carrier} service=${rate.service} ` +
        `precio=${rate.totalPrice} ${rate.currency} ETA=${rate.deliveryEstimate}`
      )
      console.log(
        "[test-envia] Si esto pasa sin errores, los campos del origin se aceptan."
      )
    } catch (err) {
      console.error(
        `[test-envia] FAIL en cotización: ${err instanceof Error ? err.message : String(err)}`
      )
      process.exit(1)
    }
    return
  }

  let result
  try {
    result = await client.generateShipment(shipmentReq)
  } catch (err) {
    console.error(
      `[test-envia] FAIL al generar etiqueta: ${err instanceof Error ? err.message : String(err)}`
    )
    process.exit(1)
  }

  console.log(
    "[test-envia] ✓ Etiqueta generada:\n" +
      `  shipment_id     = ${result.shipmentId}\n` +
      `  carrier         = ${result.carrier} ${result.service}\n` +
      `  tracking_number = ${result.trackingNumber}\n` +
      `  label_url       = ${result.label}\n` +
      `  track_url       = ${result.trackUrl}\n` +
      `  total_price     = ${result.totalPrice}`
  )

  if (mode === "cancel") {
    try {
      await client.cancelShipment({
        shipmentId: result.shipmentId,
        carrier: result.carrier,
        trackingNumber: result.trackingNumber,
      })
      console.log("[test-envia] ✓ Etiqueta cancelada (refund pendiente según carrier).")
    } catch (err) {
      console.error(
        `[test-envia] FAIL al cancelar (la etiqueta queda activa): ${
          err instanceof Error ? err.message : String(err)
        }`
      )
      process.exit(1)
    }
    return
  }

  console.log(
    "[test-envia] La etiqueta queda ACTIVA.\n" +
      "  → Probá pedir una recolección en el dashboard de Envia para esta etiqueta.\n" +
      "  → Verificá si el form ya NO pide \"Capture el nombre de la persona...\".\n" +
      "  → Cuando termines, cancelala desde Envia para refund."
  )
}

main().catch((err) => {
  console.error(`[test-envia] Unexpected error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
  process.exit(1)
})
