FROM node:22-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/dist ./dist
COPY scripts/docker-static-server.mjs ./scripts/docker-static-server.mjs

EXPOSE 8080

CMD ["node", "scripts/docker-static-server.mjs"]
