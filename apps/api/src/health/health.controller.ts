import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { prisma } from "@fbe/database";

@Controller("health")
export class HealthController {
  @Get()
  async get() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "reachable", syntheticDataOnly: true };
    } catch {
      throw new ServiceUnavailableException({ code: "DATABASE_UNREACHABLE" });
    }
  }
}
