import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260403002418 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "subscription" add column if not exists "original_order_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "subscription" drop column if exists "original_order_id";`);
  }

}
