import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260418000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "influencer_application" (
        "id"                      text not null,
        "nombre"                  text not null,
        "email"                   text not null,
        "pais"                    text not null,
        "red_principal"           text not null,
        "handle"                  text not null,
        "handle_secundario"       text null,
        "link_perfil"             text not null,
        "rango_seguidores"        text not null,
        "nicho"                   jsonb not null,
        "tipo_contenido"          jsonb not null,
        "genero_audiencia"        text not null,
        "edad_audiencia"          text not null,
        "tiene_contenido_bienestar" text not null,
        "marcas_previas"          text null,
        "parches"                 jsonb not null,
        "modalidad"               jsonb not null,
        "media_kit"               text null,
        "media_kit_url"           text null,
        "mensaje_libre"           text null,
        "estado"                  text not null default 'pendiente',
        "created_at"              timestamptz not null default now(),
        "updated_at"              timestamptz not null default now(),
        "deleted_at"              timestamptz null,
        constraint "influencer_application_pkey" primary key ("id")
      );
    `);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_influencer_application_deleted_at" ON "influencer_application" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_influencer_application_email" ON "influencer_application" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_influencer_application_estado" ON "influencer_application" ("estado") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "influencer_application" cascade;`);
  }

}
