"use client";

import { useState } from "react";
import { dateLabel, localDay, toInstant } from "../../../lib/operations";
import type { Requester } from "../common";
import type { ClinicalPerson } from "./coordination";
import { Documents } from "./documents";
import { Loading, onForm, saveDownload, useAction, useResource } from "./shared";

type PersonRelation = { person: { displayName: string } };
type Practice = { id: string; internId: string; supervisorId: string; institution: string; institutionalRef: string;
  startsAt: string; endsAt: string; state: "ACTIVE" | "SUSPENDED"; clinicalSimulation: boolean; version: number;
  intern: PersonRelation; supervisor: PersonRelation; _count: { notes: number; activities: number } };
type Activity = { id: string; day: string; kind: keyof typeof kinds; minutes: number; reviewReason: string | null; status: keyof typeof states };
type Detail = Practice & { current: boolean; canSubmit: boolean; canReview: boolean; supervisorAvailable: boolean;
  activities: Activity[]; changes: { id: string; createdAt: string; reason: string }[] };
const kinds = { TRAINING: "Formación", SUPERVISION: "Supervisión", PREPARATION: "Preparación" };
const states = { PENDING: "En revisión", RETURNED: "Devuelta", APPROVED: "Aprobada", SUPERSEDED: "Sustituida" };

export function Practices({ request, coordinator }: { request: Requester; coordinator: boolean }) {
  const list = useResource<Practice[]>(request, "clinical/practices");
  const [selected, setSelected] = useState("");
  const practice = list.value?.find(item => item.id === selected);
  return <section className="panel">
    <h2>Prácticas y horas</h2>
    {coordinator && <CreatePractice request={request} refresh={list.reload} />}
    <Loading error={list.error}>
      {list.value ? <label>Ficha de práctica<select value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">Seleccione</option>{list.value.map(item => <option key={item.id} value={item.id}>{item.institution} · {item.intern.person.displayName}</option>)}
      </select></label> : undefined}
    </Loading>
    {practice && <PracticeCard key={practice.id} item={practice} request={request} coordinator={coordinator} refresh={list.reload} />}
  </section>;
}

function DirectoryOptions({ role, people }: { role: string; people: ClinicalPerson[] }) {
  return <>{people.filter(person => person.roles.includes(role)).map(person =>
    <option key={person.id} value={person.id}>{person.name}</option>)}</>;
}

function CreatePractice({ request, refresh }: { request: Requester; refresh: () => Promise<void> }) {
  const directory = useResource<ClinicalPerson[]>(request, "clinical/directory");
  const action = useAction(refresh);
  return <details><summary>Registrar práctica sintética</summary><Loading error={directory.error}>
    {directory.value && <form onSubmit={onForm(form => void action.run(() => request("clinical/practices", {
      internId: form.get("intern"), supervisorId: form.get("supervisor"), institution: form.get("institution"),
      institutionalRef: form.get("reference"), startsAt: toInstant(String(form.get("start"))), endsAt: toInstant(String(form.get("end"))),
    })))}>
      <label>Pasante<select name="intern" required><option value="">Seleccione</option>
        <DirectoryOptions people={directory.value} role="INTERN" /></select></label>
      <label>Supervisor responsable<select name="supervisor" required><option value="">Seleccione</option>
        <DirectoryOptions people={directory.value} role="SUPERVISOR" /></select></label>
      <label>Institución ficticia<input name="institution" minLength={3} maxLength={150} required /></label>
      <label>Referencia institucional de prueba<input name="reference" minLength={3} maxLength={120} required /></label>
      <label>Inicio en Ecuador<input name="start" type="datetime-local" required /></label>
      <label>Fin en Ecuador<input name="end" type="datetime-local" required /></label>
      <button disabled={action.busy}>Crear ficha de práctica</button>
    </form>}
  </Loading>{action.feedback}</details>;
}

function PracticeCard({ item, request, coordinator, refresh }: {
  item: Practice; request: Requester; coordinator: boolean; refresh: () => Promise<void>;
}) {
  const path = `clinical/practices/${item.id}`;
  const data = useResource<Detail>(request, path);
  const action = useAction(async () => { await data.reload(); await refresh(); });
  const detail = data.value;
  if (!detail) return <Loading error={data.error} />;
  return <div className="clinical-stack">
    <h3>{item.institution}</h3>
    <p>Responsable {item.supervisor.person.displayName} · {item.institutionalRef}</p>
    <p>{dateLabel(item.startsAt)} a {dateLabel(item.endsAt)} · {detail.current ? "Vigente" : "Sin vigencia activa"}</p>
    <p>{detail.clinicalSimulation ? "Simulación clínica institucional habilitada" : "Participación clínica deshabilitada"}</p>
    {!detail.supervisorAvailable && <p role="alert">Supervisor no disponible. Coordinación debe reasignar la práctica.</p>}
    <p>{item._count.notes} notas por revisar en Expediente · {item._count.activities} actividades pendientes</p>
    {coordinator && <ChangePractice key={detail.version} detail={detail} path={path} request={request}
      refresh={async () => { await data.reload(); await refresh(); }} />}
    {detail.canSubmit && <form onSubmit={onForm(form => void action.run(() => request(`${path}/hours`, {
      kind: form.get("kind"), day: form.get("day"), minutes: Number(form.get("minutes")), previousId: form.get("previousId"),
    })))}>
      <label>Actividad<select name="kind">{Object.entries(kinds).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Fecha de actividad<input type="date" name="day" defaultValue={localDay()} required /></label>
      <label>Minutos<input type="number" name="minutes" min={1} max={480} required /></label>
      {detail.activities.some(activity => activity.status === "RETURNED") && <label>Corregir actividad devuelta
        <select name="previousId"><option value="">Actividad nueva</option>{detail.activities.filter(row => row.status === "RETURNED")
          .map(row => <option key={row.id} value={row.id}>{kinds[row.kind]} · {row.day.slice(0, 10)}</option>)}</select></label>}
      <button disabled={action.busy}>Enviar actividad a revisión</button>
    </form>}
    <h4>Actividades registradas</h4>
    {detail.activities.map(activity => <article className="record" key={activity.id}>
      <p>{activity.day.slice(0, 10)} · {kinds[activity.kind]} · {activity.minutes} min · {states[activity.status]}</p>
      {activity.reviewReason && <p>{activity.reviewReason}</p>}
      {detail.canReview && activity.status === "PENDING" && <>
        <button type="button" disabled={action.busy} onClick={() => void action.run(() =>
          request(`${path}/hours/${activity.id}`, { status: "APPROVED" }))}>Aprobar horas</button>
        <form onSubmit={onForm(form => void action.run(() =>
          request(`${path}/hours/${activity.id}`, { status: "RETURNED", reason: form.get("reason") })))}>
          <label>Motivo de devolución<input name="reason" required minLength={3} maxLength={500} /></label>
          <button className="secondary" disabled={action.busy}>Devolver actividad</button>
        </form></>}
    </article>)}
    <button type="button" className="secondary" disabled={action.busy} onClick={() => void action.run(async () => {
      const rows = await request(`${path}/export`);
      saveDownload(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }), "horas-sinteticas.json");
    })}>Descargar horas aprobadas</button>
    {detail.changes.length > 0 && <details><summary>Historial de coordinación</summary>
      {detail.changes.map(change => <p key={change.id}>{dateLabel(change.createdAt)} · {change.reason}</p>)}
    </details>}
    {action.feedback}
    <Documents path={path} request={request} mode="practice" />
  </div>;
}

function ChangePractice({ detail, path, request, refresh }: { detail: Detail; path: string; request: Requester; refresh: () => Promise<void> }) {
  const directory = useResource<ClinicalPerson[]>(request, "clinical/directory");
  const action = useAction(refresh);
  return <details><summary>Cambiar supervisor o estado</summary>
    <Loading error={directory.error}>{directory.value && <form onSubmit={onForm(form => void action.run(() => request(path, {
      version: detail.version, supervisorId: form.get("supervisor"), state: form.get("state"),
      clinicalSimulation: form.has("simulation"), reason: form.get("reason"),
    })))}>
      <label>Supervisor nuevo<select name="supervisor" defaultValue={detail.supervisorId} required>
        {!directory.value.some(person => person.id === detail.supervisorId) && <option value={detail.supervisorId}>Responsable anterior</option>}
        <DirectoryOptions people={directory.value} role="SUPERVISOR" /></select></label>
      <label>Estado<select name="state" defaultValue={detail.state}><option value="ACTIVE">Activa</option>
        <option value="SUSPENDED">Suspendida</option></select></label>
      <label className="check"><input type="checkbox" name="simulation" defaultChecked={detail.clinicalSimulation} />
        Habilitar participación clínica únicamente en la simulación</label>
      <label>Motivo del cambio<input name="reason" minLength={3} maxLength={500} required /></label>
      <button disabled={action.busy}>Guardar cambio de práctica</button>
    </form>}</Loading>{action.feedback}
  </details>;
}
