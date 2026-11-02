FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production DATA_DIR=/data WEB_DIR=/app/dist TZ=America/Lima
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY server ./server
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 8787
CMD ["pnpm", "start"]
