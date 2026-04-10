# Medusa Admin en admin.novapatch.care — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer el panel de admin de Medusa en `https://admin.novapatch.care` habilitando el admin en Railway, agregando un redirect `GET /` → `/app`, y configurando DNS en Namecheap.

**Architecture:** El admin de Medusa v2 ya está embebido en el proceso Node.js y sirve la SPA en `/app`. Se agrega una ruta raíz que redirige a `/app`, se habilita el admin en Railway (eliminando `DISABLE_ADMIN=true`), se actualiza CORS, se agrega el custom domain en Railway, y se crea el CNAME en Namecheap.

**Tech Stack:** Medusa.js v2.13.1, TypeScript, Railway, Namecheap DNS

---

## File Map

| Acción | Archivo |
|--------|---------|
| Crear | `src/api/route.ts` — handler `GET /` → redirect `/app` |
| Crear | `integration-tests/http/root-redirect.spec.ts` — test del redirect |
| Modificar | `.env.template` — documentar ADMIN_CORS y AUTH_CORS con dominio de producción |

---

## Task 1: Root redirect `GET /` → `/app`

**Files:**
- Create: `src/api/route.ts`
- Create: `integration-tests/http/root-redirect.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `integration-tests/http/root-redirect.spec.ts`:

```typescript
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api }) => {
    describe("Root redirect", () => {
      it("GET / returns 302 redirect to /app", async () => {
        const response = await api.get("/", {
          maxRedirects: 0,
          validateStatus: () => true,
        })
        expect(response.status).toEqual(302)
        expect(response.headers["location"]).toEqual("/app")
      })
    })
  },
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
TEST_TYPE=integration:http npx jest root-redirect --no-coverage
```

Esperado: FAIL — `expected 404, received 302` o similar (la ruta no existe aún).

- [ ] **Step 3: Implementar la ruta**

Crear `src/api/route.ts`:

```typescript
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.redirect("/app")
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
TEST_TYPE=integration:http npx jest root-redirect --no-coverage
```

Esperado: PASS — 1 test suite, 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/route.ts integration-tests/http/root-redirect.spec.ts
git commit -m "feat(admin): add root redirect GET / -> /app"
```

---

## Task 2: Actualizar .env.template

**Files:**
- Modify: `.env.template`

- [ ] **Step 1: Actualizar las variables de CORS**

En `.env.template`, actualizar las líneas de CORS para documentar que en producción se incluye el dominio del admin:

```bash
# ── CORS ───────────────────────────────────────────────────────────────────────
STORE_CORS=http://localhost:3000
ADMIN_CORS=http://localhost:5173,http://localhost:9000
AUTH_CORS=http://localhost:3000,http://localhost:5173,http://localhost:9000
# En producción Railway agregar:
# ADMIN_CORS=...,https://admin.novapatch.care
# AUTH_CORS=...,https://admin.novapatch.care
```

- [ ] **Step 2: Commit**

```bash
git add .env.template
git commit -m "docs(env): document production ADMIN_CORS and AUTH_CORS for admin domain"
```

---

## Task 3: Configurar variables de entorno en Railway

> Estos pasos son manuales en el dashboard de Railway. No hay código.

- [ ] **Step 1: Abrir el servicio en Railway**

Ir a [railway.app](https://railway.app) → proyecto Novapatch → servicio `novabackend`.

- [ ] **Step 2: Eliminar o deshabilitar DISABLE_ADMIN**

En la pestaña **Variables**, encontrar `DISABLE_ADMIN` y:
- Eliminarlo, **o**
- Cambiar su valor a `false`

- [ ] **Step 3: Actualizar ADMIN_CORS**

Editar la variable `ADMIN_CORS`. Agregar `https://admin.novapatch.care` separado por coma del valor existente.

Ejemplo del valor resultante:
```
https://novafrontend-theta.vercel.app,https://admin.novapatch.care
```

> Nota: el valor actual de `ADMIN_CORS` en Railway puede diferir del `.env` local — verificar antes de editar.

- [ ] **Step 4: Actualizar AUTH_CORS**

Editar la variable `AUTH_CORS`. Agregar `https://admin.novapatch.care` al valor existente.

- [ ] **Step 5: Hacer redeploy**

En Railway, ir a la pestaña **Deployments** y triggear un nuevo deploy (o guardar las variables — Railway hace redeploy automático al guardar).

Verificar en los logs que el servidor arranca sin errores y que la línea `Admin dashboard: http://...` aparece (indica que el admin está activo).

---

## Task 4: Agregar custom domain en Railway

> Pasos manuales en Railway.

- [ ] **Step 1: Ir a Settings → Networking del servicio**

En el servicio `novabackend` de Railway, ir a la pestaña **Settings** → sección **Networking** → **Custom Domains**.

- [ ] **Step 2: Agregar el dominio**

Hacer clic en **Add Custom Domain** y escribir:
```
admin.novapatch.care
```

- [ ] **Step 3: Anotar el hostname de verificación**

Railway mostrará un hostname de destino para el CNAME, algo como:
```
novabackend-production-7977.up.railway.app
```
O un hostname de verificación tipo `CNAME admin.novapatch.care → <hash>.railway.app`.

Copiar ese valor — se usará en el siguiente task.

---

## Task 5: Configurar DNS en Namecheap

> Pasos manuales en Namecheap.

- [ ] **Step 1: Abrir Advanced DNS del dominio novapatch.care**

En Namecheap → dashboard → dominio `novapatch.care` → **Manage** → pestaña **Advanced DNS**.

- [ ] **Step 2: Agregar el CNAME record**

Hacer clic en **Add New Record**:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| CNAME Record | `admin` | `<hostname copiado de Railway en Task 4 Step 3>` | Automatic |

- [ ] **Step 3: Guardar**

Hacer clic en el checkmark para guardar el record.

- [ ] **Step 4: Esperar propagación**

La propagación de DNS puede tardar entre 1 y 30 minutos. Verificar con:

```bash
dig CNAME admin.novapatch.care +short
```

Esperado: el hostname de Railway como respuesta.

---

## Task 6: Verificación end-to-end

- [ ] **Step 1: Verificar redirect raíz**

```bash
curl -I https://admin.novapatch.care/
```

Esperado:
```
HTTP/2 302
location: /app
```

- [ ] **Step 2: Verificar que el admin carga**

Abrir `https://admin.novapatch.care` en el browser. Debe redirigir a `https://admin.novapatch.care/app` y mostrar el login de Medusa Admin.

- [ ] **Step 3: Login con usuario admin**

Ingresar con las credenciales del usuario admin (creado con `npx medusa user -e EMAIL -p PASS`). Verificar que productos, órdenes y clientes de producción cargan correctamente.

- [ ] **Step 4: Verificar que la API del store no se rompió**

```bash
curl https://novabackend-production-7977.up.railway.app/health
```

Esperado: `200 OK`

- [ ] **Step 5: Verificar TLS**

El certificado de `admin.novapatch.care` debe ser válido (Railway lo emite vía Let's Encrypt automáticamente al verificar el CNAME). En el browser verificar el candado en la URL.

---

## Self-review

- **Spec coverage:** ✓ redirect `/` → `/app`, ✓ DISABLE_ADMIN, ✓ ADMIN_CORS/AUTH_CORS, ✓ Railway custom domain, ✓ Namecheap CNAME, ✓ checklist de verificación
- **Placeholders:** ninguno — todos los comandos y valores son concretos
- **Type consistency:** solo un archivo de código (`route.ts`) — no hay dependencias entre tasks que puedan desalinearse
