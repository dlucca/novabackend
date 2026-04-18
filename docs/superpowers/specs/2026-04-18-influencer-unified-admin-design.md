# Influencer Admin — Página Unificada con Tabs

**Fecha:** 2026-04-18  
**Repo:** novabackend (`src/admin/routes/influencers/`)  
**Estado:** aprobado para implementación

---

## Objetivo

Unificar en una sola página de admin el flujo completo de influencers: desde revisar postulaciones del formulario del storefront hasta asignar y monitorear códigos de descuento.

---

## Contexto actual

La página `src/admin/routes/influencers/page.tsx` ya existe y gestiona **códigos de promo** de influencers (tabla de códigos activos, drawer de órdenes, modal de creación). Es un admin extension de Medusa con su propio routing.

En este PR se agregó el módulo `influencer_application` que guarda las postulaciones del formulario del storefront en Medusa (tabla `influencer_application`, endpoint `POST /store/influencers`, endpoint `GET /admin/influencers`).

La tarea es integrar ambos en la misma página via dos tabs.

---

## Diseño

### Estructura general

Una página con dos tabs en el header del `Container`:

```
┌─────────────────────────────────────────────────────┐
│  Influencers                                        │
├──────────────────┬──────────────────────────────────┤
│  Postulaciones 🔴│  Códigos activos                 │
├──────────────────┴──────────────────────────────────┤
│  [contenido del tab activo]                         │
└─────────────────────────────────────────────────────┘
```

El badge rojo en "Postulaciones" muestra el conteo de postulaciones con `estado = pendiente`. Desaparece cuando no hay pendientes.

---

### Tab 1 — Postulaciones

**Fuente de datos:** `GET /admin/influencers` (módulo `influencer_application`).

**Filtros de estado** — pills encima de la tabla:
- Pendientes (N) — seleccionado por defecto
- Aprobados (N)
- Rechazados (N)
- Todos

**Columnas de la tabla:**

| Columna | Campo |
|---|---|
| Nombre | `nombre` |
| Handle | `handle` (con `red_principal` como ícono o texto) |
| Red | `red_principal` |
| Seguidores | `rango_seguidores` |
| Estado | badge: `pendiente` amarillo / `aprobado` verde / `rechazado` rojo |
| Acciones | solo visible cuando `estado = pendiente` |

**Acciones por fila (pendientes):**
- **✓ Aceptar** → `PATCH /admin/influencers/:id` con `{ estado: "aprobado" }` → actualiza fila en la UI
- **✗ Rechazar** → `PATCH /admin/influencers/:id` con `{ estado: "rechazado" }` → actualiza fila en la UI

Ambas acciones son inmediatas, sin confirmación modal (volumen bajo, acción reversible vía la API si hace falta).

**Drawer de detalle:** Clic en cualquier fila abre un drawer con todos los campos de la postulación (los 3 pasos del formulario: identidad, comunidad, fit con Novapatch). El drawer es de solo lectura; las acciones Aceptar/Rechazar están también disponibles ahí para postulaciones pendientes.

---

### Tab 2 — Códigos activos

Mismo contenido que la página actual, con una sección nueva arriba.

**Sección "Aceptados sin código"** (visible solo cuando hay al menos uno):
- Fondo amarillo claro (`#fffbeb`) para llamar la atención
- Cards horizontales: `nombre · handle · [+ Crear código]`
- Botón "Crear código" abre el `NewInfluencerModal` existente, **pre-llenando** `influencer_name` y `handle` desde la postulación

**Tabla de códigos activos** (existente sin cambios):
- Columnas: Nombre, Handle, Código, Descuento, Vence, Usos, Revenue, Ver órdenes
- Drawer de detalle de órdenes (existente sin cambios)

---

### Backend — endpoint faltante

El módulo `influencer_application` necesita un endpoint `PATCH /admin/influencers/:id` para actualizar el estado. Actualmente solo existe `GET /admin/influencers`.

```ts
// src/api/admin/influencers/[id]/route.ts
PATCH → { estado: "aprobado" | "rechazado" }
```

---

### Vinculación postulación ↔ código

No se crea un link en base de datos entre `influencer_application` y la `Promotion` de Medusa. La asociación es implícita por nombre/handle. El volumen es bajo y un join formal requeriría una tabla de links adicional que no justifica la complejidad ahora.

Si en el futuro se necesita trazabilidad completa, se puede agregar un campo `promotion_id` nullable en `influencer_application`.

---

## Archivos afectados

### Backend
| Archivo | Cambio |
|---|---|
| `src/api/admin/influencers/[id]/route.ts` | nuevo — PATCH para actualizar estado |

### Admin frontend (Medusa extension)
| Archivo | Cambio |
|---|---|
| `src/admin/routes/influencers/page.tsx` | reemplazar contenido actual por estructura con tabs |
| `src/admin/routes/influencers/components/influencer-table.tsx` | sin cambios (reutilizado en Tab 2) |
| `src/admin/routes/influencers/components/influencer-detail-drawer.tsx` | sin cambios |
| `src/admin/routes/influencers/components/new-influencer-modal.tsx` | agregar props opcionales `defaultInfluencerName` y `defaultHandle` para pre-llenar desde postulación |
| `src/admin/routes/influencers/components/applications-tab.tsx` | nuevo — Tab 1 completo (tabla + filtros + drawer) |
| `src/admin/routes/influencers/components/application-detail-drawer.tsx` | nuevo — drawer de detalle de postulación |
| `src/admin/routes/influencers/types.ts` | agregar tipo `InfluencerApplication` |

---

## Estados de postulación

```
pendiente → aprobado   (admin acepta)
pendiente → rechazado  (admin rechaza)
aprobado  → [sin más transiciones en esta versión]
rechazado → [sin más transiciones en esta versión]
```

---

## Fuera de alcance

- Notificación por email al influencer al aceptar/rechazar
- Link en base de datos entre postulación y código de promo
- Edición de postulaciones desde el admin
- Paginación (volumen bajo, no necesario ahora)
