FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/.medusa/server /app

RUN npm ci --omit=dev

EXPOSE 9000
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
