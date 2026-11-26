import { BadRequestException } from "@nestjs/common";

export type Input = Record<string, unknown>;

export function object(value: unknown): Input {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Input;
}

export function invalid(code = "INPUT_INVALID"): never {
  throw new BadRequestException({ code });
}

export function text(value: unknown, min: number, max: number): string {
  if (typeof value !== "string") invalid();
  const result = value.trim();
  if (result.length < min || result.length > max) invalid();
  return result;
}

export function uuid(value: unknown): string {
  const id = text(value, 36, 36).toLowerCase();
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) invalid();
  return id;
}

export function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) invalid();
  return value as T;
}

export function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) invalid();
  return value;
}

export function flag(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}

export function instant(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) invalid();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalid();
  return date;
}

export function syntheticEmail(value: unknown): string {
  const email = text(value, 3, 254).toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@example\.test$/.test(email)) invalid("SYNTHETIC_EMAIL_REQUIRED");
  return email;
}
