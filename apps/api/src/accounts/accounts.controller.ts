import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { AccountsService } from "./accounts.service.js";

@Controller("api/accounts")
@UseGuards(SessionGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post(":id/disable")
  disable(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() _body: Record<string, never>,
  ) {
    return this.accounts.disable(request.actor, id);
  }
}
