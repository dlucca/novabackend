# Medusa Admin en admin.novapatch.care

**Fecha:** 2026-04-10  
**Branch:** feat/admin-custom-domain  
**Estado:** aprobado

---

## Objetivo

Exponer el panel de administración de Medusa v2 públicamente en `https://admin.novapatch.care`, reemplazando el acceso local actual (`localhost:9000/app` apuntando a la DB de producción).

---

## Arquitectura

El admin de Medusa v2 está embebido en el mismo proceso Node.js del backend y se sirve como SPA en la ruta `/app`. Se reutiliza el servicio Railway existente — no se crea infraestructura nueva.

```
Usuario → admin.novapatch.care (CNAME → Railway)
             │
             ▼
  Railway: novabackend-production-7977.up.railway.app
             │
     GET /   → 302 redirect → /app
     GET /app → SPA Medusa Admin
             │
             ▼
     API interna: /admin/* (mismo proceso)
```

---

## Componentes

### 1. Redirect `GET /` → `/app`

Archivo: `src/api/root/route.ts` (nuevo)

Handler HTTP mínimo que responde `302` a `/app` para que `admin.novapatch.care` lleve directo al dashboard sin que el usuario tenga que recordar la ruta `/app`.

### 2. Variables de entorno (Railway)

| Variable | Valor actual | Cambio |
|----------|-------------|--------|
| `DISABLE_ADMIN` | `true` | Eliminar o setear `false` |
| `ADMIN_CORS` | `http://localhost:5173` | Agregar `https://admin.novapatch.care` |
| `AUTH_CORS` | `http://localhost:3000` | Agregar `https://admin.novapatch.care` |

### 3. Custom domain en Railway

Agregar `admin.novapatch.care` al servicio `novabackend` en Railway. Railway emite certificado TLS automáticamente vía Let's Encrypt.

### 4. DNS en Namecheap

Crear CNAME record:
- **Host:** `admin`
- **Value:** hostname provisto por Railway al agregar el custom domain (ej. `novabackend-production-7977.up.railway.app`)
- **TTL:** Automatic

---

## Seguridad

- Auth nativa de Medusa: email + password con JWT. Suficiente para el estado actual.
- TLS gestionado por Railway (Let's Encrypt, renovación automática).
- No se agrega IP allowlist ni capa de auth adicional en esta iteración.

---

## Fuera de alcance

- Servicio Railway separado para el admin.
- IP allowlist o autenticación adicional (2FA, SSO).
- Cambios en el store frontend o en las rutas `/store/*`.

---

## Checklist de verificación post-deploy

- [ ] `https://admin.novapatch.care` redirige a `https://admin.novapatch.care/app`
- [ ] Login con usuario admin existente funciona
- [ ] El dashboard carga productos, órdenes y clientes de producción
- [ ] `localhost:9000/app` sigue funcionando en desarrollo local
- [ ] La API del store (`/store/*`) no se ve afectada
