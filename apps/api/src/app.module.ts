import { Module } from "@nestjs/common";
import { AccessPolicyService } from "./access/access-policy.service.js";
import { AccountsController } from "./accounts/accounts.controller.js";
import { AccountsService } from "./accounts/accounts.service.js";
import { MeController } from "./accounts/me.controller.js";
import { SessionGuard } from "./auth/session.guard.js";
import { CasesController } from "./cases/cases.controller.js";
import { HealthController } from "./health/health.controller.js";
import { InvitationsController } from "./invitations/invitations.controller.js";
import { InvitationsService } from "./invitations/invitations.service.js";

@Module({
  controllers: [HealthController, MeController, CasesController, AccountsController, InvitationsController],
  providers: [SessionGuard, AccessPolicyService, AccountsService, InvitationsService],
})
export class AppModule {}
