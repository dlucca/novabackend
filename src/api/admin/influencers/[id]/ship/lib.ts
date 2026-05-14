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
  instructions?: string | null
} | null

export type ShippableApplication = {
  estado: string
  tracking_number: string | null
  parches: readonly string[] | string[] | null | undefined
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

  // Pass the raw street (which may already include a number like "Insurgentes Sur 1234")
  // as address_1 so that mapAddress / splitStreetNumber can split it correctly.
  // Interior is appended AFTER mapAddress returns — appending it to address_1 would
  // confuse splitStreetNumber into treating the interior number as the street number.
  const base = mapAddress({
    first_name: fullName,
    last_name: "",
    address_1: (direccion.street ?? "").trim(),
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

  const instructions = (direccion.instructions ?? "").trim()
  return {
    ...base,
    ...(sanitizedInterior ? { street: `${base.street} Int ${sanitizedInterior}` } : {}),
    ...(instructions ? { reference: instructions } : {}),
  }
}
