import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { SessionGuard } from "../auth/session.guard.js";
import { uuid } from "../operations/input.js";
import { PortalService } from "./portal.service.js";

@Controller("api/portal")
@UseGuards(SessionGuard)
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get("preferences")
  preference(@Req() req: AuthenticatedRequest) { return this.portal.preferences(req.actor); }

  @Post("preferences")
  setPreference(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.portal.preferences(req.actor, body); }

  @Get("inbox")
  inbox(@Req() req: AuthenticatedRequest) { return this.portal.inbox(req.actor); }

  @Get("video/:id")
  details(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.portal.access(req.actor, uuid(id));
  }

  @Post("video/:id")
  register(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.portal.register(req.actor, uuid(id), body);
  }

  @Post("video/:id/join")
  join(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.portal.access(req.actor, uuid(id), true);
  }

  @Post("video/:id/external-confirmation")
  confirm(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.portal.confirmExternal(req.actor, uuid(id), body);
  }
}
