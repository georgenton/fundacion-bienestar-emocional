import { apiBaseUrl } from "./auth-client";

export class ApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

export async function api<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api/${path}`, {
    credentials: "include", cache: "no-store", ...(signal ? { signal } : {}),
    ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  if (!response.ok) throw new ApiError(value?.code ?? "REQUEST_FAILED", response.status);
  return value as T;
}

const errors: Record<string, string> = {
  CAPABILITY_REQUIRED: "Su perfil no permite esta operación.",
  AUTHENTICATION_REQUIRED: "La sesión expiró. Inicie sesión de nuevo.",
  ACCOUNT_INACTIVE: "La cuenta ya no tiene una sesión activa.",
  MFA_ENROLLMENT_REQUIRED: "Configure el segundo factor del personal antes de continuar.",
  SYNTHETIC_EMAIL_REQUIRED: "Use un correo sintético terminado en @example.test.",
  INPUT_INVALID: "Revise los campos del formulario.",
  PERSON_NOT_AVAILABLE: "La persona seleccionada ya no está disponible.",
  PATIENT_ROLE_REQUIRED: "Esta invitación solo permite vincular una cuenta de paciente.",
  ACCOUNT_ALREADY_LINKED: "La persona o el correo de acceso ya está vinculado a una cuenta.",
  SERVICE_NOT_AVAILABLE: "El servicio seleccionado ya no existe.",
  SERVICE_MODALITY_REQUIRED: "Habilite al menos una modalidad para activar el servicio.",
  SERVICE_MODALITY_DISABLED: "El servicio o la modalidad no está habilitado.",
  CASE_NOT_BOOKABLE: "Solo se puede reservar en un caso abierto con servicio y modalidad.",
  PROFESSIONAL_NOT_ELIGIBLE: "El profesional no está habilitado para ese servicio.",
  PROFESSIONAL_NOT_ASSIGNED: "Asigne al profesional al caso con vigencia que cubra toda la cita.",
  ASSIGNMENT_OVERLAP: "Ya hay una asignación de ese profesional que coincide con el período.",
  ASSIGNMENT_PERIOD_INVALID: "La vigencia final debe ser posterior al inicio y a la fecha actual.",
  HOURS_INVALID: "La hora de cierre debe ser posterior a la de apertura.",
  ABSENCE_PERIOD_INVALID: "La ausencia debe terminar después de su inicio.",
  TARIFF_VERSION_CONFLICT: "Ya existe una versión de tarifa con ese inicio de vigencia.",
  SERVICE_TARIFF_REQUIRED: "Configure una tarifa vigente para la fecha de la cita.",
  APPOINTMENT_START_INVALID: "Seleccione una hora futura dentro de los próximos doce meses.",
  APPOINTMENT_CONFLICT: "Ese intervalo se solapa con una cita o reserva, incluido su margen.",
  OUTSIDE_PROFESSIONAL_HOURS: "La cita y su margen deben caber en el horario del profesional.",
  PROFESSIONAL_ABSENT: "El profesional tiene una ausencia en ese intervalo.",
  HOLD_OWNER_REQUIRED: "La confirmación corresponde a quien hizo la reserva.",
  HOLD_EXPIRED: "La reserva temporal venció. Reserve nuevamente.",
  APPOINTMENT_NOT_HELD: "La cita ya no está en reserva temporal.",
  APPOINTMENT_STALE: "La cita cambió. Actualice la agenda antes de continuar.",
  APPOINTMENT_NOT_EDITABLE: "El estado de esta cita impide el cambio solicitado.",
  APPOINTMENT_NOT_STARTED: "La asistencia se registra una vez iniciada la cita.",
  APPOINTMENT_UNCHANGED: "Seleccione una hora o un profesional diferente.",
  REQUEST_ID_CONFLICT: "El identificador de la solicitud corresponde a otra operación.",
  INVITATION_DELIVERY_NOT_CONFIGURED: "El buzón sintético de entrega no está habilitado.",
  RECORD_NOT_AVAILABLE: "Este registro no está disponible para su sesión.",
  RECORD_VERSION_CHANGED: "El registro cambió. Vuelva a abrirlo y compruebe la última versión.",
  CONSENT_CONFIRMATION_REQUIRED: "Confirme el texto de prueba para registrar la evidencia.",
  CONSENT_TEMPLATE_CHANGED: "Hay una versión nueva. Vuelva a abrir el consentimiento y léala.",
  CONSENT_HISTORY_ENTRY: "Solo se puede retirar la última evidencia registrada para esta finalidad.",
  CARE_CONSENT_REVIEW_REQUIRED: "Revise la evidencia vigente de atención antes de abrir una atención.",
  ENCOUNTER_CONFIRMED_APPOINTMENT_REQUIRED: "Seleccione una cita confirmada de un caso abierto con servicio y modalidad.",
  ENCOUNTER_REVIEW_PENDING: "Valide todas las notas antes de concluir la atención.",
  ENCOUNTER_NOT_OPEN: "La atención ya está concluida.",
  NOTE_IMMUTABLE: "La nota validada se conserva. Añada una adenda para corregirla.",
  NOTE_STATE_INVALID: "La nota no admite esta acción en su estado.",
  CLINICAL_ASSIGNMENT_EXISTS: "Ya hay un alcance clínico vigente para esta función.",
  PRACTICE_SIMULATION_REQUIRED: "Seleccione una práctica vigente con simulación habilitada.",
  PRACTICE_PERIOD_INVALID: "Revise el período y los integrantes de la práctica.",
  ACTIVITY_PERIOD_INVALID: "La actividad debe corresponder al período de práctica y a una fecha transcurrida.",
  ACTIVITY_CORRECTION_INVALID: "La actividad original ya fue corregida o cambió de estado.",
  ACTIVITY_REVIEW_INVALID: "La actividad ya cambió de estado.",
  ATTACHMENT_SIZE_INVALID: "Seleccione un archivo de hasta 16 KiB.",
  ATTACHMENT_TYPE_INVALID: "Seleccione un archivo .txt.",
  ATTACHMENT_CONTENT_INVALID: "El archivo debe contener texto plano UTF-8 sin marcado ni caracteres de control.",
  ATTACHMENT_VERSION_CHANGED: "El documento ya tiene una versión posterior.",
  SYNTHETIC_ATTACHMENT_BUDGET: "Se alcanzó el límite de almacenamiento de archivos sintéticos.",
  PRIVATE_STORAGE_UNAVAILABLE: "El almacenamiento privado no está disponible. Intente nuevamente.",
  DOCUMENT_REVIEW_REQUIRED: "Revise el documento antes de compartirlo.",
  INFORMATION_STATE_INVALID: "Complete el paso previo de identidad y revisión.",
  ACTIVATION_INVALID: "El enlace no es válido, ya se utilizó o perdió vigencia.",
};

export function explain(error: unknown): string {
  if (error instanceof ApiError) return errors[error.code] ?? "El servidor no pudo completar la operación.";
  return "No fue posible conectar. Intente nuevamente.";
}

export const timezone = "America/Guayaquil";
const calendar = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
const dateTime = new Intl.DateTimeFormat("es-EC", { dateStyle: "short", timeStyle: "short", timeZone: timezone });
const shortTime = new Intl.DateTimeFormat("es-EC", { timeStyle: "short", timeZone: timezone });

export function localDay(value: Date | string = new Date()) {
  return calendar.format(new Date(value));
}

export function moveDay(day: string, days: number) {
  const utc = new Date(`${day}T00:00:00Z`);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function toInstant(local: string) {
  // The synthetic agenda uses mainland Ecuador civil time (UTC−05:00).
  return new Date(`${local}-05:00`).toISOString();
}

export const dateLabel = (value: string) => dateTime.format(new Date(value));
export const timeLabel = (value: string) => shortTime.format(new Date(value));
export const tariffLabel = (amount: number, currency = "USD") =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency }).format(amount / 100);
export const modalities = { IN_PERSON: "Presencial", ONLINE: "En línea" } as const;
export type Modality = keyof typeof modalities;

export type CaseSummary = {
  id: string; referenceCode: string; status: string; serviceId: string | null; modality: Modality | null;
};
export type Tariff = { id: string; startsAt: string; amountMinor: number; currency: string };
export type Service = {
  id: string; name: string; enabled: boolean; modalities: Modality[]; durationMinutes: number;
  marginMinutes: number; tariffs: Tariff[];
  professionals: { professionalId: string; enabled: boolean }[];
};
export type Absence = { id: string; startsAt: string; endsAt: string; professionalId: string };
export type Professional = {
  id: string; person: { displayName: string }; absences: Absence[];
  workingHours: { weekday: number; opensMinute: number; closesMinute: number }[];
};
export type Catalog = { services: Service[]; professionals: Professional[]; timezone: string };
