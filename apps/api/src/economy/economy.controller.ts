import { Body, Controller, Get, Param, Post, Req, StreamableFile, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { SessionGuard } from "../auth/session.guard.js";
import { uuid } from "../operations/input.js";
import { EconomyService } from "./economy.service.js";

@Controller("api/economy")
@UseGuards(SessionGuard)
export class EconomyController {
  constructor(private readonly finance: EconomyService) {}

  @Get()
  overview(@Req() req: AuthenticatedRequest) {
    return this.finance.overview(req.actor);
  }

  @Post("commands")
  command(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.finance.command(req.actor, body);
  }

  @Post("receipts/:receiptId/evidence")
  evidence(@Req() req: AuthenticatedRequest, @Param("receiptId") receiptId: string, @Body() body: unknown) {
    return this.finance.evidence(req.actor, uuid(receiptId), body);
  }

  @Get("evidence/:id")
  async download(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const bytes = await this.finance.download(req.actor, uuid(id));
    return new StreamableFile(bytes, { type: "application/octet-stream",
      disposition: 'attachment; filename="comprobante-sintetico.txt"', length: bytes.length });
  }
}
