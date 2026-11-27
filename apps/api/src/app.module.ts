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

import { PeopleCasesController } from "./operations/people-cases.controller.js";
import { PeopleCasesService } from "./operations/people-cases.service.js";
import { CatalogController } from "./agenda/catalog.controller.js";
import { CatalogService } from "./agenda/catalog.service.js";

import { AppointmentsController } from "./agenda/appointments.controller.js";
import { AppointmentsService } from "./agenda/appointments.service.js";

import { ClinicalController } from "./clinical/clinical.controller.js";
import { ClinicalCoordinationService } from "./clinical/clinical-coordination.service.js";
import { ClinicalRecordsService } from "./clinical/clinical-records.service.js";
import { ConsentsService } from "./clinical/consents.service.js";
import { DocumentsService } from "./clinical/documents.service.js";
import { PracticesService } from "./clinical/practices.service.js";

import { EconomyController } from "./economy/economy.controller.js";
import { EconomyService } from "./economy/economy.service.js";
import { PortalController } from "./portal/portal.controller.js";
import { PortalService } from "./portal/portal.service.js";

@Module({
  controllers: [HealthController, MeController, CasesController, AccountsController, InvitationsController,
    PeopleCasesController, CatalogController, AppointmentsController, ClinicalController, EconomyController, PortalController],
  providers: [SessionGuard, AccessPolicyService, AccountsService, InvitationsService, PeopleCasesService, CatalogService, AppointmentsService,
    ClinicalCoordinationService, ClinicalRecordsService, ConsentsService, DocumentsService, PracticesService, EconomyService, PortalService],
})
export class AppModule {}
