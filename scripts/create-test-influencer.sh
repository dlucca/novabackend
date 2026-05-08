#!/usr/bin/env bash
# scripts/create-test-influencer.sh
#
# Crea una postulación de influencer de prueba contra prod o staging.
# Útil para testear el flujo de "Enviar muestras" sin pasar por la web.
#
# Uso:
#   ./scripts/create-test-influencer.sh                              # defaults a prod
#   ./scripts/create-test-influencer.sh --env staging
#   ./scripts/create-test-influencer.sh --name "Maria Lopez" --email maria@test.com
#   ./scripts/create-test-influencer.sh --handle test_xyz
#   ./scripts/create-test-influencer.sh --parches energy,sleep,glow,zen
#
# Requiere:
#   - curl
#   - Variables de env (o pasar por flags):
#       NOVAPATCH_PROD_PK_KEY       publishable key de producción
#       NOVAPATCH_STAGING_PK_KEY    publishable key de staging
#
#   Si no las tenés en env, las hardcodeas abajo (sólo para uso personal).

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────
ENV="prod"
NAME="Test User"
HANDLE=""              # se autogenera si vacío
EMAIL=""               # se autogenera si vacío
PARCHES="energy,sleep" # comma-separated

# Hardcoded fallbacks — sobrescribibles por env vars del shell
PROD_API_URL="${NOVAPATCH_PROD_API_URL:-https://admin.novapatch.care}"
STAGING_API_URL="${NOVAPATCH_STAGING_API_URL:-https://novabackend-staging-b265.up.railway.app}"
PROD_PK_KEY="${NOVAPATCH_PROD_PK_KEY:-pk_a118d644729619ea0771d320a60c4032ca7aef7d7c85b10f18269ebf6858aeab}"
STAGING_PK_KEY="${NOVAPATCH_STAGING_PK_KEY:-pk_5800a9423eb1d451c4d5a0dba3890008274655ff56cada98c080e54afa54aa56}"

# ─── Parse args ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)       ENV="$2"; shift 2 ;;
    --name)      NAME="$2"; shift 2 ;;
    --email)     EMAIL="$2"; shift 2 ;;
    --handle)    HANDLE="$2"; shift 2 ;;
    --parches)   PARCHES="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Flag desconocido: $1" >&2; exit 1 ;;
  esac
done

# ─── Resolve env ─────────────────────────────────────────────────────────────
case "$ENV" in
  prod|production)
    API_URL="$PROD_API_URL"
    PK_KEY="$PROD_PK_KEY"
    ;;
  staging)
    API_URL="$STAGING_API_URL"
    PK_KEY="$STAGING_PK_KEY"
    ;;
  *) echo "ENV inválido: $ENV (usá prod o staging)" >&2; exit 1 ;;
esac

# ─── Auto-genera identificadores únicos si no los pasaste ────────────────────
TS=$(date +%s)
[[ -z "$EMAIL" ]] && EMAIL="dlucca+test${TS}@gmail.com"
[[ -z "$HANDLE" ]] && HANDLE="test_${TS}"

# ─── Convertir parches CSV → array JSON ──────────────────────────────────────
PARCHES_JSON=$(echo "$PARCHES" | awk -F',' '{
  printf "["
  for (i=1; i<=NF; i++) printf "%s\"%s\"", (i>1?",":""), $i
  printf "]"
}')

# ─── Body ────────────────────────────────────────────────────────────────────
read -r -d '' BODY <<JSON || true
{
  "nombre": "$NAME",
  "email": "$EMAIL",
  "pais": "mx",
  "instagram_handle": "$HANDLE",
  "rango_seguidores": "10k–50k",
  "nicho": ["Wellness"],
  "tipo_contenido": ["Reels"],
  "tiene_contenido_bienestar": "no",
  "parches": $PARCHES_JSON,
  "media_kit": "no",
  "direccion": {
    "street": "Av. Insurgentes Sur 1234",
    "interior": "201",
    "colonia": "Del Valle",
    "city": "Benito Juárez",
    "state": "CDMX",
    "zip": "03100",
    "instructions": ""
  }
}
JSON

# ─── Run ─────────────────────────────────────────────────────────────────────
echo "→ POST $API_URL/store/influencers ($ENV)"
echo "  name=$NAME"
echo "  email=$EMAIL"
echo "  handle=$HANDLE"
echo "  parches=$PARCHES"
echo

RESPONSE=$(curl -sS -X POST "$API_URL/store/influencers" \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: $PK_KEY" \
  -d "$BODY")

echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo

# ─── Tip ─────────────────────────────────────────────────────────────────────
ID=$(echo "$RESPONSE" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
if [[ -n "$ID" ]]; then
  case "$ENV" in
    prod|production) ADMIN_URL="https://admin.novapatch.care/app/influencers" ;;
    staging)         ADMIN_URL="$API_URL/app/influencers" ;;
  esac
  echo "✓ Postulación $ID creada"
  echo "  Abrila en: $ADMIN_URL"
fi
