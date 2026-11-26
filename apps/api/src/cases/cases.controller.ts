import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from "@nestjs/common";
import { prisma } from "@fbe/database";
import { SessionGuard } from "../auth/session.guard.js";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { AccessPolicyService } from "../access/access-policy.service.js";
import { caseActions } from "../access/access.types.js";

@Controller("api/cases")
@UseGuards(SessionGuard)
export class CasesController {
  constructor(private readonly accessPolicy: AccessPolicyService) {}

  @Get()
  @Header("Cache-Control", "no-store, private")
  list(@Req() request: AuthenticatedRequest) {
    return this.accessPolicy.listCases(request.actor);
  }

  @Get(":id/overview")
  @Header("Cache-Control", "no-store, private")
  async overview(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    await this.requireAccess(request, caseActions.overviewRead, id);
    return prisma.careCase.findUniqueOrThrow({
      where: { id },
      select: { id: true, referenceCode: true, status: true, openedAt: true, modality: true,
        service: { select: { name: true } } },
    });
  }

  @Get(":id/clinical")
  @Header("Cache-Control", "no-store, private")
  async clinical(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    await this.requireAccess(request, caseActions.clinicalRead, id);
    return {
      caseId: id,
      synthetic: true,
      clinicalRecords: [],
      status: "NOT_IMPLEMENTED_UNTIL_FBE_010",
    };
  }

  @Get(":id/export")
  @Header("Cache-Control", "no-store, private")
  async export(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    await this.requireAccess(request, caseActions.export, id);
    return { caseId: id, synthetic: true, records: [], status: "EMPTY_BLOCK_1_EXPORT" };
  }

  private async requireAccess(
    request: AuthenticatedRequest,
    action: (typeof caseActions)[keyof typeof caseActions],
    id: string,
  ): Promise<void> {
    const decision = await this.accessPolicy.authorizeCase(request.actor, action, id);
    if (!decision.allowed) {
      throw new NotFoundException({ code: "CASE_NOT_AVAILABLE" });
    }
  }
}
