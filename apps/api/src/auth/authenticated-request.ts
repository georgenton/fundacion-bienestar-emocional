import type { Request } from "express";
import type { ActorContext } from "@fbe/access-policy";

export type AuthenticatedActor = ActorContext;

export type AuthenticatedRequest = Request & { actor: AuthenticatedActor };
