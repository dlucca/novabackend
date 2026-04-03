import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260403001710 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "subscription" ("id" text not null, "status" text not null default 'active', "interval_days" integer not null, "next_billing_date" timestamptz not null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "subscription_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_deleted_at" ON "subscription" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "subscription_order" ("id" text not null, "cycle_number" integer not null, "subscription_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "subscription_order_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_order_subscription_id" ON "subscription_order" ("subscription_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_order_deleted_at" ON "subscription_order" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "subscription_order" add constraint "subscription_order_subscription_id_foreign" foreign key ("subscription_id") references "subscription" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "subscription_order" drop constraint if exists "subscription_order_subscription_id_foreign";`);

    this.addSql(`drop table if exists "subscription" cascade;`);

    this.addSql(`drop table if exists "subscription_order" cascade;`);
  }

}
