FROM node:22-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src ./src
COPY public ./public
RUN pnpm build

FROM node:22-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS runtime
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY --chown=node:node server/src ./server/src
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /data && chown node:node /data

ENV NODE_ENV=production \
    DATA_DIR=/data \
    WEB_DIR=/app/dist \
    TZ=America/Lima
USER 1000:1000
EXPOSE 8787
CMD ["./node_modules/.bin/tsx", "--env-file-if-exists=.env", "server/src/index.ts"]
