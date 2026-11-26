import { Body, Controller, Header, Post, Req, UseGuards } from "@nestjs/common";
import { loadConfig } from "@fbe/config";
import type { Request } from "express";
import { SessionGuard } from "../auth/session.guard.js";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { assertCookieMutationOrigin } from "../auth/mutation-origin.js";
import { InvitationsService } from "./invitations.service.js";

@Controller("api/invitations")
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @Header("Cache-Control", "no-store, private")
  @UseGuards(SessionGuard)
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.invitations.create(request.actor, body);
  }

  @Post("activate")
  @Header("Cache-Control", "no-store, private")
  activate(@Req() request: Request, @Body() body: unknown) {
    assertCookieMutationOrigin(request, loadConfig().webOrigin);
    return this.invitations.activate(body);
  }
}
