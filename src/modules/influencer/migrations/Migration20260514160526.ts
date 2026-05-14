import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260514160526 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "influencer_application" add column if not exists "telefono" text null, add column if not exists "aprobado_en" timestamptz null, add column if not exists "rechazado_en" timestamptz null, add column if not exists "enviado_en" timestamptz null, add column if not exists "motivo_rechazo" text null, add column if not exists "pedido_id" text null, add column if not exists "tracking_number" text null, add column if not exists "label_url" text null, add column if not exists "carrier" text null, add column if not exists "envia_shipment_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "influencer_application" drop column if exists "telefono", drop column if exists "aprobado_en", drop column if exists "rechazado_en", drop column if exists "enviado_en", drop column if exists "motivo_rechazo", drop column if exists "pedido_id", drop column if exists "tracking_number", drop column if exists "label_url", drop column if exists "carrier", drop column if exists "envia_shipment_id";`);
  }

}
