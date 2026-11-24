import { Controller, Get, Header, Req, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";

@Controller("api/me")
@UseGuards(SessionGuard)
export class MeController {
  @Get()
  @Header("Cache-Control", "no-store, private")
  get(@Req() request: AuthenticatedRequest) {
    return request.actor;
  }
}
