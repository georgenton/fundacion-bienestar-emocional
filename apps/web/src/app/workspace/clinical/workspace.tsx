"use client";

import { useState } from "react";
import type { CaseSummary } from "../../../lib/operations";
import type { Requester } from "../common";
import { Consents } from "./consents";
import { Coordination } from "./coordination";
import { Documents } from "./documents";
import { Records } from "./records";

export function ClinicalWorkspace({ cases, request, roles, coordinator }: {
  cases: CaseSummary[]; request: Requester; roles: string[]; coordinator: boolean;
}) {
  const [caseId, setCaseId] = useState("");
  const patient = roles.includes("PATIENT");
  const internOnly = roles.includes("INTERN") && !roles.some(role => role === "PROFESSIONAL" || role === "SUPERVISOR");
  const clinician = roles.some(role => ["PROFESSIONAL", "SUPERVISOR", "INTERN"].includes(role));
  const tabs = [
    ...(clinician ? [{ id: "records", title: "Atenciones y notas" }] : []),
    ...(patient || (clinician && !internOnly) ? [{ id: "consents", title: "Consentimientos" }, { id: "files", title: "Documentos" }] : []),
    ...(coordinator ? [{ id: "coordination", title: "Permisos por caso" }] : []),
  ];
  const [tab, setTab] = useState(tabs[0]?.id ?? "");
  const path = `clinical/cases/${caseId}`;
  return <section className="panel">
    <h2>{patient && !clinician ? "Consentimientos y documentos" : "Expediente sintético"}</h2>
    <label>Caso del expediente<select value={caseId} onChange={event => setCaseId(event.target.value)}>
      <option value="">Seleccione un caso</option>
      {cases.map(item => <option key={item.id} value={item.id}>{item.referenceCode}</option>)}
    </select></label>
    {caseId && <>
      <nav aria-label="Secciones del expediente" className="workspace-nav">
        {tabs.map(item => <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined}
          className={tab === item.id ? "" : "secondary"} onClick={() => setTab(item.id)}>{item.title}</button>)}
      </nav>
      <div key={`${caseId}-${tab}`}>
        {tab === "records" && <Records path={path} request={request} />}
        {tab === "coordination" && <Coordination path={path} request={request} />}
        {tab === "consents" && <Consents path={path} request={request} patient={patient && !clinician} />}
        {tab === "files" && <Documents path={path} request={request} mode={patient && !clinician ? "patient" : "staff"} />}
      </div>
    </>}
  </section>;
}
