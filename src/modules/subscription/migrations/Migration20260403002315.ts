import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260403002315 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "subscription_order" add column if not exists "order_id" text not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "subscription_order" drop column if exists "order_id";`);
  }

}
