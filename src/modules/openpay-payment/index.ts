import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { OpenpayPaymentService } from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [OpenpayPaymentService],
})
