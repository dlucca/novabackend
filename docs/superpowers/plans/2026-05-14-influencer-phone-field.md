# Influencer Phone Field + Envia Label Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect a required phone number on the influencer application form and use it as the recipient phone on Envia shipping labels (fixing a bug where labels currently print Novapatch's warehouse phone in the recipient field).

**Architecture:** Add a `telefono` column to the `InfluencerApplication` DML model (nullable at DB level for legacy compatibility, required at API level). Wire it through the public POST endpoint with 10-digit MX validation, surface it read-only in the admin detail drawer, and pass it to `mapAddress` in the Envia ship route — replacing the hardcoded empty string that triggers the carrier's shipper-phone fallback.

**Tech Stack:** Medusa.js v2 (DML + custom modules), TypeScript, PostgreSQL, Next.js 15 (storefront form), React Email (unaffected), Jest (unit tests).

**Spec:** [docs/superpowers/specs/2026-05-14-influencer-phone-field-design.md](../specs/2026-05-14-influencer-phone-field-design.md)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/modules/influencer/models/influencer-application.ts` | Modify | Add `telefono` column |
| `src/modules/influencer/migrations/Migration<timestamp>.ts` | Create (via CLI) | Add column to DB |
| `src/lib/influencer-validation.ts` | Create | Pure `validateInfluencerPayload` + `MX_PHONE_REGEX` (testable in isolation) |
| `src/api/store/influencers/route.ts` | Modify | Use the new validator; pass `telefono` to create |
| `src/api/admin/influencers/[id]/ship/route.ts` | Modify | Guard against missing `telefono`; pass it to `mapAddress` |
| `src/admin/routes/influencers/types.ts` | Modify | Add `telefono: string \| null` to `InfluencerApplication` type |
| `src/admin/routes/influencers/components/application-detail-drawer.tsx` | Modify | Display phone in Identidad section (read-only) |
| `apps/storefront/app/[locale]/influencers/InfluencerForm.tsx` (novafrontend) | Modify | Add phone field to Step 1 with helper text + validation |
| `src/__tests__/lib/influencer-validation.unit.spec.ts` | Create | Pure-function tests for payload validation |
| `src/__tests__/api/influencer-ship-phone.unit.spec.ts` | Create | Pure-function tests for the ship-route phone guard |

---

## Task 1: Add `telefono` to the model + generate migration

**Files:**
- Modify: `src/modules/influencer/models/influencer-application.ts`
- Create: `src/modules/influencer/migrations/Migration<timestamp>.ts` (via CLI)

- [ ] **Step 1: Add the column to the DML model**

In `src/modules/influencer/models/influencer-application.ts`, add `telefono` immediately after the `email` field (line 19):

```ts
  // Step 1 — identity
  nombre: model.text(),
  email: model.text(),
  // New (2026-05): collected on the form, required for new applications,
  // validated server-side as 10 digits (MX). Nullable at the DB level so
  // legacy rows (pre-rollout) don't break. The ship route guards against
  // null and refuses to generate a label without it — Envia's MX carriers
  // print the shipper's phone in the recipient field when destination
  // phone is empty.
  telefono: model.text().nullable(),
  pais: model.text(),
```

- [ ] **Step 2: Generate migration**

Run: `npx medusa db:generate influencerModuleService`
Expected: a new `Migration<timestamp>.ts` file in `src/modules/influencer/migrations/` that adds a nullable `telefono` text column.

- [ ] **Step 3: Apply migration locally**

Run: `npx medusa db:migrate`
Expected: migration applies successfully, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/influencer/models/influencer-application.ts src/modules/influencer/migrations/
git commit -m "feat(influencer): add telefono column to application model"
```

---

## Task 2: Extract pure validator + write failing tests

**Files:**
- Create: `src/lib/influencer-validation.ts`
- Create: `src/__tests__/lib/influencer-validation.unit.spec.ts`

This follows the repo's existing test convention (see `src/__tests__/api/webhooks-envia.unit.spec.ts`): extract logic into a pure function and unit-test it directly rather than booting the route.

- [ ] **Step 1: Write the failing test file**

Create `src/__tests__/lib/influencer-validation.unit.spec.ts`:

```ts
// src/__tests__/lib/influencer-validation.unit.spec.ts
import { validateInfluencerPayload } from "../../lib/influencer-validation"

const VALID_BODY = {
  nombre: "Ana López",
  email: "ana@example.com",
  pais: "mx",
  telefono: "5512345678",
  rango_seguidores: "10k–50k",
  nicho: ["Wellness"],
  tipo_contenido: ["Reels"],
  tiene_contenido_bienestar: "no",
  parches: ["energy"],
  instagram_handle: "ana",
  tiktok_handle: null,
}

describe("validateInfluencerPayload", () => {
  it("accepts a complete, valid payload", () => {
    expect(validateInfluencerPayload(VALID_BODY)).toEqual({ ok: true })
  })

  it("rejects when telefono is missing", () => {
    const { telefono: _t, ...body } = VALID_BODY
    expect(validateInfluencerPayload(body)).toEqual({
      ok: false,
      error: "Campo requerido: telefono",
    })
  })

  it("rejects when telefono is not 10 digits", () => {
    expect(validateInfluencerPayload({ ...VALID_BODY, telefono: "12345" })).toEqual({
      ok: false,
      error: "Teléfono inválido: ingresa 10 dígitos (sin lada del país)",
    })
  })

  it("rejects when telefono contains non-digits", () => {
    expect(validateInfluencerPayload({ ...VALID_BODY, telefono: "55-1234-5678" })).toEqual({
      ok: false,
      error: "Teléfono inválido: ingresa 10 dígitos (sin lada del país)",
    })
  })

  it("rejects when neither handle is provided", () => {
    expect(
      validateInfluencerPayload({ ...VALID_BODY, instagram_handle: null, tiktok_handle: null })
    ).toEqual({
      ok: false,
      error: "Indicá al menos un handle: Instagram o TikTok",
    })
  })

  it("rejects when a non-handle required field is missing", () => {
    const { nombre: _n, ...body } = VALID_BODY
    expect(validateInfluencerPayload(body)).toEqual({
      ok: false,
      error: "Campo requerido: nombre",
    })
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx jest src/__tests__/lib/influencer-validation.unit.spec.ts`
Expected: FAIL — `Cannot find module '../../lib/influencer-validation'`.

- [ ] **Step 3: Write the validator**

Create `src/lib/influencer-validation.ts`:

```ts
// src/lib/influencer-validation.ts
//
// Pure validator for the public POST /store/influencers payload. Lives
// outside the route handler so it's trivially unit-testable. The route
// handler delegates to this and translates the result into an HTTP
// response.

export const MX_PHONE_REGEX = /^\d{10}$/

const REQUIRED_FIELDS = [
  "nombre", "email", "pais", "telefono",
  "rango_seguidores", "nicho", "tipo_contenido",
  "tiene_contenido_bienestar", "parches",
] as const

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string }

export function validateInfluencerPayload(
  body: Record<string, unknown>
): ValidationResult {
  for (const field of REQUIRED_FIELDS) {
    if (!body[field]) {
      return { ok: false, error: `Campo requerido: ${field}` }
    }
  }

  const telefono = String(body.telefono)
  if (!MX_PHONE_REGEX.test(telefono)) {
    return {
      ok: false,
      error: "Teléfono inválido: ingresa 10 dígitos (sin lada del país)",
    }
  }

  const instagramHandle = (body.instagram_handle as string | null | undefined)?.toString().trim() || null
  const tiktokHandle = (body.tiktok_handle as string | null | undefined)?.toString().trim() || null
  if (!instagramHandle && !tiktokHandle) {
    return {
      ok: false,
      error: "Indicá al menos un handle: Instagram o TikTok",
    }
  }

  return { ok: true }
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npx jest src/__tests__/lib/influencer-validation.unit.spec.ts`
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/influencer-validation.ts src/__tests__/lib/influencer-validation.unit.spec.ts
git commit -m "feat(influencer): pure validator with telefono check + unit tests"
```

---

## Task 3: Wire validator into POST /store/influencers + persist `telefono`

**Files:**
- Modify: `src/api/store/influencers/route.ts`

- [ ] **Step 1: Replace inline validation with the new validator and persist `telefono`**

Replace the body of `POST` in `src/api/store/influencers/route.ts`. The full new file:

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INFLUENCER_MODULE } from "../../../modules/influencer"
import InfluencerModuleService from "../../../modules/influencer/service"
import { sendSlackNotification } from "../../../lib/slack-client"
import { mapInfluencerApplicationToSlackBlocks } from "../../../lib/slack-mappers"
import { validateInfluencerPayload } from "../../../lib/influencer-validation"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as Record<string, unknown>

  const validation = validateInfluencerPayload(body)
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error })
  }

  // Validator guarantees both required fields above and at least one handle.
  const instagramHandle = (body.instagram_handle as string)?.trim() || null
  const tiktokHandle = (body.tiktok_handle as string)?.trim() || null

  // Derive legacy red_principal / handle from whichever handle is present so
  // existing admin views and Slack mappers keep working without changes.
  const redPrincipal = instagramHandle ? "instagram" : "tiktok"
  const primaryHandle = instagramHandle ?? tiktokHandle ?? ""

  const influencerService: InfluencerModuleService = req.scope.resolve(INFLUENCER_MODULE)

  const [application] = await influencerService.createInfluencerApplications([
    {
      nombre: body.nombre as string,
      email: body.email as string,
      telefono: body.telefono as string,
      pais: body.pais as string,
      red_principal: redPrincipal,
      handle: primaryHandle,
      handle_secundario: null,
      link_perfil: null,
      instagram_handle: instagramHandle,
      tiktok_handle: tiktokHandle,
      rango_seguidores: body.rango_seguidores as string,
      nicho: body.nicho as string[],
      tipo_contenido: body.tipo_contenido as string[],
      genero_audiencia: null,
      edad_audiencia: null,
      tiene_contenido_bienestar: body.tiene_contenido_bienestar as string,
      marcas_previas: (body.marcas_previas as string) || null,
      parches: body.parches as string[],
      modalidad: null,
      media_kit: (body.media_kit as string) || null,
      media_kit_url: (body.media_kit_url as string) || null,
      mensaje_libre: (body.mensaje_libre as string) || null,
      direccion: (body.direccion as Record<string, unknown>) ?? null,
      estado: "pendiente",
    } as any,
  ])

  const webhookUrl = process.env.SLACK_INFLUENCER_WEBHOOK_URL
  if (webhookUrl) {
    const blocks = mapInfluencerApplicationToSlackBlocks({
      nombre: application.nombre,
      email: application.email,
      pais: application.pais,
      red_principal: application.red_principal,
      handle: application.handle,
      instagram_handle: (application as any).instagram_handle ?? null,
      tiktok_handle: (application as any).tiktok_handle ?? null,
      rango_seguidores: application.rango_seguidores,
      nicho: application.nicho as unknown as string[],
      parches: application.parches as unknown as string[],
    })
    sendSlackNotification(webhookUrl, blocks).catch((err) =>
      console.error("Slack influencer notification failed:", err)
    )
  }

  return res.status(201).json({ success: true, id: application.id })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 3: Run the influencer-validation tests again to confirm nothing regressed**

Run: `npx jest src/__tests__/lib/influencer-validation.unit.spec.ts`
Expected: PASS — 6/6.

- [ ] **Step 4: Commit**

```bash
git add src/api/store/influencers/route.ts
git commit -m "feat(influencer): persist telefono via validated POST endpoint"
```

---

## Task 4: Ship-route guard — write failing test for phone passthrough

**Files:**
- Create: `src/__tests__/api/influencer-ship-phone.unit.spec.ts`

The ship route is too tightly coupled to the request scope to unit-test as-is. We'll extract the pure "compose Envia destination from application" step into a helper, test that, then wire it back. This mirrors the validator pattern.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/api/influencer-ship-phone.unit.spec.ts`:

```ts
// src/__tests__/api/influencer-ship-phone.unit.spec.ts
import {
  guardShippableApplication,
  buildShipDestination,
} from "../../api/admin/influencers/[id]/ship/lib"

const APP_BASE = {
  id: "app_1",
  nombre: "Ana López",
  telefono: "5512345678",
  parches: ["energy"],
  estado: "aprobado",
  tracking_number: null,
  direccion: {
    street: "Insurgentes Sur 1234",
    interior: "5",
    colonia: "Del Valle",
    city: "Benito Juárez",
    state: "CDMX",
    zip: "03100",
  },
} as const

describe("guardShippableApplication", () => {
  it("returns ok for a valid approved application with telefono", () => {
    expect(guardShippableApplication(APP_BASE)).toEqual({ ok: true })
  })

  it("rejects when estado is not aprobado", () => {
    const result = guardShippableApplication({ ...APP_BASE, estado: "pendiente" })
    expect(result).toEqual({
      ok: false,
      status: 422,
      error: expect.stringContaining("Solo se pueden enviar muestras a postulaciones aprobadas"),
    })
  })

  it("rejects when a tracking_number already exists", () => {
    const result = guardShippableApplication({ ...APP_BASE, tracking_number: "TRK1" })
    expect(result).toEqual({
      ok: false,
      status: 422,
      error: expect.stringContaining("ya tiene una etiqueta"),
    })
  })

  it("rejects when parches is empty", () => {
    const result = guardShippableApplication({ ...APP_BASE, parches: [] })
    expect(result).toEqual({
      ok: false,
      status: 422,
      error: expect.stringContaining("no tiene parches"),
    })
  })

  it("rejects when direccion is missing", () => {
    const result = guardShippableApplication({ ...APP_BASE, direccion: null })
    expect(result).toEqual({
      ok: false,
      status: 422,
      error: expect.stringContaining("no tiene dirección"),
    })
  })

  it("rejects when telefono is missing", () => {
    const result = guardShippableApplication({ ...APP_BASE, telefono: null })
    expect(result).toEqual({
      ok: false,
      status: 422,
      error: expect.stringContaining("no tiene teléfono"),
    })
  })

  it("rejects when telefono is empty string", () => {
    const result = guardShippableApplication({ ...APP_BASE, telefono: "" })
    expect(result).toEqual({
      ok: false,
      status: 422,
      error: expect.stringContaining("no tiene teléfono"),
    })
  })
})

describe("buildShipDestination", () => {
  it("forwards application.telefono as the destination phone", () => {
    const dest = buildShipDestination(APP_BASE)
    expect(dest.phone).toBe("5512345678")
  })

  it("includes the influencer's full name", () => {
    const dest = buildShipDestination(APP_BASE)
    expect(dest.name).toBe("Ana López")
  })

  it("strips common interior prefixes (Int, Depto)", () => {
    const dest = buildShipDestination({
      ...APP_BASE,
      direccion: { ...APP_BASE.direccion, interior: "Depto 5" },
    })
    // street should end with "Int 5", not "Int Depto 5"
    expect(dest.street.endsWith("Int 5")).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest src/__tests__/api/influencer-ship-phone.unit.spec.ts`
Expected: FAIL — `Cannot find module '.../ship/lib'`.

- [ ] **Step 3: Commit the failing test (red phase)**

```bash
git add src/__tests__/api/influencer-ship-phone.unit.spec.ts
git commit -m "test(influencer): failing tests for ship-route guard + destination builder"
```

---

## Task 5: Extract `ship/lib.ts` and pass it the phone

**Files:**
- Create: `src/api/admin/influencers/[id]/ship/lib.ts`
- Modify: `src/api/admin/influencers/[id]/ship/route.ts`

- [ ] **Step 1: Create the extracted helper module**

Create `src/api/admin/influencers/[id]/ship/lib.ts`:

```ts
// src/api/admin/influencers/[id]/ship/lib.ts
//
// Pure helpers for the influencer-sample ship route. Extracted so the
// validation + destination-composition logic is unit-testable without
// booting Medusa's request scope. The route handler stays responsible
// for I/O (Redis lock, Envia HTTP calls, DB writes, Slack, events).

import { mapAddress } from "../../../../../lib/envia-mappers"
import type { EnviaAddress } from "../../../../../lib/envia-client"

type Direccion = {
  street?: string | null
  interior?: string | null
  colonia?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
} | null

export type ShippableApplication = {
  estado: string
  tracking_number: string | null
  parches: string[] | null | undefined
  direccion: Direccion
  telefono: string | null | undefined
  nombre: string
}

export type GuardResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

export function guardShippableApplication(app: ShippableApplication): GuardResult {
  if (app.estado !== "aprobado") {
    return {
      ok: false,
      status: 422,
      error: `Solo se pueden enviar muestras a postulaciones aprobadas. Estado actual: ${app.estado}`,
    }
  }
  if (app.tracking_number) {
    return {
      ok: false,
      status: 422,
      error: `Esta postulación ya tiene una etiqueta generada (tracking ${app.tracking_number}).`,
    }
  }
  if (!app.parches || !app.parches.length) {
    return { ok: false, status: 422, error: "La postulación no tiene parches seleccionados" }
  }
  if (!app.direccion) {
    return { ok: false, status: 422, error: "La postulación no tiene dirección de envío" }
  }
  if (!app.telefono || !app.telefono.trim()) {
    return {
      ok: false,
      status: 422,
      error: "La postulación no tiene teléfono cargado. No se puede generar la etiqueta sin un contacto de entrega.",
    }
  }
  return { ok: true }
}

export function buildShipDestination(app: ShippableApplication): EnviaAddress {
  // Guard caller is expected to have run guardShippableApplication first.
  const direccion = app.direccion!
  const fullName = app.nombre.trim()
  const sanitizedInterior = (direccion.interior ?? "")
    .trim()
    .replace(/^(int(erior)?\.?|depto\.?|departamento)\s*/i, "")
    .trim()
  const street = (direccion.street ?? "").trim()

  return mapAddress({
    first_name: fullName,
    last_name: "",
    address_1: street + (sanitizedInterior ? ` Int ${sanitizedInterior}` : ""),
    address_2: direccion.colonia ?? null,
    city: direccion.city ?? "",
    province: direccion.state ?? "",
    country_code: "mx",
    postal_code: direccion.zip ?? "",
    // FIX (2026-05): Envia's MX carriers print the shipper's phone in
    // the recipient field when destination phone is blank. The form now
    // requires telefono; the guard rejects legacy rows that lack it.
    phone: app.telefono!,
  })
}
```

- [ ] **Step 2: Run the ship-phone tests, verify they pass**

Run: `npx jest src/__tests__/api/influencer-ship-phone.unit.spec.ts`
Expected: PASS — 10/10 tests passing.

- [ ] **Step 3: Refactor the route to use the helpers**

In `src/api/admin/influencers/[id]/ship/route.ts`, replace the validation block (lines ~73-126) with calls to the new helpers. The full updated section, replacing from the comment `// ── 2. Load + validate` through the `log(\`Destination: ...\`)` line:

```ts
    // ── 2. Load + validate ──────────────────────────────────────────────────
    const influencerService: InfluencerModuleService = req.scope.resolve(INFLUENCER_MODULE)
    const application = await influencerService.retrieveInfluencerApplication(id) as any

    if (!application) {
      return res.status(404).json({ error: "Postulación no encontrada" })
    }

    const guard = guardShippableApplication(application as ShippableApplication)
    if (!guard.ok) {
      return res.status(guard.status).json({ error: guard.error })
    }

    if (!process.env.ENVIA_API_TOKEN || !process.env.ENVIA_API_URL) {
      return res.status(500).json({ error: "ENVIA no está configurado en este entorno" })
    }

    // ── 3. Compose Envia destination from the application's address ────────
    const parches: string[] = application.parches
    const fullName = (application.nombre as string).trim()
    const destination = buildShipDestination(application as ShippableApplication)

    log(`Destination: ${JSON.stringify(destination)}`)
```

And add to the imports at the top of the file:

```ts
import {
  guardShippableApplication,
  buildShipDestination,
  type ShippableApplication,
} from "./lib"
```

Also remove the now-unused imports (`mapAddress` is still used by `lib.ts`, but no longer by `route.ts` — check and prune):

```ts
// Before:
import { mapAddress, buildShipmentRequest } from "../../../../../lib/envia-mappers"
// After:
import { buildShipmentRequest } from "../../../../../lib/envia-mappers"
```

- [ ] **Step 4: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Run all tests**

Run: `npx jest`
Expected: PASS — all tests, including the new ones and any pre-existing ones.

- [ ] **Step 6: Commit**

```bash
git add src/api/admin/influencers/[id]/ship/
git commit -m "fix(envia): pass influencer telefono as recipient phone on sample labels"
```

---

## Task 6: Surface `telefono` read-only in the admin drawer

**Files:**
- Modify: `src/admin/routes/influencers/types.ts`
- Modify: `src/admin/routes/influencers/components/application-detail-drawer.tsx`

- [ ] **Step 1: Add `telefono` to the admin type**

In `src/admin/routes/influencers/types.ts`, add `telefono` immediately after `email` (line 48):

```ts
  nombre: string
  email: string
  telefono: string | null
  pais: string
```

- [ ] **Step 2: Display the field in the Identidad section**

In `src/admin/routes/influencers/components/application-detail-drawer.tsx`, find the line `<Field label="Email" value={application.email} />` (around line 277) and add a `Teléfono` field right after it:

```tsx
                <Field label="Nombre" value={application.nombre} />
                <Field label="Email" value={application.email} />
                <Field label="Teléfono" value={application.telefono} />
                <Field label="País" value={application.pais} />
```

The existing `Field` component already renders "—" for null values, so no additional handling is needed for legacy rows.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/admin/routes/influencers/types.ts src/admin/routes/influencers/components/application-detail-drawer.tsx
git commit -m "feat(admin): show telefono in influencer detail drawer"
```

---

## Task 7: Add `telefono` field to the storefront form (novafrontend)

**Files:**
- Modify: `apps/storefront/app/[locale]/influencers/InfluencerForm.tsx` (in the `novafrontend` repo, accessible via the additional working directory `/Users/dlucca/Projects/Novapatch/novafrontend`)

These edits all happen in `InfluencerForm.tsx`. Apply them in order.

- [ ] **Step 1: Add `telefono` to the `FormData` interface**

In the `FormData` interface (around line 19), add `telefono` right after `email`:

```ts
interface FormData {
  nombre: string;
  email: string;
  telefono: string;
  // País se fija desde la página (mx). No se pide al usuario.
  instagram_handle: string;
  tiktok_handle: string;
  // …rest unchanged
}
```

- [ ] **Step 2: Add `telefono: ""` to the `EMPTY` constant**

Around line 959:

```ts
const EMPTY: FormData = {
  nombre: "", email: "", telefono: "",
  instagram_handle: "", tiktok_handle: "",
  rango_seguidores: "", nicho: [], tipo_contenido: [],
  tiene_contenido_bienestar: "", marcas_previas: "",
  parches: [], media_kit: "", media_kit_url: "",
  mensaje_libre: "",
  direccion: EMPTY_ADDRESS,
};
```

- [ ] **Step 3: Add the field to `Step1`**

Replace the existing `Step1` function (around line 396) so the phone field appears below the email/name grid, before the handles section:

```tsx
function Step1({
  data,
  set,
  errors,
}: {
  data: FormData;
  set: (k: keyof FormData, v: string) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid sm:grid-cols-2 gap-6">
        <Field label="Nombre completo" required>
          <Input
            value={data.nombre}
            onChange={(v) => set("nombre", v)}
            placeholder="Tu nombre completo"
            error={errors.nombre}
          />
        </Field>
        <Field label="Email profesional" required>
          <Input
            type="email"
            value={data.email}
            onChange={(v) => set("email", v)}
            placeholder="tu@email.com"
            error={errors.email}
          />
        </Field>
      </div>

      <div>
        <Field label="Teléfono móvil" required>
          <Input
            type="tel"
            value={data.telefono}
            onChange={(v) => set("telefono", v.replace(/\D/g, "").slice(0, 10))}
            placeholder="55 1234 5678"
            error={errors.telefono}
          />
        </Field>
        <p
          className="text-xs mt-2"
          style={{ color: "rgba(13,27,53,0.5)" }}
        >
          Necesitamos tu número para que el repartidor pueda contactarte cuando
          entregue tus muestras. No lo usamos para marketing.
        </p>
      </div>

      <div>
        <p
          className="text-xs mb-3"
          style={{ color: "rgba(13,27,53,0.5)" }}
        >
          Indica al menos uno de tus handles. Sin el @ — usamos el handle para
          armar el link de tu perfil automáticamente.
        </p>
        <div className="grid sm:grid-cols-2 gap-6">
          <Field label="Instagram">
            <Input
              value={data.instagram_handle}
              onChange={(v) => set("instagram_handle", v.replace(/^@/, ""))}
              placeholder="ej: novapatch_mx"
              error={errors.instagram_handle}
            />
          </Field>
          <Field label="TikTok">
            <Input
              value={data.tiktok_handle}
              onChange={(v) => set("tiktok_handle", v.replace(/^@/, ""))}
              placeholder="ej: novapatch_mx"
              error={errors.tiktok_handle}
            />
          </Field>
        </div>
        {errors.handles && (
          <p className="mt-2 text-xs" style={{ color: CORAL }}>
            {errors.handles}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add validation for `telefono` in `validate(0)`**

In the main component's `validate` function (around line 999), inside the `if (s === 0)` block, add the phone check after the email check and before the handles check:

```ts
    if (s === 0) {
      if (!data.nombre.trim()) e.nombre = "Requerido";
      if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
        e.email = "Ingresa un email válido";
      if (!/^\d{10}$/.test(data.telefono))
        e.telefono = "Ingresa 10 dígitos (sin lada del país)";
      // Al menos un handle (Instagram o TikTok). Ninguno es obligatorio
      // por separado, pero al menos uno tiene que estar.
      if (!data.instagram_handle.trim() && !data.tiktok_handle.trim()) {
        e.handles = "Indica al menos un handle: Instagram o TikTok";
      }
    }
```

- [ ] **Step 5: Verify the submit payload carries `telefono`**

The submit function at line 1046 spreads `...data`, so `telefono` is included automatically. No change needed — confirm by reading the code, no edit required.

- [ ] **Step 6: Type-check the storefront**

Run from the novafrontend repo: `cd /Users/dlucca/Projects/Novapatch/novafrontend && npx tsc --noEmit -p apps/storefront/tsconfig.json`
Expected: PASS, no type errors.

- [ ] **Step 7: Smoke-test in the browser**

Run from `novafrontend`: `pnpm --filter storefront dev` (or whatever the project's dev command is — check `apps/storefront/package.json` if unsure).

Open `http://localhost:3000/mx/influencers#aplicar`. Confirm:
- The phone field appears in Step 1 with the helper text.
- Typing letters or special characters is rejected (stripped to digits).
- Typing fewer than 10 digits and clicking "Continuar" shows the error.
- Typing exactly 10 digits passes validation and Step 2 appears.

- [ ] **Step 8: Commit (in the novafrontend repo)**

```bash
cd /Users/dlucca/Projects/Novapatch/novafrontend
git add apps/storefront/app/\[locale\]/influencers/InfluencerForm.tsx
git commit -m "feat(influencers): collect required telefono on application form"
```

---

## Task 8: End-to-end smoke test

**Files:** none — manual verification only.

- [ ] **Step 1: Run the backend**

In the backend worktree: `npx medusa develop`
Expected: server starts on :9000.

- [ ] **Step 2: Run the storefront**

In novafrontend: start the dev server (see Task 7 Step 7).

- [ ] **Step 3: Submit a real application with a valid phone**

Open the influencers page, fill in all three steps (use any valid 10-digit number like `5512345678`), submit.
Expected: success screen. The backend log should show a 201 response.

- [ ] **Step 4: Verify the application has `telefono` in the DB**

In the backend worktree, run:

```bash
psql $DATABASE_URL -c "SELECT id, nombre, email, telefono FROM influencer_application ORDER BY created_at DESC LIMIT 1;"
```

Expected: the phone you submitted appears in the `telefono` column.

- [ ] **Step 5: Approve the application in admin and try to ship**

Go to the Medusa admin, find the new application, mark it as `aprobado`, then click "Enviar muestras".
Expected: the ship route succeeds and the generated Envia label PDF shows the influencer's phone in the recipient field (not Novapatch's warehouse phone). Open the `label_url` from the response to verify.

- [ ] **Step 6: Verify the legacy guard with a fake legacy row**

Pick any approved application that doesn't yet have a `telefono` (the user mentioned the real legacy rows were resolved, so create a test row if needed: `INSERT INTO influencer_application (..., telefono=NULL, estado='aprobado', ...)`). Try to ship it.
Expected: 422 with message "La postulación no tiene teléfono cargado…". No Envia call is made.

---

## Self-Review Notes

- ✅ Spec section 1 (Data model) → Task 1.
- ✅ Spec section 2 (Frontend form) → Task 7.
- ✅ Spec section 3 (Backend POST) → Tasks 2, 3.
- ✅ Spec section 4 (Envia label fix) → Tasks 4, 5.
- ✅ Spec section 5 (Admin read-only) → Task 6.
- ✅ Spec section 6 (Tests) → Tasks 2, 4.
- ✅ Verification checklist → Task 8.
- ✅ No placeholders, no "TBD", no "similar to Task N".
- ✅ Type names consistent: `validateInfluencerPayload`, `guardShippableApplication`, `buildShipDestination`, `ShippableApplication`, `MX_PHONE_REGEX`.
- ✅ Each task is self-contained and commits at the end.
