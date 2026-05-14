# Influencer Form: Required Phone Field + Envia Label Fix

**Status:** Approved — ready for implementation plan
**Date:** 2026-05-14
**Author:** Diego (via brainstorming session)

## Context

The influencer application form does not collect a phone number. When the admin generates an Envia shipping label for a sample shipment, the destination phone is hardcoded to `""` in [src/api/admin/influencers/[id]/ship/route.ts:125](src/api/admin/influencers/[id]/ship/route.ts). Envia, on receiving an empty destination phone, prints the shipper's (warehouse / Novapatch) phone in the recipient phone field of the physical label. When the courier tries to call the recipient on delivery, they end up calling Novapatch instead of the influencer.

## Goals

1. Collect a real, validated phone number from every new influencer applicant.
2. Pass that phone through to Envia so it appears in the recipient field of the shipping label.
3. Tell the user clearly *why* we need the phone (delivery contact, not marketing).

## Non-goals

- Editing the phone field from the admin (read-only display only).
- Migration / backfill of pre-existing applications (the user resolved these manually).
- External phone-validation services (Twilio Lookup, etc.) — regex only.
- Internationalization of the phone format. The influencer page is MX-only today; when we expand we'll generalize.

## Design

### 1. Data model

Add a nullable `telefono` column to `InfluencerApplication` in [src/modules/influencer/models/influencer-application.ts](src/modules/influencer/models/influencer-application.ts):

```ts
telefono: model.text().nullable(),
```

Nullable at the DB level so legacy rows (no phone) don't break. The API enforces required for new applications.

Generate the migration:

```bash
npx medusa db:generate influencerModuleService
```

### 2. Frontend form (Step 1)

In [apps/storefront/app/[locale]/influencers/InfluencerForm.tsx](../../novafrontend/apps/storefront/app/[locale]/influencers/InfluencerForm.tsx):

- Add `telefono: string` to the `FormData` interface and `telefono: ""` to the `EMPTY` constant.
- In `Step1`, add the new field below the name/email grid (full width or in a 2-col grid alongside something — designer's call during implementation, prefer full width for clarity):

  - **Label:** "Teléfono móvil" (required marker via `<Field required>`)
  - **Placeholder:** `55 1234 5678`
  - **Helper text** (small text above or below the input, same visual style as the handles hint at line 428-432): *"Necesitamos tu número para que el repartidor pueda contactarte cuando entregue tus muestras. No lo usamos para marketing."*
  - **Input behavior:** `onChange` strips non-digits and caps at 10 chars: `v.replace(/\D/g, "").slice(0, 10)`.
  - **Validation in `validate(0)`:** `if (!/^\d{10}$/.test(data.telefono)) e.telefono = "Ingresa 10 dígitos (sin lada del país)"`.

- Submit payload already spreads `...data`, so `telefono` flows to the backend automatically.

### 3. Backend POST `/store/influencers`

In [src/api/store/influencers/route.ts](src/api/store/influencers/route.ts):

- Add `"telefono"` to the `required` array.
- After the required loop, validate format: `if (!/^\d{10}$/.test(body.telefono as string)) return res.status(400).json({ error: "Teléfono inválido: 10 dígitos" })`.
- Pass `telefono: body.telefono as string` to `createInfluencerApplications`.

### 4. Envia label fix (the actual recipient-phone bug)

In [src/api/admin/influencers/[id]/ship/route.ts](src/api/admin/influencers/[id]/ship/route.ts):

- After the `application.direccion` null-check (line 94), add a defensive check:
  ```ts
  if (!application.telefono) {
    return res.status(422).json({
      error: "La postulación no tiene teléfono cargado. No se puede generar la etiqueta sin un contacto de entrega.",
    })
  }
  ```
- Change line 125 from `phone: ""` to `phone: application.telefono`.

This is the actual fix for the production bug. The form-collection work above ensures we never hit the defensive 422 for new applications.

### 5. Admin (read-only display)

In the influencer detail route under [src/admin/routes/influencers/](src/admin/routes/influencers/), surface `telefono` in the application detail view next to email and name. No edit UI, no PATCH endpoint changes. If the field is null (legacy), show "—" or "No registrado".

### 6. Tests

- **Unit** — `src/__tests__/api/store-influencers-post.unit.spec.ts` (or extend if exists): reject POST without `telefono`; reject POST with non-10-digit `telefono`; accept POST with valid 10-digit `telefono`.
- **Unit** — extend the existing ship-route test (search for one near `__tests__/api/`): assert 422 when `application.telefono` is null; assert `mapAddress` is called with the application's phone when present.
- **Fixtures** — every test fixture that calls `createInfluencerApplications` must include a valid `telefono`. Grep for `createInfluencerApplications(` in the test tree and update each one.

## Risks

- **Envia API quirk persistence:** the assumption is that passing a real `phone` in the destination prevents the warehouse-phone fallback on the printed label. If Envia still prints the wrong phone with a real value, we'll need to investigate further (possibly an Envia account setting). Verify by inspecting a generated label after deploy.
- **Form drop-off:** adding a required field always costs some completions. The helper text mitigates this by explaining why. Acceptable trade-off.

## Verification checklist (post-deploy)

- [ ] Submit the form without phone → blocked client-side with clear error.
- [ ] Submit the form with `123` → blocked client-side with "10 dígitos" error.
- [ ] Submit the form with a real 10-digit number → application created with `telefono` populated.
- [ ] Try to ship samples on a legacy application without `telefono` → 422 with clear admin-facing error.
- [ ] Ship samples on a new application with `telefono` → generated Envia label shows the influencer's phone in the recipient field (not Novapatch's).
- [ ] Admin detail view shows the phone for new applications, "—" for legacy.
