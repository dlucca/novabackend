# Novapatch Storefront

Frontend de e-commerce de Novapatch — plataforma de parches vitamínicos por suscripción para México. Construido sobre Next.js 15 App Router con integración completa de Medusa, Clerk, Openpay y Google Maps.

---

## Tabla de contenidos

1. [Stack tecnológico](#stack-tecnológico)
2. [Estructura del proyecto](#estructura-del-proyecto)
3. [Variables de entorno](#variables-de-entorno)
4. [Comandos](#comandos)
5. [Sistema de diseño](#sistema-de-diseño)
6. [Arquitectura](#arquitectura)
7. [Módulos y librerías](#módulos-y-librerías)
8. [Hooks](#hooks)
9. [Contextos](#contextos)
10. [Rutas API](#rutas-api)
11. [Páginas](#páginas)
12. [Componentes](#componentes)
13. [Integraciones externas](#integraciones-externas)
14. [Flujos de datos](#flujos-de-datos)
15. [Seguridad](#seguridad)

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15.2.8 — App Router, React Server Components |
| UI | React 19, TypeScript 5 (strict mode) |
| Estilos | Tailwind CSS v4, PostCSS |
| Animaciones | Framer Motion 12 |
| Íconos | Lucide React, Heroicons v2 |
| Auth | Clerk v6 (`@clerk/nextjs`) |
| E-Commerce | Medusa v2 (headless backend REST) |
| Pagos | Openpay (gateway mexicano, PCI-DSS) |
| Componentes UI | shadcn/ui (New York style, neutral) |
| Geolocalización | Google Maps API + COPOMEX |

---

## Estructura del proyecto

```
apps/storefront/
├── app/
│   ├── layout.tsx                      # Layout raíz — ClerkProvider, CartProvider, scripts Openpay
│   ├── globals.css                     # Design system — tokens de color, tipografía, scrollbar, pac-container
│   ├── middleware.ts                   # Protección de rutas con Clerk
│   ├── page.tsx                        # Home — composición de secciones
│   ├── api/
│   │   ├── copomex/route.ts            # GET /api/copomex?cp= → proxy COPOMEX (token server-side)
│   │   └── validate-address/route.ts   # POST /api/validate-address → proxy Google Address Validation
│   ├── tienda/page.tsx                 # Listado de productos (Server Component)
│   ├── checkout/page.tsx               # Flujo de checkout completo (Client Component)
│   ├── cuenta/
│   │   └── suscripciones/page.tsx      # Portal de suscripciones (protegido por Clerk)
│   ├── sign-in/[[...sign-in]]/page.tsx # Página de inicio de sesión custom
│   ├── sign-up/[[...sign-up]]/page.tsx # Página de registro custom
│   ├── nosotros/page.tsx
│   ├── faq/page.tsx
│   ├── suscripciones/page.tsx
│   ├── contacto/page.tsx
│   ├── garantia/page.tsx
│   ├── reembolso/page.tsx
│   ├── privacidad/page.tsx
│   └── terminos/page.tsx
├── components/
│   ├── ui/                             # shadcn/ui: button, card, input, select, badge, table, textarea
│   ├── home/                           # Secciones de la home
│   │   ├── HeroWithBar.tsx             # Hero + AttributeBar con estado de carrusel compartido
│   │   ├── HeroSection.tsx             # Hero principal con CTA
│   │   ├── AttributeBar.tsx            # Barra de atributos del producto
│   │   ├── AbsorptionSection.tsx       # Sección de absorción transdérmica (fondo navy)
│   │   ├── HowItWorks.tsx              # Proceso en 3 pasos
│   │   ├── ComparisonTable.tsx         # Novapatch vs vitaminas tradicionales
│   │   ├── ProductGrid.tsx             # Cards de productos con selector de modo/frecuencia
│   │   ├── Testimonials.tsx            # Reseñas de clientes
│   │   ├── CTABanner.tsx               # Banner de suscripción
│   │   └── HomeFAQ.tsx                 # Preguntas frecuentes expandibles
│   ├── store/
│   │   └── TiendaExperience.tsx        # Experiencia de tienda completa con filtros y carrito
│   ├── Navbar.tsx                      # Barra de navegación responsive con auth y carrito
│   ├── CartDrawer.tsx                  # Panel deslizante del carrito
│   └── Footer.tsx                      # Pie de página con links y políticas
├── contexts/
│   └── CartContext.tsx                 # Estado global del carrito (localStorage + eventos)
├── hooks/
│   ├── useGooglePlaces.ts              # Autocomplete de Google Places para el campo de calle
│   └── useCopomex.ts                   # Lookup de CP → colonias/municipio/estado
├── lib/
│   ├── cart.ts                         # Utilidades del carrito (CRUD localStorage)
│   ├── medusa.ts                       # Cliente REST completo de Medusa v2
│   ├── openpay.ts                      # Wrapper del SDK de Openpay (tokenización)
│   ├── commerce.ts                     # Abstracción del catálogo (Medusa + fallback)
│   ├── clerk-theme.ts                  # Tema visual y localización en español para Clerk
│   └── product-meta.ts                 # Metadatos de productos (descripciones, ingredientes, colores)
├── public/
│   └── logos/                          # logowht.webp, logocolor.webp
├── next.config.js
├── tsconfig.json
├── middleware.ts
└── .env.local
```

---

## Variables de entorno

Crear `.env.local` en `apps/storefront/`:

```bash
# ── Clerk (Auth) ───────────────────────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/

# ── Medusa (Backend) ───────────────────────────────────────────────────────────
NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_MEDUSA_REGION_ID=reg_mx_placeholder   # ID de la región México en Medusa

# ── Openpay (Pagos México) ─────────────────────────────────────────────────────
NEXT_PUBLIC_OPENPAY_MERCHANT_ID=...
NEXT_PUBLIC_OPENPAY_PUBLIC_KEY=...
NEXT_PUBLIC_OPENPAY_SANDBOX=true                   # false en producción

# ── Google (Dirección) ─────────────────────────────────────────────────────────
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...               # Maps JS API + Places API habilitados
GOOGLE_ADDRESS_VALIDATION_KEY=...                 # Address Validation API (server-side)

# ── COPOMEX (Código Postal México) ─────────────────────────────────────────────
COPOMEX_TOKEN=...                                 # Token de copomex.com (server-side)
```

> **Regla de oro:** Las keys con `NEXT_PUBLIC_` son visibles en el browser. Las keys sin ese prefijo (`COPOMEX_TOKEN`, `GOOGLE_ADDRESS_VALIDATION_KEY`, `CLERK_SECRET_KEY`) solo corren en el servidor y nunca se exponen al cliente.

---

## Comandos

Todos los comandos se ejecutan desde `apps/storefront/`:

```bash
pnpm install        # Instalar dependencias
pnpm dev            # Servidor de desarrollo en http://localhost:3000
pnpm build          # Build de producción
pnpm start          # Servidor de producción
pnpm lint           # ESLint
```

---

## Sistema de diseño

### Paleta de colores

Definida como custom properties en `app/globals.css` vía `@theme` de Tailwind v4:

| Token | Hex | Uso |
|---|---|---|
| `--color-coral` | `#E8503A` | CTA primario, accents, badges |
| `--color-coral-light` | `#FF7A65` | Hover states |
| `--color-coral-dark` | `#C43B28` | Active states |
| `--color-navy` | `#0D1B35` | Texto, fondos oscuros |
| `--color-navy-light` | `#1D3461` | Títulos secundarios |
| `--color-sky` | `#5BA8D5` | Accents secundarios, links |
| `--color-sky-light` | `#B8DDEF` | Fondos de cards |
| `--color-sky-pale` | `#EAF5FB` | Hover de items |
| `--color-cream` | `#FAF7F2` | Fondos claros de página |
| `--color-lime` | `#C9D849` | Highlights de oferta |
| `--color-lime-dark` | `#A8B42A` | Texto sobre lime |

### Tipografía

- **Display y body:** `"Avenir Next"`, `"Montserrat"`, `"Helvetica Neue"`, sans-serif
- Escalas: 11px (micro), 12px (labels), 14px (body), 16px (lead), 22–48px (headings)
- Pesos: 500 (regular), 600 (semibold), 700 (bold), 800–900 (black)

### Bordes y sombras

- Bordes redondeados: `0.75rem` (inputs), `1.25rem` (cards), `2rem` (secciones grandes)
- Sombra sutil: `0 2px 16px rgba(0, 80, 136, 0.05)`
- Sombra media: `0 8px 32px rgba(13, 27, 53, 0.12)`

### Modelo de suscripción

| Frecuencia | Descuento | Label |
|---|---|---|
| 30 días | 20% | Mensual |
| 60 días | 15% | Bimestral |
| 90 días | 10% | Trimestral |

---

## Arquitectura

### Server vs. Client Components

Next.js 15 App Router: los pages son Server Components por defecto. Se marca `"use client"` únicamente cuando se necesitan hooks, estado o APIs del browser.

| Tipo | Ejemplos |
|---|---|
| Server Components | `app/tienda/page.tsx`, `app/layout.tsx`, páginas de contenido estático |
| Client Components | `app/checkout/page.tsx`, todos los componentes de `components/home/`, `CartDrawer`, `Navbar` |
| Shared (sin directiva) | `lib/cart.ts`, `lib/medusa.ts`, `lib/openpay.ts`, `lib/clerk-theme.ts` |

### Configuración de Next.js (`next.config.js`)

```js
transpilePackages: ["@clerk/nextjs", "@clerk/localizations"]
```

Necesario para que webpack procese correctamente los paquetes de Clerk en el contexto RSC y evitar el error `__webpack_modules__[moduleId] is not a function` durante la hidratación.

### Middleware de protección de rutas

```ts
// middleware.ts
const isProtectedRoute = createRouteMatcher(["/cuenta(.*)"]);
export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
});
```

Las rutas de `/cuenta/*` requieren sesión activa de Clerk. El checkout maneja su propia lógica de auth en el componente para el caso de ítems con suscripción.

---

## Módulos y librerías

### `lib/cart.ts` — Carrito en localStorage

Gestión del estado del carrito en el browser. Todas las funciones tienen guards `typeof window === "undefined"`.

```ts
type CartItem = {
  slug: string;
  title: string;
  image: string;
  price: number;          // MXN, precio regular sin descuento
  color: string;          // Color accent del producto
  bg: string;             // Color de fondo del producto
  mode: "once" | "sub";  // Compra única o suscripción
  freq: 30 | 60 | 90;    // Frecuencia de envío en días
  quantity: number;
  variantId?: string;     // ID de variante en Medusa (cuando esté disponible)
};
```

**Funciones exportadas:**

| Función | Descripción |
|---|---|
| `getCart()` | Lee el carrito de localStorage |
| `addToCart(item)` | Agrega o acumula quantity por clave (slug + mode + freq) |
| `updateQuantity(slug, mode, freq, delta)` | Ajusta quantity; elimina si llega a 0 |
| `removeFromCart(slug, mode, freq)` | Elimina un ítem |
| `clearCart()` | Vacía el carrito |
| `getCartItemCount()` | Total de unidades en el carrito |
| `itemDisplayPrice(item)` | Precio con descuento de suscripción aplicado |
| `cartTotals(items)` | `{ subtotal, savings, total }` |
| `cartKey(item)` | Clave única: `"slug__mode__freq"` |

**Storage:** `localStorage["novapatch_cart"]`
**Evento:** `"cart:updated"` — disparado en cada modificación para sincronizar entre componentes.

---

### `lib/medusa.ts` — Cliente REST de Medusa v2

Implementa el mapa de integración completo en 5 secciones. La URL base se configura con `NEXT_PUBLIC_MEDUSA_BACKEND_URL`.

#### 1. Catálogo (público)

```ts
medusa.catalog.getProducts({ region_id? })  // GET /store/products
medusa.catalog.getVariant(id)               // GET /store/variants/:id
```

#### 2. Carrito (público)

```ts
medusa.cart.create(region_id)               // POST /store/carts
medusa.cart.addOnceItem(cart_id, variant_id, qty)
// POST /store/carts/:id/line-items → { variant_id, quantity }

medusa.cart.addSubscriptionItem(cart_id, variant_id, interval_days, discount_pct, qty)
// POST /store/carts/:id/line-items → metadata: { is_subscription, interval_days, discount_percentage }

medusa.cart.updateItem(cart_id, line_id, qty)
// POST /store/carts/:id/line-items/:line_id → { quantity }

medusa.cart.ensure(region_id)               // Obtiene cart_id de localStorage o crea uno nuevo
```

#### 3. Checkout y pagos

```ts
medusa.checkout.createPaymentSession(cart_id)
// POST /store/carts/:id/payment-sessions → selecciona plugin Openpay

medusa.checkout.completeCart(cart_id, openpay_token_id)
// POST /store/carts/:id/complete → { openpay_token_id }
```

#### 4. Suscripciones (JWT requerido)

```ts
medusa.subscriptions.list(token)                             // GET /store/me/subscriptions
medusa.subscriptions.pause(sub_id, token)                    // POST /store/me/subscriptions/:id/pause
medusa.subscriptions.resume(sub_id, token)                   // POST /store/me/subscriptions/:id/resume
medusa.subscriptions.cancel(sub_id, token)                   // POST /store/me/subscriptions/:id/cancel
medusa.subscriptions.updateFrequency(sub_id, days, token)    // POST /store/me/subscriptions/:id/frequency
```

#### 5. Métodos de pago (JWT requerido)

```ts
medusa.paymentMethods.list(token)                           // GET /store/me/payment-methods
medusa.paymentMethods.setDefault(openpay_token_id, token)   // POST /store/me/payment-methods/default
```

Todas las rutas protegidas envían `Authorization: Bearer <token>` en el header.

---

### `lib/openpay.ts` — Wrapper del SDK de Openpay

El SDK de Openpay se carga vía `<Script>` en `app/layout.tsx`. Este módulo lo expone como async/await tipado.

**Flujo de pago (triangular):**

```
Browser                    Openpay                    Medusa
  │                           │                          │
  │── cardData ──────────────►│                          │
  │◄─ tok_XXX ────────────────│                          │
  │                           │                          │
  │── deviceSessionId ─────────────────────────────────►│
  │── openpay_token_id ─────────────────────────────────►│
  │                           │◄─── cobro ──────────────│
  │◄─── orden creada ──────────────────────────────────-│
```

```ts
// Funciones públicas
getDeviceSessionId(formId?, fieldName?): string | null
// Genera fingerprint anti-fraude (openpay-data.js)

tokenizeCard(cardData: OpenpayCardData): Promise<string>
// Tokeniza la tarjeta directo a Openpay → devuelve "tok_XXX"

parseCardForm(number, name, expiry, cvv): OpenpayCardData
// Convierte "4111 1111 1111 1111", "MARIA GARCIA", "08/27", "123" al formato de Openpay

translateOpenpayError(err): string
// Traduce códigos de error Openpay (2004–3012) a mensajes en español
```

**Variables de entorno:**

```bash
NEXT_PUBLIC_OPENPAY_MERCHANT_ID=...
NEXT_PUBLIC_OPENPAY_PUBLIC_KEY=...
NEXT_PUBLIC_OPENPAY_SANDBOX=true   # true → sandbox-api.openpay.mx
```

---

### `lib/commerce.ts` — Abstracción del catálogo

Capa de acceso a productos con fallback automático para desarrollo sin backend.

```ts
type Product = {
  id: string;
  slug: string;
  title: string;
  description: string;
  price: number;        // MXN, precio regular
  image: string;
  variantId?: string;   // ID de variante en Medusa
};

getProducts(): Promise<Product[]>
// 1. Intenta GET /store/products en Medusa
// 2. Si falla → usa PRODUCT_META de product-meta.ts como fallback
// 3. Ordena según PRODUCT_ORDER = ["shield", "glow", "sleep", "energy", "zen", "woman"]
```

---

### `lib/clerk-theme.ts` — Tema y localización de Clerk

Configuración centralizada de la apariencia y el idioma de todos los componentes de Clerk.

**`novapatchAppearance`** — Se pasa al `ClerkProvider` en `layout.tsx` y a los componentes `<SignIn>`, `<SignUp>`, `<UserButton>`:

```ts
{
  variables: {
    colorPrimary: "#E8503A",       // coral
    colorText: "#005088",          // navy
    colorBackground: "#FFFFFF",
    colorDanger: "#E8503A",
    colorSuccess: "#059669",
    borderRadius: "0.75rem",
    fontFamily: "inherit",
  },
  elements: {
    card: "rounded-xl shadow-[...]",
    formButtonPrimary: "bg-[#E8503A] shadow-[...] font-bold",
    formFieldLabel: "text-[11px] uppercase tracking-wide text-[#005088]",
    // ... estilos completos de todos los elementos
  }
}
```

**`esLocalization`** — Merge profundo de `esMX` (base oficial) con overrides de Novapatch:

- Subtítulo sign-in: "Ingresá a tu cuenta de Novapatch"
- Subtítulo sign-up: "Regístrate para gestionar tus pedidos y suscripciones"
- Email de soporte: soporte@novapatch.mx
- Placeholder de teléfono MX: "+52 55 0000 0000"

---

### `lib/product-meta.ts` — Metadatos de productos

Fuente de verdad para la información de marca de cada producto. Usado como fallback en `commerce.ts` y como fuente de descripciones/ingredientes en los componentes.

```ts
type ProductMeta = {
  slug: string;
  name: string;
  description: string;      // Copy de marketing completo
  ingredients: string[];    // Lista de ingredientes activos
  imgSrc: string;
  color: string;            // Color accent (hex)
  bg: string;               // Color de fondo (hex o gradient)
  taglineColor: string;
  quote: string;
  tags: string[];
  popular?: boolean;
};
```

**Productos:** `energy`, `shield`, `glow`, `sleep`, `zen`, `woman`
**Orden canónico:** `PRODUCT_ORDER = ["energy", "sleep", "glow", "shield", "zen", "woman"]`

---

## Hooks

### `hooks/useGooglePlaces.ts` — Autocomplete de dirección

Inicializa el widget de Google Places Autocomplete en el campo de calle del checkout.

```ts
type PlaceAddressParts = {
  street: string;    // route + street_number
  colonia: string;   // sublocality_level_1 / neighborhood
  city: string;      // locality / alcaldía
  state: string;     // administrative_area_level_1
  zip: string;       // postal_code
};

useGooglePlaces(
  inputRef: React.RefObject<HTMLInputElement | null>,
  onPlace: (parts: PlaceAddressParts) => void
): { ready: boolean; error: string | null }
```

**Características:**

- **Singleton de carga:** Un solo script `#google-maps-script` en el DOM aunque el hook se monte varias veces
- **Sin stale closure:** `onPlaceRef` actualizado en cada render para que el callback siempre use el estado más reciente
- **Retry hasta 3s:** Si el script resuelve antes de que el formulario aparezca (ej. durante el spinner de carga), reintenta cada 100ms hasta que `inputRef.current` esté en el DOM
- **Fallback de calle:** Si `address_components` no devuelve `route + street_number` (frecuente en México), usa el texto completo del input como `street`
- **Restricción por país:** `componentRestrictions: { country: "mx" }`
- **Limpieza:** `clearInstanceListeners` en el unmount

**Requisitos en Google Cloud Console:**
- Maps JavaScript API ✓
- Places API (legacy) ✓

---

### `hooks/useCopomex.ts` — Lookup por Código Postal

Convierte un CP de 5 dígitos en municipio, estado, ciudad y lista de colonias.

```ts
type CopomexResult = {
  municipio: string;
  estado: string;
  ciudad: string;
  colonias: string[];   // Ordenadas A-Z, sin duplicados
};

useCopomex(): {
  state: { status: "idle" | "loading" | "error" }
        | { status: "success"; data: CopomexResult };
  lookup: (cp: string) => Promise<void>;
  reset: () => void;
}
```

**Características:**

- Usa el proxy server-side `/api/copomex` para mantener el token oculto
- `AbortController` cancela requests en vuelo si el usuario cambia el CP rápidamente
- Guard `lastCp` evita requests duplicados al mismo código postal
- Valida que el CP tenga exactamente 5 dígitos antes de hacer el request

---

## Contextos

### `contexts/CartContext.tsx` — Estado global del carrito

```ts
type CartContextType = {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addToCart: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  updateQty: (slug: string, mode: "once" | "sub", freq: 30|60|90, delta: number) => void;
  removeItem: (slug: string, mode: "once" | "sub", freq: 30|60|90) => void;
};
```

**Comportamiento:**

- Sincroniza con `localStorage` en cada operación
- Escucha `"cart:updated"` y `"storage"` (multi-tab sync)
- Cierra el drawer con `Escape`
- Abre el drawer automáticamente al agregar un ítem
- El hook `useCart()` lanza error si se usa fuera de `CartProvider`

---

## Rutas API

### `GET /api/copomex?cp=XXXXX`

Proxy server-side para la API de COPOMEX. Mantiene el token fuera del browser.

**Query param:** `cp` — 5 dígitos (obligatorio)

**Respuesta exitosa (`200`):**
```json
{
  "municipio": "Miguel Hidalgo",
  "estado": "Ciudad de México",
  "ciudad": "Ciudad de México",
  "colonias": ["Anáhuac I Sección", "Anáhuac II Sección", "Anzures", "...]
}
```

**Errores:**
- `400` — CP no tiene 5 dígitos
- `404` — CP no encontrado en COPOMEX
- `500` — Token no configurado
- `502` — Error HTTP de COPOMEX
- `503` — Error de red

**Caché:** 24 horas (los CPs no cambian)

---

### `POST /api/validate-address`

Proxy server-side para Google Address Validation API.

**Body:**
```json
{ "street": "Laguna de Mayran 166", "colonia": "Anáhuac I Sección", "city": "Miguel Hidalgo", "state": "Ciudad de México", "zip": "11320" }
```

**Respuesta exitosa (`200`):**
```json
{
  "valid": true,
  "verdict": { ... },
  "issues": [],
  "standardized": "Laguna de Mayran 166, Anáhuac I Sección, Miguel Hidalgo, CDMX, 11320"
}
```

**Degradación elegante:** Si el API key no está configurado o la llamada falla, devuelve `{ valid: true }` — nunca bloquea una compra.

---

## Páginas

### Home (`app/page.tsx`)

Composición de secciones en orden:

1. `<Navbar>` — Transparente sobre hero, se vuelve cream al hacer scroll
2. `<HeroWithBar>` — Hero + carrusel de atributos
3. `<HowItWorks>` — Proceso en 3 pasos con íconos
4. `<AbsorptionSection>` — Ciencia de absorción transdérmica (fondo navy oscuro)
5. `<ComparisonTable>` — Novapatch vs vitaminas tradicionales
6. `<ProductGrid>` — Cards de los 6 productos con selector de modo y frecuencia
7. `<Testimonials>` — Carrusel de reseñas de clientes
8. `<CTABanner>` — Llamado a suscripción con descuentos
9. `<HomeFAQ>` — Preguntas frecuentes con acordeón animado
10. `<Footer>`

---

### Tienda (`app/tienda/page.tsx`)

Server Component que obtiene los productos en el servidor y los pasa al componente interactivo:

```
1. getProducts() → Medusa o fallback hardcodeado
2. Ordenar por PRODUCT_ORDER
3. <TiendaExperience products={products} />
```

---

### Checkout (`app/checkout/page.tsx`)

Client Component con el flujo de pago completo:

```
Estado del carrito → Guard de auth (suscripciones requieren login)
       ↓
Sección 1: Datos de contacto (nombre, email, teléfono)
       ↓
Sección 2: Dirección de envío
  • Google Places Autocomplete en "Calle y número"
  • COPOMEX lookup por CP → colonias como <select>
  • Ciudad y estado auto-completados
  • Google Address Validation (silente, no bloquea)
       ↓
Sección 3: Datos de pago (Openpay)
  • Número de tarjeta con formateo automático
  • Nombre, vencimiento (MM/AA), CVV
       ↓
Sidebar: resumen del pedido con ítems, totales, $85 MXN de envío
       ↓
Submit:
  1. validate() → errores en campos obligatorios
  2. getDeviceSessionId() → fingerprint anti-fraude
  3. tokenizeCard() → tok_XXX vía Openpay SDK
  4. medusa.cart.ensure() → sincroniza ítems al carrito
  5. medusa.checkout.createPaymentSession()
  6. medusa.checkout.completeCart(cart_id, token)
  7. clearCart() → pantalla de éxito
```

**Manejo de errores de validación:**

- Los errores aparecen al hacer submit
- Se limpian individualmente en el `onChange` de cada campo (`clearErr(key)`)
- Los errores de ciudad/estado/CP se limpian automáticamente cuando COPOMEX resuelve con éxito

---

### Portal de suscripciones (`app/cuenta/suscripciones/page.tsx`)

Ruta protegida por Clerk. Usa el JWT del usuario para autenticar todas las llamadas a Medusa.

**Secciones:**
- Suscripciones activas: frecuencia, próximo envío, acciones (pausar, cancelar)
- Suscripciones pausadas: con botón de reanudar
- Métodos de pago: tarjetas guardadas, agregar nueva
- Historial: suscripciones canceladas

---

### Sign-in / Sign-up

Páginas custom que usan los componentes `<SignIn>` y `<SignUp>` de Clerk con layout split:

- **Panel izquierdo (navy):** Logo `logowht.webp`, tagline, lista de beneficios con Heroicons
- **Panel derecho (cream):** Componente de Clerk con tema `novapatchAppearance`

---

## Componentes

### `<Navbar>`

- Transparente sobre la hero (texto blanco), se vuelve `bg-[#FEF7ED]` con scroll
- Badge de cantidad en el carrito (coral)
- Auth: `<UserButton>` si hay sesión, `<SignInButton mode="modal">` si no
- Menú "Mis suscripciones" en el dropdown del `UserButton`
- Menú hamburguesa en mobile con `AnimatePresence`

### `<CartDrawer>`

- Panel deslizante desde la derecha con `AnimatePresence`
- Lista ítems con imagen, título, precio con descuento, controles +/−
- Modo sub muestra badge de frecuencia con el color del producto
- Subtotal, ahorro y total en la parte inferior
- Botón "Ir al checkout" → `/checkout`

### `<ProductGrid>` / `<TiendaExperience>`

- Cards de cada producto con imagen, nombre, descripción
- Selector de modo: Compra única / Suscripción
- Si suscripción: selector de frecuencia (30/60/90 días) con descuento visible
- Botón "Agregar al carrito" → `useCart().addToCart()`

---

## Integraciones externas

| Servicio | Flujo |
|---|---|
| **Clerk** | `ClerkProvider` en layout → middleware protege `/cuenta/*` → `useUser`, `useAuth`, `useClerk` en componentes → JWT para Medusa |
| **Medusa** | Frontend llama REST directo desde el browser (no API proxy) → autenticado con Clerk JWT para rutas protegidas |
| **Openpay** | Scripts cargados en layout → `lib/openpay.ts` inicializa SDK → `tokenizeCard()` envía datos de tarjeta directo a Openpay → devuelve `tok_XXX` |
| **Google Places** | Script cargado dinámicamente por `useGooglePlaces` → Autocomplete en campo de calle → `onPlace()` rellena el resto del formulario |
| **Google Address Validation** | POST desde browser → `/api/validate-address` (proxy) → Google API → resultado para advertir al usuario (no bloquea) |
| **COPOMEX** | Usuario escribe CP → `useCopomex` hace GET a `/api/copomex` (proxy) → API COPOMEX devuelve colonias → se muestran en `<select>` |

---

## Flujos de datos

### Agregar al carrito

```
Componente de producto
  └─► useCart().addToCart(item)
        └─► CartContext → addToCart() → lib/cart.ts → localStorage
              └─► dispatchEvent("cart:updated")
                    └─► CartContext suscripto → re-render de CartDrawer y Navbar badge
```

### Checkout completo

```
/checkout carga → CartContext.items
  ├─ ¿items tienen suscripción y no hay sesión? → <AuthGate> (Clerk SignIn)
  └─ Formulario habilitado:
       ├─ Dirección: Google Places + COPOMEX
       ├─ Validación: Google Address Validation (no bloqueante)
       └─ Pago:
            ├─ getDeviceSessionId() → fingerprint
            ├─ tokenizeCard(cardData) → tok_XXX (Openpay, PCI-DSS)
            ├─ medusa.cart.ensure(region_id) → cart_id
            ├─ medusa.cart.addOnceItem() / addSubscriptionItem() por cada ítem
            ├─ medusa.checkout.createPaymentSession(cart_id)
            └─ medusa.checkout.completeCart(cart_id, tok_XXX)
                 └─► clearCart() → <SuccessScreen>
```

### Portal de suscripciones

```
/cuenta/suscripciones (Clerk protegido)
  └─► useAuth().getToken() → JWT
        └─► medusa.subscriptions.list(jwt)
              └─► GET /store/me/subscriptions (Authorization: Bearer JWT)
                    └─► Medusa valida JWT con Clerk → devuelve suscripciones

Acciones del usuario → pause/resume/cancel/updateFrequency(sub_id, jwt)
  └─► POST /store/me/subscriptions/:id/[action]
        └─► Re-fetch → actualizar UI
```

---

## Seguridad

| Aspecto | Implementación |
|---|---|
| **Datos de tarjeta** | Nunca tocan servidores de Novapatch. Van directo de browser a Openpay (PCI-DSS). Solo el `tok_XXX` se envía a Medusa. |
| **Tokens de servicios externos** | `COPOMEX_TOKEN` y `GOOGLE_ADDRESS_VALIDATION_KEY` viven en el servidor (sin `NEXT_PUBLIC_`). El browser solo llama a `/api/copomex` y `/api/validate-address`. |
| **Auth de usuarios** | Clerk maneja sesiones, tokens y MFA. El middleware protege rutas de cuenta. |
| **JWT para Medusa** | `useAuth().getToken()` de Clerk genera un JWT short-lived que Medusa valida antes de responder a rutas protegidas. |
| **Anti-fraude Openpay** | `getDeviceSessionId()` genera un fingerprint del dispositivo que Openpay usa para detectar fraude. Se envía junto con el token en el checkout. |
| **Clerk Secret Key** | Solo en el servidor (`CLERK_SECRET_KEY` sin `NEXT_PUBLIC_`). El SDK del browser usa solo la publishable key. |

---

## Estado de la integración con Medusa

El backend de Medusa aún no está disponible en producción. El frontend tiene un sistema de fallback:

- **Catálogo:** Usa `PRODUCT_META` de `lib/product-meta.ts` si Medusa no responde
- **Carrito:** Estado local en localStorage; sincronización con Medusa en el momento del checkout
- **Suscripciones:** Muestra datos mock en la página de cuenta si el backend no responde
- **Pagos:** Openpay funciona en sandbox; en dev, si la tokenización falla se usa un token mock `"tok_dev_mock"`

Cuando el backend esté listo, solo hay que:
1. Actualizar `NEXT_PUBLIC_MEDUSA_BACKEND_URL` en `.env.local`
2. Setear el `NEXT_PUBLIC_MEDUSA_REGION_ID` correcto (ID de la región México)
3. Agregar `variantId` a los ítems del carrito cuando se carguen desde Medusa

---

*Generado para Novapatch Storefront — apps/storefront*
