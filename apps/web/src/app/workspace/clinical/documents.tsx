"use client";

import { useState } from "react";
import { ApiError, dateLabel } from "../../../lib/operations";
import { purposes } from "./consents";
import type { Requester } from "../common";
import { downloadPrivate, Loading, onForm, useAction, useResource } from "./shared";

type Document = { id: string; kind: "CASE_DOCUMENT" | "PRACTICE_DOCUMENT" | "CONSENT_EVIDENCE"; title: string;
  version: number; bytes: number; previousId: string | null; consentId: string | null; share: { sharedAt: string } | null };
type Request = { id: string; scope: string; handlerId: string | null; attachmentId: string | null;
  status: keyof typeof states };
const states = { REQUESTED: "Recibida", VERIFIED: "Identidad comprobada", REVIEWED: "Revisada", DELIVERED: "Entregada" };

export function Documents({ path, request, mode }: { path: string; request: Requester; mode: "staff" | "patient" | "practice" }) {
  const endpoint = `${path}/files`;
  const data = useResource<Document[]>(request, endpoint);
  const action = useAction(data.reload);
  const [shareCandidate, setShareCandidate] = useState("");
  if (!data.value) return <Loading error={data.error} />;
  const files = data.value;
  const canUpload = mode !== "patient";
  return <div className="clinical-stack">
    <h3>{mode === "patient" ? "Documentos compartidos" : "Archivos privados"}</h3>
    {files.length === 0 && <p className="muted">No hay documentos disponibles.</p>}
    {files.map(file => <article key={file.id} className="record">
      <h4>{file.title} · v{file.version}</h4>
      <p>{file.bytes} bytes{file.share && ` · Compartido el ${dateLabel(file.share.sharedAt)}`}</p>
      <button type="button" className="secondary" disabled={action.busy}
        onClick={() => void action.run(() => downloadPrivate(file.id))}>Descargar {file.title}</button>
      {mode === "staff" && file.kind === "CASE_DOCUMENT" && !file.share && (shareCandidate === file.id
        ? <form onSubmit={onForm(form => void action.run(() => request(`${endpoint}/${file.id}/share`, { reviewed: form.has("reviewed") })))}>
          <label className="check"><input type="checkbox" name="reviewed" required />Revisé esta versión y los datos de terceros.</label>
          <button disabled={action.busy}>Confirmar publicación al paciente</button>
        </form>
        : <button type="button" className="secondary" onClick={() => setShareCandidate(file.id)}>Compartir esta versión</button>)}
    </article>)}
    {canUpload && <details><summary>Subir archivo sintético</summary>
      <form onSubmit={onForm(form => void action.run(async () => {
        const file = form.get("file");
        if (!(file instanceof File) || file.size < 1 || file.size > 16384) throw new ApiError("ATTACHMENT_SIZE_INVALID", 400);
        const prev = files.find(item => item.id === form.get("previousId"));
        const payload = new Uint8Array(await file.arrayBuffer());
        await request(endpoint, { name: file.name, mediaType: file.type || "text/plain",
          data: btoa(String.fromCharCode(...payload)), title: form.get("title"),
          previousId: prev?.id, consentId: prev ? prev.consentId : form.get("consentId") || undefined });
      }))}>
        <label>Título<input name="title" minLength={3} maxLength={140} required /></label>
        <label>Archivo UTF-8 .txt de hasta 16 KiB<input type="file" name="file" required accept=".txt,text/plain" /></label>
        {files.length > 0 && <label>Nueva versión de<select name="previousId">
          <option value="">Documento nuevo</option>
          {files.filter(file => !files.some(item => item.previousId === file.id))
            .map(file => <option value={file.id} key={file.id}>{file.title} · v{file.version}</option>)}
        </select></label>}
        {mode === "staff" && <ConsentEvidenceOptions path={path} request={request} />}
        <button disabled={action.busy}>Guardar archivo privado</button>
      </form>
    </details>}
    {action.feedback}
    {mode !== "practice" && <InformationRequests path={path} request={request} patient={mode === "patient"}
      files={files.filter(file => file.kind === "CASE_DOCUMENT")} refreshFiles={data.reload} />}
  </div>;
}

function ConsentEvidenceOptions({ path, request }: { path: string; request: Requester }) {
  const data = useResource<{ history: { id: string; acceptedAt: string;
    template: { purpose: keyof typeof purposes; version: number } }[] }>(request, `${path}/consents`);
  return <label>Vincular a evidencia de consentimiento (opcional)<select name="consentId">
    <option value="">Documento del caso</option>
    {data.value?.history.map(item => <option value={item.id} key={item.id}>
      {purposes[item.template.purpose]} · v{item.template.version} · {dateLabel(item.acceptedAt)}
    </option>)}
  </select></label>;
}

function InformationRequests({ path, request, patient, files, refreshFiles }: {
  path: string; request: Requester; patient: boolean; files: Document[]; refreshFiles: () => Promise<void>;
}) {
  const endpoint = `${path}/requests`;
  const data = useResource<Request[]>(request, endpoint);
  const action = useAction(async () => { await data.reload(); await refreshFiles(); });
  if (!data.value) return <Loading error={data.error} />;
  return <section className="record">
    <h4>Solicitudes de información</h4>
    {patient && <form onSubmit={onForm(form => void action.run(() => request(endpoint, { scope: form.get("scope") })))}>
      <label>Información solicitada<input name="scope" minLength={4} maxLength={300} required /></label>
      <button disabled={action.busy}>Enviar solicitud</button>
    </form>}
    {data.value.map(item => <div className="record" key={item.id}>
      <p>{item.scope} · {states[item.status]}</p>
      {!patient && item.status === "REQUESTED" && <RequestAction label="Confirmo la identidad del solicitante" button="Verificar identidad"
        busy={action.busy} run={() => void action.run(() => request(`${endpoint}/${item.id}`, { operation: "VERIFY", identityChecked: true }))} />}
      {!patient && item.status === "VERIFIED" && <RequestAction label="Revisé el alcance y la presencia de datos de terceros"
        button="Registrar revisión humana" busy={action.busy}
        run={() => void action.run(() => request(`${endpoint}/${item.id}`, { operation: "REVIEW", thirdPartyReviewed: true }))} />}
      {!patient && item.status === "REVIEWED" && <form onSubmit={onForm(form => void action.run(() =>
        request(`${endpoint}/${item.id}`, { operation: "DELIVER", attachmentId: form.get("attachment") })))}>
        <label>Versión seleccionada para esta solicitud<select name="attachment" required>
          <option value="">Seleccione</option>{files.map(file => <option value={file.id} key={file.id}>{file.title} · v{file.version}</option>)}
        </select></label>
        <button disabled={action.busy || files.length === 0}>Entregar documento</button>
      </form>}
      {item.attachmentId && <button type="button" className="secondary" disabled={action.busy}
        onClick={() => void action.run(() => downloadPrivate(item.attachmentId!))}>Descargar documento entregado</button>}
    </div>)}
    {action.feedback}
  </section>;
}

function RequestAction({ label, button, busy, run }: { label: string; button: string; busy: boolean; run: () => void }) {
  return <form onSubmit={onForm(run)}>
    <label className="check"><input type="checkbox" required />{label}</label>
    <button disabled={busy}>{button}</button>
  </form>;
}
