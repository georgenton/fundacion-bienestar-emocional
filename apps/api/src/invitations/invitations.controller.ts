import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { InvitationsService } from "./invitations.service.js";

@Controller("api/invitations")
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @UseGuards(SessionGuard)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: { email?: unknown; displayName?: unknown; roleCode?: unknown },
  ) {
    return this.invitations.create(request.actor, body);
  }

  @Post("activate")
  activate(@Body() body: { token?: unknown; password?: unknown }) {
    return this.invitations.activate(body);
  }
}
