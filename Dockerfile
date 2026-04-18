FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
RUN npm run build \
    && ln -sf /app/node_modules /app/.medusa/server/node_modules

WORKDIR /app/.medusa/server

EXPOSE 9000
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
