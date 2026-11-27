"use client";

import { useEffect, useRef, useState } from "react";
import { dateLabel, explain, localDay, modalities, moveDay, tariffLabel, timeLabel, toInstant, timezone,
  type CaseSummary, type Catalog, type Modality, type Professional } from "../../lib/operations";
import { field, ProfessionalOptions, SubmitForm, type Requester } from "./common";

import { VideoAccess } from "./portal";

type Appointment = {
  id: string; caseId: string; startsAt: string; endsAt: string; occupiedUntil: string;
  professionalId: string; serviceName: string; modality: Modality;
  currency: string; amountMinor: number; marginMinutes: number; holdExpiresAt: string | null;
  status: "HELD" | "CONFIRMED" | "CANCELLED" | "RESCHEDULED";
  attendance: "UNRECORDED" | "ATTENDED" | "NO_SHOW";
  cancellationParty: "PATIENT" | "PROFESSIONAL" | "ADMINISTRATIVE" | null;
  previousId: string | null; version: number;
  careCase: { referenceCode: string }; professional: { person: { displayName: string } };
};

const states = { HELD: "Reserva temporal", CONFIRMED: "Confirmada", CANCELLED: "Cancelada", RESCHEDULED: "Reprogramada" };
const attributions = { PATIENT: "Paciente", PROFESSIONAL: "Profesional", ADMINISTRATIVE: "Recepción" };
const days = new Intl.DateTimeFormat("es-EC", { timeZone: "UTC", dateStyle: "full" });

export function Agenda({
  request, catalog, canManage, initialCase, cases,
}: { request: Requester; catalog: Catalog; canManage: boolean; initialCase: string; cases: CaseSummary[] }) {
  const [day, setDay] = useState(() => localDay());
  const [range, setRange] = useState(1);
  const [filter, setFilter] = useState("");
  const [caseId, setCaseId] = useState(initialCase);
  const [rows, setRows] = useState<Appointment[]>([]);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const requestKeys = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      start: toInstant(`${day}T00:00`), end: toInstant(`${moveDay(day, range)}T00:00`),
      ...(filter ? { professionalId: filter } : {}),
    });
    setError("");
    request<{ appointments: Appointment[] }>(`agenda/appointments?${query}`, undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setRows(result.appointments); })
      .catch(error => { if (!controller.signal.aborted) { setRows([]); setError(explain(error)); } });
    return () => controller.abort();
  }, [day, range, filter, revision, request]);

  const professionals = catalog.professionals;
  const bookableCases = cases.filter(item => item.status === "OPEN" && item.serviceId &&
    catalog.services.some(service => service.id === item.serviceId && service.enabled && item.modality && service.modalities.includes(item.modality)));
  function eligible(id: string) {
    const serviceId = cases.find(careCase => careCase.id === id)?.serviceId;
    const service = catalog.services.find(item => item.id === serviceId);
    return professionals.filter(item => service?.professionals.some(link => link.enabled && link.professionalId === item.id));
  }

  async function mutate(route: string, input: object): Promise<Appointment> {
    const operation = JSON.stringify([route, input]);
    const key = requestKeys.current.get(operation) ?? crypto.randomUUID();
    requestKeys.current.set(operation, key);
    try {
      const result = await request<Appointment>(`agenda/appointments/${route}`, { ...input, requestId: key });
      requestKeys.current.delete(operation);
      setRevision(value => value + 1);
      if (!route.endsWith("/cancel") && !route.endsWith("/attendance")) setDay(localDay(result.startsAt));
      setMessage(`${states[result.status]} · ${dateLabel(result.startsAt)}`);
      return result;
    } catch (error) {
      setMessage("");
      throw error;
    }
  }

  return (
    <section className="panel agenda">
      <div className="section-heading"><div><h2>Agenda</h2><small>{timezone}</small></div>
        <button type="button" className="secondary" onClick={() => setRevision(value => value + 1)}>Actualizar</button>
      </div>
      <div className="agenda-toolbar">
        <label>Fecha de la agenda<input type="date" value={day} onChange={event => { if (event.target.value) setDay(event.target.value); }} /></label>
        <label>Vista<select value={range} onChange={event => setRange(Number(event.target.value))}><option value={1}>Diaria</option><option value={7}>Semanal</option></select></label>
        {canManage ? <label>Filtrar por profesional<select value={filter} onChange={event => setFilter(event.target.value)}>
          <ProfessionalOptions professionals={professionals} placeholder="Todos los profesionales" />
        </select></label> : null}
        <div className="actions">
          <button type="button" className="secondary" onClick={() => setDay(moveDay(day, -range))}>Anterior</button>
          <button type="button" className="secondary" onClick={() => setDay(moveDay(day, range))}>Siguiente</button>
        </div>
      </div>
      {canManage ? <details className="action-details" open={Boolean(initialCase)}>
        <summary>Reservar cita</summary>
        <SubmitForm label="Crear reserva temporal" submit={async data => {
          const held = await mutate("hold", {
            caseId, professionalId: field(data, "professionalId"), startsAt: toInstant(field(data, "start")),
          });
          setFilter("");
          return held.holdExpiresAt ? `Confirme antes de ${timeLabel(held.holdExpiresAt)}.` : "Reserva guardada.";
        }}>
          <label>Caso<select name="caseId" value={caseId} onChange={event => setCaseId(event.target.value)} required>
            <option value="">Seleccione un caso abierto</option>
            {bookableCases.map(careCase => <option key={careCase.id} value={careCase.id}>{careCase.referenceCode}</option>)}
          </select></label>
          <label>Profesional para la reserva<select key={caseId} name="professionalId" required><ProfessionalOptions professionals={eligible(caseId)} /></select></label>
          <label>Inicio de la cita<input type="datetime-local" name="start" key={day} defaultValue={`${day}T09:00`} required /></label>
        </SubmitForm>
      </details> : null}
      {message ? <p className="status" role="status">{message}</p> : null}
      {error ? <p className="message" role="alert">{error}</p> : null}
      {!rows.length && !error ? <p className="muted">No hay citas visibles en este período.</p> : null}
      {Array.from({ length: range }, (_, i) => moveDay(day, i)).map(date => {
        const items = rows.filter(row => localDay(row.startsAt) === date ||
          (date === day && localDay(row.startsAt) < day));
        return items.length ? <div key={date} className="agenda-day">
          <h3>{days.format(new Date(`${date}T00:00:00Z`))}</h3>
          {items.map(item => <AppointmentCard key={item.id} item={item} canManage={canManage}
            professionals={eligible(item.caseId)} mutate={mutate} request={request} />)}
        </div> : null;
      })}
    </section>
  );
}

function AppointmentCard({ item, canManage, professionals, mutate, request }: {
  item: Appointment; canManage: boolean; professionals: Professional[];
  mutate: (route: string, input: object) => Promise<Appointment>; request: Requester;
}) {
  const [video, setVideo] = useState(false);
  const [obligation, setObligation] = useState(false);
  const financeKey = useRef<string>(undefined);
  const edit = canManage && item.attendance === "UNRECORDED";
  return (
    <article className="record appointment" data-appointment-status={item.status}>
      <div className="row-content">
        <div><strong>{timeLabel(item.startsAt)}–{timeLabel(item.endsAt)} · {item.serviceName}</strong>
          <p>{item.professional.person.displayName} · {modalities[item.modality]}</p></div>
        <span className={item.status === "HELD" ? "badge badge-waiting" : "badge"}>{states[item.status]}</span>
      </div>
      <p className="reference">{item.careCase.referenceCode}</p>
      <p className="muted">{tariffLabel(item.amountMinor, item.currency)} · {item.marginMinutes} min de margen</p>
      {item.holdExpiresAt && item.status === "HELD" ? <p>Vence {dateLabel(item.holdExpiresAt)}</p> : null}
      {item.previousId ? <p>Reprogramada desde una cita anterior</p> : null}
      {item.cancellationParty ? <p>Cancelación atribuida a {attributions[item.cancellationParty].toLowerCase()}.</p> : null}
      {item.attendance !== "UNRECORDED" ? <p>{item.attendance === "ATTENDED" ? "Asistencia registrada" : "Ausencia del paciente registrada"}</p> : null}
      {canManage && item.status === "CONFIRMED" && <SubmitForm label="Registrar obligación" submit={async () => {
        financeKey.current ??= crypto.randomUUID();
        await request("economy/commands", { action: "OBLIGATION", appointmentId: item.id, requestId: financeKey.current });
        setObligation(true);
        return "Obligación disponible en Economía.";
      }}><p>{obligation ? "Obligación registrada." : "Usa el precio de la cita."}</p></SubmitForm>}
      {!canManage && item.modality === "ONLINE" && <>
        <button type="button" className="secondary" onClick={() => setVideo(value => !value)}>Videoconsulta</button>
        {video && <VideoAccess key={item.version} request={request} id={item.id} />}
      </>}
      {edit && (item.status === "HELD" || item.status === "CONFIRMED") ? <details className="action-details">
        <summary>Acciones de cita</summary>
        {item.status === "HELD" ? <SubmitForm label="Confirmar cita" submit={async () => {
          await mutate(`${item.id}/confirm`, { version: item.version });
        }}><p>La confirmación revisa disponibilidad y vigencia.</p></SubmitForm> : <>
          <SubmitForm label="Reprogramar cita" submit={async data => {
            await mutate(`${item.id}/reschedule`, { version: item.version, professionalId: field(data, "professionalId"),
              startsAt: toInstant(field(data, "newStart")), reason: field(data, "reason") });
          }}>
            <label>Nuevo inicio<input type="datetime-local" name="newStart" required /></label>
            <label>Profesional para reprogramar<select name="professionalId" defaultValue={item.professionalId} required>
              <ProfessionalOptions professionals={professionals} />
            </select></label>
            <label>Motivo de reprogramación<input name="reason" minLength={3} maxLength={160} required /></label>
          </SubmitForm>
          {new Date(item.startsAt) <= new Date() ? <SubmitForm label="Registrar asistencia" submit={async data => {
            await mutate(`${item.id}/attendance`, { version: item.version, attendance: field(data, "attendance") });
          }}>
            <label>Resultado<select name="attendance"><option value="ATTENDED">Asistió</option><option value="NO_SHOW">Ausencia del paciente</option></select></label>
          </SubmitForm> : null}
        </>}
        <SubmitForm label="Cancelar cita" submit={async data => {
          await mutate(`${item.id}/cancel`, { version: item.version, party: field(data, "party"), reason: field(data, "reason") });
        }}>
          <label>Quién cancela<select name="party">
            <option value="PATIENT">Paciente</option><option value="PROFESSIONAL">Profesional</option><option value="ADMINISTRATIVE">Recepción</option>
          </select></label>
          <label>Motivo de cancelación<input name="reason" minLength={3} maxLength={160} required /></label>
        </SubmitForm>
      </details> : null}
    </article>
  );
}
