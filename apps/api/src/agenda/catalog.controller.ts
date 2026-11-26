import { Body, Controller, Get, Header, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { SessionGuard } from "../auth/session.guard.js";
import { uuid } from "../operations/input.js";
import { CatalogService } from "./catalog.service.js";

@Controller("api/agenda/catalog")
@UseGuards(SessionGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @Header("Cache-Control", "no-store, private")
  list(@Req() request: AuthenticatedRequest) {
    return this.catalog.catalog(request.actor);
  }

  @Post("services")
  @Header("Cache-Control", "no-store, private")
  service(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.catalog.saveService(request.actor, body);
  }

  @Post("eligibility")
  @Header("Cache-Control", "no-store, private")
  eligibility(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.catalog.eligibility(request.actor, body);
  }

  @Post("hours")
  @Header("Cache-Control", "no-store, private")
  hours(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.catalog.hours(request.actor, body);
  }

  @Post("tariffs")
  @Header("Cache-Control", "no-store, private")
  tariff(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.catalog.tariff(request.actor, body);
  }

  @Post("absences")
  @Header("Cache-Control", "no-store, private")
  addAbsence(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.catalog.absence(request.actor, body);
  }

  @Get("absences/:id/conflicts")
  @Header("Cache-Control", "no-store, private")
  conflicts(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.catalog.absenceConflicts(request.actor, uuid(id));
  }

  @Post("absences/:id/remove")
  @Header("Cache-Control", "no-store, private")
  removeAbsence(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.catalog.removeAbsence(request.actor, uuid(id));
  }
}
