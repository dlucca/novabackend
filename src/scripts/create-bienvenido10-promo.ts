import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { ExecArgs } from "@medusajs/framework/types"
import { PromotionType, PromotionStatus } from "@medusajs/framework/utils"

export default async function createBienvenido10Promo({ container }: ExecArgs) {
  console.log("Creando o verificando promoción BIENVENIDO10 en Medusa V2...")

  try {
    const { result } = await createPromotionsWorkflow(container).run({
      input: {
        promotionsData: [
          {
            code: "BIENVENIDO10",
            type: PromotionType.STANDARD,
            status: PromotionStatus.ACTIVE,
            is_automatic: false,
            application_method: {
              type: "percentage",
              target_type: "items",
              allocation: "across",
              value: 10,
              currency_code: "mxn",
            },
          },
        ],
      },
    })

    console.log("✅ Promoción BIENVENIDO10 creada con éxito:", result)
  } catch (error: any) {
    if (error?.message?.includes("already exists") || error?.message?.includes("unique")) {
      console.log("ℹ️ La promoción BIENVENIDO10 ya existe en la base de datos de Medusa.")
    } else {
      console.error("❌ Error al crear la promoción:", error)
    }
  }
}
