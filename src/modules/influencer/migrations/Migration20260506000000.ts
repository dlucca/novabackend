import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Adds state-transition fields to track the approval/shipping flow:
 *   - aprobado_en / rechazado_en / enviado_en: timestamps per state
 *   - motivo_rechazo: internal-only note when rejecting
 *   - pedido_id: FK-by-text to the Medusa Order created when shipping samples
 *
 * Idempotent — uses ADD COLUMN IF NOT EXISTS so re-runs are safe across
 * staging/prod DBs that may already have a partial state.
 */
export class Migration20260506000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "influencer_application" ADD COLUMN IF NOT EXISTS "aprobado_en" timestamptz NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ADD COLUMN IF NOT EXISTS "rechazado_en" timestamptz NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ADD COLUMN IF NOT EXISTS "enviado_en" timestamptz NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ADD COLUMN IF NOT EXISTS "motivo_rechazo" text NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ADD COLUMN IF NOT EXISTS "pedido_id" text NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "influencer_application" DROP COLUMN IF EXISTS "aprobado_en";`);
    this.addSql(`ALTER TABLE "influencer_application" DROP COLUMN IF EXISTS "rechazado_en";`);
    this.addSql(`ALTER TABLE "influencer_application" DROP COLUMN IF EXISTS "enviado_en";`);
    this.addSql(`ALTER TABLE "influencer_application" DROP COLUMN IF EXISTS "motivo_rechazo";`);
    this.addSql(`ALTER TABLE "influencer_application" DROP COLUMN IF EXISTS "pedido_id";`);
  }
}
