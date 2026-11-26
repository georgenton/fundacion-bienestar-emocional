"use client";

import { dateLabel } from "../../../lib/operations";
import type { Requester } from "../common";
import { Loading, onForm, useAction, useResource } from "./shared";

export const purposes = { CARE: "Atención individual", INTERN_PARTICIPATION: "Participación supervisada de pasante" };
type Template = { id: string; purpose: keyof typeof purposes; version: number; body: string };
type Consent = { id: string; template: Template; medium: "PATIENT_PORTAL" | "STAFF_WITNESSED";
  acceptedAt: string; withdrawnAt: string | null };
type Evidence = { templates: Template[]; history: Consent[] };

export function Consents({ path, request, patient }: { path: string; request: Requester; patient: boolean }) {
  const endpoint = `${path}/consents`;
  const data = useResource<Evidence>(request, endpoint);
  const action = useAction(data.reload);
  if (!data.value) return <Loading error={data.error} />;
  const { templates, history } = data.value;
  return <div className="clinical-stack">
    <h3>Consentimientos de prueba</h3>
    {templates.map(template => {
      const latest = history.find(item => item.template.purpose === template.purpose);
      return <article className="record" key={template.id}>
        <h4>{purposes[template.purpose]} · Versión {template.version}</h4>
        <p>{template.body}</p>
        {latest?.withdrawnAt && <p role="status" className="message">Retirado. Revisión del proceso pendiente.</p>}
        {latest?.template.id === template.id && !latest.withdrawnAt ? <button type="button" className="secondary"
          disabled={action.busy} onClick={() => void action.run(() => request(`${endpoint}/${latest.id}/withdraw`, {}))}>
          {patient ? "Retirar aceptación" : "Registrar retirada"}
        </button> : <form onSubmit={onForm(form => void action.run(() => request(endpoint, {
          templateId: template.id, medium: patient ? "PATIENT_PORTAL" : "STAFF_WITNESSED", confirmed: form.has("confirm"),
        })))}>
          <label className="check"><input type="checkbox" name="confirm" required />{patient
            ? "Acepto este texto ficticio para el caso seleccionado."
            : "Confirmo que observé la aceptación de este texto ficticio."}</label>
          <button disabled={action.busy}>{patient ? "Aceptar texto de prueba" : "Registrar evidencia"}</button>
        </form>}
      </article>;
    })}
    {action.feedback}
    {history.length > 0 && <div><h4>Historial de evidencias</h4>{history.map(item => <details key={item.id}>
      <summary>{purposes[item.template.purpose]} · Versión {item.template.version} · {dateLabel(item.acceptedAt)}</summary>
      <p>{item.medium === "PATIENT_PORTAL" ? "Aceptación del paciente autenticado" : "Evidencia registrada por personal"}</p>
      <p>{item.template.body}</p>
      {item.withdrawnAt && <p>Retirada el {dateLabel(item.withdrawnAt)}</p>}
    </details>)}</div>}
  </div>;
}
