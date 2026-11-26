"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, dateLabel, explain, modalities, type CaseSummary, type Catalog } from "../../lib/operations";
import { Agenda } from "./agenda";
import { CatalogPane } from "./catalog";
import type { Requester } from "./common";
import { People } from "./people";
import { ClinicalWorkspace } from "./clinical/workspace";
import { Practices } from "./clinical/practices";

type Pane = "people" | "cases" | "agenda" | "catalog" | "clinical" | "practices";
type SessionScope = { capabilities: string[]; roleCodes: string[] };
const emptyCatalog: Catalog = { services: [], professionals: [], timezone: "America/Guayaquil" };

export function Workspace({ onSessionError }: { onSessionError: (code: string) => void }) {
  const [scope, setScope] = useState<SessionScope>();
  const [pane, setPane] = useState<Pane>("cases");
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [initialCase, setInitialCase] = useState("");
  const [message, setMessage] = useState("");
  const request: Requester = useCallback(async <T,>(path: string, body?: object, signal?: AbortSignal) => {
    try {
      return await api<T>(path, body, signal);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 ||
          ["MFA_VERIFICATION_REQUIRED", "MFA_ENROLLMENT_REQUIRED"].includes(error.code))) {
        onSessionError(error.code);
      }
      throw error;
    }
  }, [onSessionError]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const actor = await request<SessionScope>("me", undefined, controller.signal);
        if (controller.signal.aborted) return;
        setScope(actor);
        setPane(actor.capabilities.includes("person:manage") ? "people" : "cases");
        const [visible, configuration] = await Promise.all([
          request<CaseSummary[]>("cases", undefined, controller.signal),
          actor.capabilities.includes("agenda:configure")
            ? request<Catalog>("agenda/catalog", undefined, controller.signal)
            : Promise.resolve(emptyCatalog),
        ]);
        if (!controller.signal.aborted) {
          setCases(visible);
          setCatalog(configuration);
        }
      } catch (error) {
        if (!controller.signal.aborted) setMessage(explain(error));
      }
    }
    void load();
    return () => controller.abort();
  }, [request]);

  const reloadCatalog = async () => setCatalog(await request<Catalog>("agenda/catalog"));
  const canManageAgenda = scope?.capabilities.includes("agenda:manage") ?? false;
  const canSeeAgenda = canManageAgenda || scope?.roleCodes.some(role => role === "PATIENT" || role === "PROFESSIONAL");
  const canSeePeople = scope?.capabilities.includes("person:manage");
  const canConfigure = scope?.capabilities.includes("agenda:configure");
  const coordinator = scope?.capabilities.includes("case:clinical:coordinate") ?? false;
  const clinical = coordinator || scope?.roleCodes.some(role => ["PATIENT", "PROFESSIONAL", "SUPERVISOR", "INTERN"].includes(role));
  const practices = coordinator || scope?.roleCodes.some(role => ["SUPERVISOR", "INTERN"].includes(role));

  async function selectPane(next: Pane, bookingCase = "") {
    setMessage("");
    setInitialCase(bookingCase);
    setPane(next);
    if (next === "cases" || next === "clinical" || (next === "agenda" && canManageAgenda)) {
      try {
        setCases(await request<CaseSummary[]>("cases"));
      } catch (error) {
        setCases([]);
        setMessage(explain(error));
      }
    }
  }

  if (!scope) return <section className="panel"><p role="status">{message || "Comprobando permisos…"}</p></section>;
  const links: [Pane, string][] = [
    ...(canSeePeople ? [["people", "Personas"]] as [Pane, string][] : []),
    ["cases", "Casos"],
    ...(canSeeAgenda ? [["agenda", "Agenda"]] as [Pane, string][] : []),
    ...(clinical ? [["clinical", scope.roleCodes.includes("PATIENT") ? "Consentimientos y documentos" : "Expediente"]] as [Pane, string][] : []),
    ...(practices ? [["practices", "Prácticas y horas"]] as [Pane, string][] : []),
    ...(canConfigure ? [["catalog", "Configuración"]] as [Pane, string][] : []),
  ];

  return (
    <div className="workspace">
      <nav aria-label="Módulos" className="workspace-nav">
        {links.map(([id, label]) => <button key={id} type="button" aria-current={pane === id ? "page" : undefined}
          className={pane === id ? "" : "secondary"} onClick={() => void selectPane(id)}>{label}</button>)}
      </nav>
      {message ? <p className="message" role="alert">{message}</p> : null}
      {pane === "people" && canSeePeople ? <People request={request} catalog={catalog} book={id => void selectPane("agenda", id)} /> : null}
      {pane === "cases" ? <CaseList request={request} cases={cases} /> : null}
      {pane === "agenda" && canSeeAgenda ? <Agenda key={initialCase} request={request} catalog={catalog}
        canManage={canManageAgenda} initialCase={initialCase} cases={cases} /> : null}
      {pane === "clinical" && clinical ? <ClinicalWorkspace cases={cases} roles={scope.roleCodes} coordinator={coordinator} request={request} /> : null}
      {pane === "practices" && practices ? <Practices request={request} coordinator={coordinator} /> : null}
      {pane === "catalog" && canConfigure ? <CatalogPane request={request} catalog={catalog} reload={reloadCatalog} /> : null}
    </div>
  );
}

type CaseOverview = CaseSummary & { openedAt: string; service: { name: string } | null };

function CaseList({ request, cases }: { request: Requester; cases: CaseSummary[] }) {
  const [selected, setSelected] = useState("");
  const [overview, setOverview] = useState<CaseOverview>();
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    request<CaseOverview>(`cases/${selected}/overview`, undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setOverview(result); })
      .catch(error => { if (!controller.signal.aborted) setFailure(explain(error)); });
    return () => controller.abort();
  }, [request, selected]);

  return (
    <section className="panel">
      <h2>Casos autorizados</h2>
      {cases.length ? <ul className="person-list">
        {cases.map(careCase => <li key={careCase.id}>
          <button className="person-row" type="button" aria-pressed={careCase.id === selected}
            onClick={() => { setFailure(""); setSelected(careCase.id); }}>
            <strong>{careCase.referenceCode}</strong><small>{careCase.status === "OPEN" ? "Abierto" : careCase.status === "PAUSED" ? "Pausado" : "Cerrado"}</small>
          </button>
        </li>)}
      </ul> : <p className="muted">No hay casos disponibles para esta sesión.</p>}
      {failure ? <p className="message" role="alert">{failure}</p> : null}
      {overview?.id === selected ? <article className="record">
        <h3>Resumen del caso</h3>
        <p>{overview.referenceCode}</p>
        <p>{overview.service?.name ?? "Servicio pendiente"}{overview.modality ? ` · ${modalities[overview.modality]}` : ""}</p>
        <p>Abierto el {dateLabel(overview.openedAt)}</p>
      </article> : null}
    </section>
  );
}
