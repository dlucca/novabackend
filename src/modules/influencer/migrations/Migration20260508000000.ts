import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Adds direct shipping metadata fields to the application — the new
 * simplified sample-shipping flow stores the Envia label data right on
 * the application instead of going through a Medusa Order / Fulfillment
 * chain.
 *
 * Idempotent — uses ADD COLUMN IF NOT EXISTS.
 */
export class Migration20260508000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "influencer_application" ADD COLUMN IF NOT EXISTS "tracking_number" text NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ADD COLUMN IF NOT EXISTS "label_url" text NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ADD COLUMN IF NOT EXISTS "carrier" text NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ADD COLUMN IF NOT EXISTS "envia_shipment_id" text NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "influencer_application" DROP COLUMN IF EXISTS "tracking_number";`);
    this.addSql(`ALTER TABLE "influencer_application" DROP COLUMN IF EXISTS "label_url";`);
    this.addSql(`ALTER TABLE "influencer_application" DROP COLUMN IF EXISTS "carrier";`);
    this.addSql(`ALTER TABLE "influencer_application" DROP COLUMN IF EXISTS "envia_shipment_id";`);
  }
}
