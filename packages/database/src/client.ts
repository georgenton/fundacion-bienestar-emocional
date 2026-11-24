import { PrismaPg } from "@prisma/adapter-pg";
import { loadConfig } from "@fbe/config";
import { PrismaClient } from "./generated/client.js";

const globalDatabase = globalThis as typeof globalThis & {
  fbePrisma?: PrismaClient;
};

export function createPrismaClient(databaseUrl = loadConfig().databaseUrl): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}

export const prisma = globalDatabase.fbePrisma ?? createPrismaClient();

if (loadConfig().appEnv !== "production") {
  globalDatabase.fbePrisma = prisma;
}
