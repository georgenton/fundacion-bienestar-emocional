import { Body, Controller, Get, Param, Post, Req, StreamableFile, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { SessionGuard } from "../auth/session.guard.js";
import { uuid } from "../operations/input.js";
import { ClinicalCoordinationService } from "./clinical-coordination.service.js";
import { ClinicalRecordsService } from "./clinical-records.service.js";
import { ConsentsService } from "./consents.service.js";
import { DocumentsService } from "./documents.service.js";
import { PracticesService } from "./practices.service.js";

@Controller("api/clinical")
@UseGuards(SessionGuard)
export class ClinicalController {
  constructor(private readonly records: ClinicalRecordsService, private readonly consents: ConsentsService,
    private readonly coordination: ClinicalCoordinationService, private readonly practices: PracticesService,
    private readonly files: DocumentsService) {}

  @Get("directory")
  directory(@Req() req: AuthenticatedRequest) {
    return this.coordination.directory(req.actor);
  }

  @Get("cases/:caseId/grants")
  grants(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string) {
    return this.coordination.grants(req.actor, uuid(caseId));
  }

  @Post("cases/:caseId/grants")
  grant(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string, @Body() body: unknown) {
    return this.coordination.grant(req.actor, uuid(caseId), body);
  }

  @Post("cases/:caseId/grants/:id/revoke")
  revoke(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string, @Param("id") id: string) {
    return this.coordination.revoke(req.actor, uuid(caseId), uuid(id));
  }

  @Post("consent-templates")
  template(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.consents.template(req.actor, body);
  }

  @Get("cases/:caseId/consents")
  consentsForCase(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string) {
    return this.consents.list(req.actor, uuid(caseId));
  }

  @Post("cases/:caseId/consents")
  accept(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string, @Body() body: unknown) {
    return this.consents.accept(req.actor, uuid(caseId), body);
  }

  @Post("cases/:caseId/consents/:id/withdraw")
  withdraw(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string, @Param("id") id: string) {
    return this.consents.withdraw(req.actor, uuid(caseId), uuid(id));
  }

  @Get("cases/:caseId")
  record(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string) {
    return this.records.list(req.actor, uuid(caseId));
  }

  @Post("cases/:caseId/encounters")
  open(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string, @Body() body: unknown) {
    return this.records.open(req.actor, uuid(caseId), body);
  }

  @Post("cases/:caseId/encounters/:id/complete")
  complete(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string, @Param("id") id: string) {
    return this.records.complete(req.actor, uuid(caseId), uuid(id));
  }

  @Post("cases/:caseId/encounters/:id/notes")
  note(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string, @Param("id") id: string, @Body() body: unknown) {
    return this.records.note(req.actor, uuid(caseId), uuid(id), body);
  }

  @Post("cases/:caseId/notes/:id")
  transition(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string, @Param("id") id: string, @Body() body: unknown) {
    return this.records.transition(req.actor, uuid(caseId), uuid(id), body);
  }

  @Post("cases/:caseId/notes/:id/addenda")
  addendum(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string, @Param("id") id: string, @Body() body: unknown) {
    return this.records.addendum(req.actor, uuid(caseId), uuid(id), body);
  }

  @Get("practices")
  listPractices(@Req() req: AuthenticatedRequest) {
    return this.practices.list(req.actor);
  }

  @Post("practices")
  registerPractice(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.practices.register(req.actor, body);
  }

  @Get("practices/:id")
  practice(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.practices.details(req.actor, uuid(id));
  }

  @Post("practices/:id")
  changePractice(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.practices.change(req.actor, uuid(id), body);
  }

  @Post("practices/:id/hours")
  submitHours(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.practices.submit(req.actor, uuid(id), body);
  }

  @Post("practices/:id/hours/:item")
  reviewHours(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Param("item") item: string, @Body() body: unknown) {
    return this.practices.review(req.actor, uuid(id), uuid(item), body);
  }

  @Get("practices/:id/export")
  academicExport(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.practices.export(req.actor, uuid(id));
  }

  @Get("practices/:id/files")
  practiceFiles(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.files.list(req.actor, { practiceId: uuid(id) });
  }

  @Post("practices/:id/files")
  practiceUpload(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.files.upload(req.actor, { practiceId: uuid(id) }, body);
  }

  @Get("cases/:caseId/files")
  caseFiles(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string) {
    return this.files.list(req.actor, { caseId: uuid(caseId) });
  }

  @Post("cases/:caseId/files")
  upload(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string, @Body() body: unknown) {
    return this.files.upload(req.actor, { caseId: uuid(caseId) }, body);
  }

  @Get("files/:id")
  async download(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const file = await this.files.download(req.actor, uuid(id));
    return new StreamableFile(file, { type: "application/octet-stream",
      disposition: 'attachment; filename="documento-sintetico.txt"', length: file.length });
  }

  @Post("cases/:caseId/files/:id/share")
  share(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string, @Param("id") id: string, @Body() body: unknown) {
    return this.files.share(req.actor, uuid(caseId), uuid(id), body);
  }

  @Get("cases/:caseId/requests")
  requests(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string) {
    return this.files.requests(req.actor, uuid(caseId));
  }

  @Post("cases/:caseId/requests")
  request(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string, @Body() body: unknown) {
    return this.files.request(req.actor, uuid(caseId), body);
  }

  @Post("cases/:caseId/requests/:id")
  progress(@Req() req: AuthenticatedRequest, @Param("caseId") caseId: string, @Param("id") id: string, @Body() body: unknown) {
    return this.files.advance(req.actor, uuid(caseId), uuid(id), body);
  }
}
