import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260503121408 extends Migration {

  override async up(): Promise<void> {
    // Idempotent table create (for fresh DBs)
    this.addSql(`create table if not exists "influencer_application" ("id" text not null, "nombre" text not null, "email" text not null, "pais" text not null, "red_principal" text null, "handle" text null, "handle_secundario" text null, "link_perfil" text null, "instagram_handle" text null, "tiktok_handle" text null, "rango_seguidores" text not null, "nicho" jsonb not null, "tipo_contenido" jsonb not null, "genero_audiencia" text null, "edad_audiencia" text null, "tiene_contenido_bienestar" text not null, "marcas_previas" text null, "parches" jsonb not null, "modalidad" jsonb null, "media_kit" text null, "media_kit_url" text null, "mensaje_libre" text null, "direccion" jsonb null, "estado" text not null default 'pendiente', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "influencer_application_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_influencer_application_deleted_at" ON "influencer_application" ("deleted_at") WHERE deleted_at IS NULL;`);

    // ALTER existing tables (DBs created before this migration)
    this.addSql(`ALTER TABLE "influencer_application" ADD COLUMN IF NOT EXISTS "instagram_handle" text NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ADD COLUMN IF NOT EXISTS "tiktok_handle" text NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ADD COLUMN IF NOT EXISTS "direccion" jsonb NULL;`);

    // Drop NOT NULL on legacy fields no longer collected by the new form
    this.addSql(`ALTER TABLE "influencer_application" ALTER COLUMN "red_principal" DROP NOT NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ALTER COLUMN "handle" DROP NOT NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ALTER COLUMN "link_perfil" DROP NOT NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ALTER COLUMN "genero_audiencia" DROP NOT NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ALTER COLUMN "edad_audiencia" DROP NOT NULL;`);
    this.addSql(`ALTER TABLE "influencer_application" ALTER COLUMN "modalidad" DROP NOT NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "influencer_application" DROP COLUMN IF EXISTS "instagram_handle";`);
    this.addSql(`ALTER TABLE "influencer_application" DROP COLUMN IF EXISTS "tiktok_handle";`);
    this.addSql(`ALTER TABLE "influencer_application" DROP COLUMN IF EXISTS "direccion";`);
    // Note: not restoring NOT NULL on legacy fields (would require backfilling).
  }

}
