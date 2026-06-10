/**
 * upload-product-images.ts — Sube imágenes locales a R2 (File Module) y las
 * asocia a los productos por handle.
 *
 * Uso:
 *   1. Colocar imágenes en product-images/<handle>/ (webp/png/jpg).
 *      La primera en orden alfabético se usa como thumbnail.
 *   2. npx medusa exec ./src/scripts/upload-product-images.ts
 *
 * Idempotente: cada corrida reemplaza images[] y thumbnail del producto.
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  uploadFilesWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import * as fs from "fs"
import * as path from "path"

const PRODUCTS = ["energy", "sleep", "glow", "shield", "zen", "woman"] as const

const IMAGES_DIR = path.join(process.cwd(), "product-images")

const MIME_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
}

export default async function uploadProductImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  if (!fs.existsSync(IMAGES_DIR)) {
    logger.error(`No existe ${IMAGES_DIR}. Crear product-images/<handle>/ con las imágenes.`)
    return
  }

  for (const handle of PRODUCTS) {
    const dir = path.join(IMAGES_DIR, handle)
    if (!fs.existsSync(dir)) {
      logger.warn(`Sin directorio para "${handle}" — salteado`)
      continue
    }

    const files = fs
      .readdirSync(dir)
      .filter((f) => MIME_TYPES[path.extname(f).toLowerCase()])
      .sort()

    if (files.length === 0) {
      logger.warn(`Sin imágenes válidas para "${handle}" — salteado`)
      continue
    }

    try {
      const { result: uploaded } = await uploadFilesWorkflow(container).run({
        input: {
          files: files.map((f) => ({
            filename: `products/${handle}/${f}`,
            mimeType: MIME_TYPES[path.extname(f).toLowerCase()],
            content: fs.readFileSync(path.join(dir, f)).toString("base64"),
            access: "public" as const,
          })),
        },
      })

      const {
        data: [product],
      } = await query.graph({
        entity: "product",
        fields: ["id"],
        filters: { handle },
      })

      if (!product) {
        logger.warn(`Producto con handle "${handle}" no existe en Medusa — salteado`)
        continue
      }

      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: product.id },
          update: {
            images: uploaded.map((u) => ({ url: u.url })),
            thumbnail: uploaded[0].url,
          },
        },
      })

      logger.info(`"${handle}": ${uploaded.length} imágenes subidas → thumbnail ${uploaded[0].url}`)
    } catch (err) {
      logger.error(`Falló la carga para "${handle}": ${err instanceof Error ? err.message : err}`)
      continue
    }
  }

  logger.info("Carga de imágenes completada.")
}
