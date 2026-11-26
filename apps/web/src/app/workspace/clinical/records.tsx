"use client";

import { dateLabel } from "../../../lib/operations";
import type { Requester } from "../common";
import { Loading, onForm, useAction, useResource } from "./shared";

const noteStates = { DRAFT: "Borrador", RETURNED: "Devuelta", IN_REVIEW: "En revisión", VALIDATED: "Validada" };

export const functions = {
  TREATING_PROFESSIONAL: "Profesional tratante",
  SUPERVISOR: "Supervisor",
  INTERN: "Pasante",
};
export type ClinicalFunction = keyof typeof functions;
type Note = { id: string; authorId: string; authorFunction: ClinicalFunction; status: keyof typeof noteStates;
  version: number; narrative: string; templateVersion: string; recordedAt: string; validatedAt: string | null;
  addenda: { id: string; createdAt: string; reason: string; narrative: string }[];
  reviews: { id: string; createdAt: string; transition: keyof typeof noteStates; remarks: string | null }[] };
type Encounter = { id: string; status: "OPEN" | "COMPLETED"; occurredAt: string; notes: Note[];
  documentation: { total: number; validated: number; pending: number };
  pendingNotes: { id: string; status: keyof typeof noteStates; authorFunction: ClinicalFunction; responsibleName: string }[] };
type ClinicalRecord = { encounters: Encounter[]; appointments: { id: string; startsAt: string }[];
  function: ClinicalFunction; actorId: string };

export function Records({ path, request }: { path: string; request: Requester }) {
  const data = useResource<ClinicalRecord>(request, path);
  const action = useAction(data.reload);
  const stage = data.value;
  if (!stage) return <Loading error={data.error} />;
  return <div className="clinical-stack">
    <h3>Atenciones y notas de prueba</h3>
    {stage.appointments.length ? <form onSubmit={onForm(form => void action.run(() =>
      request(`${path}/encounters`, { appointmentId: form.get("appointment") })))}>
      <label>Cita confirmada<select name="appointment" required>
        <option value="">Seleccione una cita</option>
        {stage.appointments.map(appointment => <option key={appointment.id} value={appointment.id}>{dateLabel(appointment.startsAt)}</option>)}
      </select></label>
      <button disabled={action.busy}>Abrir atención</button>
    </form> : null}
    {action.feedback}
    {stage.encounters.length === 0 && <p className="muted">Aún no hay atenciones disponibles.</p>}
    {stage.encounters.map(encounter => <article className="record" key={encounter.id}>
      <h4>Atención del {dateLabel(encounter.occurredAt)}</h4>
      <p>{encounter.status === "OPEN" ? "Abierta" : "Concluida"}</p>
      <p>Documentación a su cargo: {encounter.documentation.total} notas,
        {" "}{encounter.documentation.validated} validadas y {encounter.documentation.pending} pendientes.</p>
      {encounter.pendingNotes.length > 0 && <details>
        <summary>Pendientes de documentación</summary>
        <ul>{encounter.pendingNotes.map(note => <li key={note.id}>
          {noteStates[note.status]} · {functions[note.authorFunction]} · Responsable: {note.responsibleName}
        </li>)}</ul>
      </details>}
      {encounter.status === "COMPLETED" && <p className="muted">
        La atención concluyó. Los nuevos aportes conservan su fecha de registro y siguen su propio proceso de revisión.
      </p>}
      <form onSubmit={onForm(form => void action.run(() =>
        request(`${path}/encounters/${encounter.id}/notes`, { narrative: form.get("narrative") })))}>
        <label>Nota sintética<textarea name="narrative" required maxLength={8000} rows={3} /></label>
        <button disabled={action.busy}>{encounter.status === "OPEN" ? "Crear borrador" : "Registrar borrador posterior"}</button>
      </form>
      {encounter.notes.map(note => <NoteCard key={`${note.id}-${note.version}`} note={note} stage={stage}
        path={path} request={request} refresh={data.reload} />)}
      {encounter.status === "OPEN" && stage.function === "TREATING_PROFESSIONAL" &&
        <button type="button" className="secondary" disabled={action.busy} onClick={() =>
          void action.run(() => request(`${path}/encounters/${encounter.id}/complete`, {}))}>Concluir atención</button>}
    </article>)}
  </div>;
}

function NoteCard({ note, stage, path, request, refresh }: {
  note: Note; stage: ClinicalRecord; path: string; request: Requester; refresh: () => Promise<void>;
}) {
  const action = useAction(refresh);
  const endpoint = `${path}/notes/${note.id}`;
  const own = note.authorId === stage.actorId;
  const mutable = own && (note.status === "DRAFT" || note.status === "RETURNED");
  const review = !own && note.status === "IN_REVIEW" && stage.function === "SUPERVISOR";
  const canValidate = review || (own && stage.function !== "INTERN" && note.status !== "VALIDATED");
  const change = (operation: string, extra = {}) => void action.run(() => request(endpoint, { operation, version: note.version, ...extra }));
  return <section className="record">
    <h5>{noteStates[note.status]} · {functions[note.authorFunction]}</h5>
    <small>{dateLabel(note.recordedAt)} · {note.templateVersion} · Revisión {note.version}</small>
    {note.validatedAt && <p>Validación interna el {dateLabel(note.validatedAt)}</p>}
    {mutable ? <form onSubmit={onForm(form => change("EDIT", { narrative: form.get("narrative") }))}>
      <label>Contenido del borrador<textarea name="narrative" defaultValue={note.narrative} maxLength={8000} required rows={3} /></label>
      <button disabled={action.busy}>Guardar borrador</button>
    </form> : <p className="clinical-text">{note.narrative}</p>}
    {note.reviews.map(entry => <p key={entry.id}>{noteStates[entry.transition]} · {dateLabel(entry.createdAt)}{entry.remarks && ` · ${entry.remarks}`}</p>)}
    <div className="clinical-actions">
      {mutable && <button type="button" className="secondary" disabled={action.busy} onClick={() => change("SUBMIT")}>Enviar a revisión</button>}
      {canValidate && <button type="button" disabled={action.busy} onClick={() => change("VALIDATE")}>Validar nota</button>}
    </div>
    {review && <form onSubmit={onForm(form => change("RETURN", { remarks: form.get("remarks") }))}>
      <label>Observaciones para la devolución<textarea name="remarks" minLength={3} maxLength={1200} required rows={2} /></label>
      <button className="secondary" disabled={action.busy}>Devolver nota</button>
    </form>}
    {note.addenda.map(item => <div className="record" key={item.id}>
      <h6>Adenda · {dateLabel(item.createdAt)}</h6><p>{item.reason}</p><p className="clinical-text">{item.narrative}</p>
    </div>)}
    {note.status === "VALIDATED" && stage.function !== "INTERN" && <details><summary>Añadir adenda</summary>
      <form onSubmit={onForm(form => void action.run(() => request(`${endpoint}/addenda`, {
        reason: form.get("reason"), narrative: form.get("narrative"),
      })))}>
        <label>Motivo de la adenda<input name="reason" minLength={3} maxLength={400} required /></label>
        <label>Texto añadido<textarea name="narrative" maxLength={8000} required rows={2} /></label>
        <button disabled={action.busy}>Guardar adenda</button>
      </form>
    </details>}
    {action.feedback}
  </section>;
}
