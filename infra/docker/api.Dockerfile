FROM node:26.13.1-bookworm-slim AS build
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json prisma.config.ts ./
COPY .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/access-policy/package.json packages/access-policy/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY apps/worker apps/worker
COPY packages packages
COPY database database
# Prisma loads its datasource while generating the client. This deliberately
# unreachable, non-secret URL keeps image builds independent from a live DB;
# the runtime URL is supplied by Compose.
RUN DATABASE_URL=postgresql://build-only:build-only@invalid:5432/build-only \
    pnpm packages:build && pnpm --filter @fbe/api build

# One-off job: includes Prisma config, schema and every versioned migration.
# The application image never migrates its database implicitly at startup.
FROM build AS migration
ENV NODE_ENV=production
USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM node:26.13.1-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
COPY --from=build /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /workspace/packages ./packages
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /workspace/apps/worker/dist ./apps/worker/dist
RUN install -d -o node -g node -m 0700 /workspace/.local /workspace/.local/private-attachments
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
