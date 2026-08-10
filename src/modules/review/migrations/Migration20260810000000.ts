import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260810000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "product_review" (
        "id"                      text not null,
        "product_slug"            text not null,
        "user_name"               text not null,
        "user_email"              text not null,
        "clerk_user_id"           text not null,
        "rating"                  integer not null,
        "title"                   text not null,
        "comment"                 text null,
        "reply"                   text null,
        "reply_created_at"        timestamptz null,
        "created_at"              timestamptz not null default now(),
        "updated_at"              timestamptz not null default now(),
        "deleted_at"              timestamptz null,
        constraint "product_review_pkey" primary key ("id")
      );
    `);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_review_deleted_at" ON "product_review" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_review_product_slug" ON "product_review" ("product_slug") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "product_review" cascade;`);
  }

}
