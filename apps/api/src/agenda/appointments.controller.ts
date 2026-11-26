import { Body, Controller, Get, Header, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { SessionGuard } from "../auth/session.guard.js";
import { uuid } from "../operations/input.js";
import { AppointmentsService } from "./appointments.service.js";

@Controller("api/agenda/appointments")
@UseGuards(SessionGuard)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @Header("Cache-Control", "no-store, private")
  list(
    @Req() request: AuthenticatedRequest, @Query("start") start: unknown,
    @Query("end") end: unknown, @Query("professionalId") professional: unknown,
  ) {
    return this.appointments.list(request.actor, start, end, professional);
  }

  @Post("hold")
  @Header("Cache-Control", "no-store, private")
  hold(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.appointments.hold(request.actor, body);
  }

  @Post(":id/confirm")
  @Header("Cache-Control", "no-store, private")
  confirm(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.appointments.confirm(request.actor, uuid(id), body);
  }

  @Post(":id/reschedule")
  @Header("Cache-Control", "no-store, private")
  reschedule(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.appointments.reschedule(request.actor, uuid(id), body);
  }

  @Post(":id/cancel")
  @Header("Cache-Control", "no-store, private")
  cancel(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.appointments.cancel(request.actor, uuid(id), body);
  }

  @Post(":id/attendance")
  @Header("Cache-Control", "no-store, private")
  attendance(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.appointments.attendance(request.actor, uuid(id), body);
  }
}
