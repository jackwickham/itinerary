FROM node:24-slim AS builder

# better-sqlite3 compiles from source when there's no prebuilt binary for this Node
# version, which needs a toolchain. Only this stage has one.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim

WORKDIR /app

# Same base image as the builder, so the compiled native module runs as-is.
# package.json is needed at runtime for "type": "module".
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
