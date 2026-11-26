"use client";

import { dateLabel, toInstant } from "../../../lib/operations";
import type { Requester } from "../common";
import { purposes } from "./consents";
import { functions, type ClinicalFunction } from "./records";
import { Loading, onForm, useAction, useResource } from "./shared";
import { useState } from "react";

export type ClinicalPerson = { id: string; name: string; roles: string[] };
type Grant = { id: string; function: ClinicalFunction; startsAt: string; endsAt: string | null; revokedAt: string | null;
  account: { person: { displayName: string } } };

export function Coordination({ path, request }: { path: string; request: Requester }) {
  const grants = useResource<Grant[]>(request, `${path}/grants`);
  const people = useResource<ClinicalPerson[]>(request, "clinical/directory");
  const practices = useResource<{ id: string; internId: string; institution: string; clinicalSimulation: boolean }[]>(request, "clinical/practices");
  const [functionName, setFunction] = useState<ClinicalFunction>("TREATING_PROFESSIONAL");
  const [chosen, setChosen] = useState("");
  const action = useAction(grants.reload);
  const role = { TREATING_PROFESSIONAL: "PROFESSIONAL", SUPERVISOR: "SUPERVISOR", INTERN: "INTERN" }[functionName];
  return <div className="clinical-stack">
    <h3>Coordinación clínica del caso</h3>
    <Loading error={grants.error || people.error || practices.error}>
      {grants.value && people.value && practices.value ? <>
        <form onSubmit={onForm(data => void action.run(() => request(`${path}/grants`, {
          accountId: data.get("accountId"), function: functionName, practiceId: data.get("practiceId"),
          endsAt: data.get("end") ? toInstant(String(data.get("end"))) : null,
        })))}>
          <label>Función<select value={functionName} onChange={event => { setFunction(event.target.value as ClinicalFunction); setChosen(""); }}>
            {Object.entries(functions).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>
          <label>Integrante<select name="accountId" required value={chosen} onChange={event => setChosen(event.target.value)}>
            <option value="">Seleccione</option>
            {people.value.filter(person => person.roles.includes(role)).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select></label>
          {functionName === "INTERN" && <label>Práctica de simulación<select name="practiceId" required>
            <option value="">Seleccione</option>
            {practices.value.filter(practice => practice.internId === chosen && practice.clinicalSimulation)
              .map(practice => <option key={practice.id} value={practice.id}>{practice.institution}</option>)}
          </select></label>}
          <label>Vigencia final en Ecuador (opcional)<input type="datetime-local" name="end" /></label>
          <button disabled={action.busy}>Asignar alcance clínico</button>
        </form>
        {grants.value.map(grant => <div key={grant.id} className="record">
          <p>{grant.account.person.displayName} · {functions[grant.function]}</p>
          <p>{dateLabel(grant.startsAt)}{grant.endsAt ? ` a ${dateLabel(grant.endsAt)}` : ""}</p>
          {grant.revokedAt ? <p>Revocada</p> : <button type="button" className="secondary" disabled={action.busy}
            onClick={() => void action.run(() => request(`${path}/grants/${grant.id}/revoke`, {}))}>Revocar permiso</button>}
        </div>)}
      </> : undefined}
    </Loading>
    <details><summary>Crear versión de texto ficticio</summary><form onSubmit={onForm(data => void action.run(() =>
      request("clinical/consent-templates", { purpose: data.get("purpose"), body: data.get("body") })))}>
      <label>Finalidad<select name="purpose">
        {Object.entries(purposes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Texto de la nueva versión<textarea name="body" minLength={12} maxLength={2400} required rows={3} /></label>
      <button disabled={action.busy}>Publicar versión ficticia</button>
    </form></details>
    {action.feedback}
  </div>;
}
