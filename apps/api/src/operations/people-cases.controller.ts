import { Body, Controller, Get, Header, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { SessionGuard } from "../auth/session.guard.js";
import { uuid } from "./input.js";
import { PeopleCasesService } from "./people-cases.service.js";

@Controller("api")
@UseGuards(SessionGuard)
export class PeopleCasesController {
  constructor(private readonly people: PeopleCasesService) {}

  @Get("people")
  @Header("Cache-Control", "no-store, private")
  list(@Req() request: AuthenticatedRequest, @Query("q") query: unknown) {
    return this.people.listPeople(request.actor, query);
  }

  @Get("people/:id")
  @Header("Cache-Control", "no-store, private")
  detail(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.people.person(request.actor, uuid(id));
  }

  @Post("people")
  @Header("Cache-Control", "no-store, private")
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.people.createPerson(request.actor, body);
  }

  @Post("cases")
  @Header("Cache-Control", "no-store, private")
  open(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.people.openCase(request.actor, body);
  }

  @Post("cases/:id/assignments")
  @Header("Cache-Control", "no-store, private")
  assign(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.people.assignProfessional(request.actor, uuid(id), body);
  }
}
