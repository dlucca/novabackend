FROM node:20-alpine
WORKDIR /app

# Cached layer — npm ci only reruns when package*.json changes
COPY package*.json ./
RUN npm ci --omit=dev

# Build at image-build time (not at container start)
COPY . .
RUN npm run build \
    && ln -sf /app/node_modules /app/.medusa/server/node_modules

WORKDIR /app/.medusa/server

EXPOSE 9000
# Migrations still run at container start so each deploy picks up new migrations
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
