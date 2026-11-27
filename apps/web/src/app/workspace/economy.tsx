"use client";

import { useRef, type ReactNode } from "react";
import { apiBaseUrl } from "../../lib/auth-client";
import { ApiError, dateLabel, tariffLabel } from "../../lib/operations";
import type { Requester } from "./common";
import { Loading, onForm, saveDownload, useAction, useResource } from "./clinical/shared";

type Obligation = {
  id: string; referenceCode: string; serviceName: string; startsAt: string;
  amountMinor: number; solidarityMinor: number; appliedMinor: number; dueMinor: number; currency: string;
};
type Receipt = {
  id: string; kind: "PAYMENT" | "DONATION"; amountMinor: number; currency: string; reference: string; verifiedAt: string | null;
  attachments: { id: string; title: string }[];
  applications: { id: string; obligationId: string; amountMinor: number }[];
};
type Stage = "PREPARED" | "APPROVED" | "SIMULATED" | "REJECTED";
type Settlement = {
  id: string; professionalId: string; stage: Stage; basisPoints: number; ruleVersion: string;
  currency: string; netMinor: number; lines: { grossMinor: number; netMinor: number; refundId: string | null }[];
};
type Economy = {
  obligations: Obligation[]; receipts: Receipt[]; settlements: Settlement[];
  awards: { id: string; obligationId: string; kind: string; amountMinor: number; approvedAt: string | null }[];
  refunds: { id: string; receiptId: string; amountMinor: number; stage: Stage }[];
  people: { id: string; displayName: string }[];
  professionals: { id: string; person: { displayName: string } }[];
};
const stages: Record<Stage, string> = { PREPARED: "Preparado", APPROVED: "Aprobado", SIMULATED: "Ejecución simulada", REJECTED: "Rechazado" };

async function downloadEvidence(id: string) {
  const response = await fetch(`${apiBaseUrl}/api/economy/evidence/${id}`, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new ApiError((await response.json()).code, response.status);
  saveDownload(await response.blob(), "comprobante-sintetico.txt");
}

const money = (cents: number) => tariffLabel(cents, "USD");
const get = (row: FormData, name: string) => String(row.get(name) ?? "");
const amounts = (row: FormData) => ({ amountMinor: Number(row.get("amountMinor")), currency: "USD" });
const moneyInput = <label>Importe en centavos USD<input name="amountMinor" type="number" min="1" max="100000000" step="1" required /></label>;
const why = <label>Motivo administrativo de prueba<input name="reason" minLength={3} maxLength={160} required /></label>;
const referenceInput = <label>Referencia ficticia<input name="reference" placeholder="SYN-PRUEBA" pattern="SYN-[A-Z0-9-]+" required maxLength={48} /></label>;

export function EconomyPane({ request, capabilities, patient }: { request: Requester; capabilities: string[]; patient: boolean }) {
  const data = useResource<Economy>(request, "economy");
  const action = useAction(data.reload);
  const retries = useRef(new Map<string, string>());
  const staff = capabilities.includes("finance:register");
  const verify = capabilities.includes("finance:verify");
  const approve = capabilities.includes("finance:approve");
  const execute = capabilities.includes("finance:execute");

  function perform(name: string, fields: object) {
    const body = { action: name, ...fields };
    const identity = JSON.stringify(body);
    const requestId = retries.current.get(identity) ?? crypto.randomUUID();
    retries.current.set(identity, requestId);
    return action.run(async () => {
      await request("economy/commands", { ...body, requestId });
      retries.current.delete(identity);
    });
  }

  const items = data.value;
  if (!items) return <section className="panel"><h2>Economía sintética</h2><Loading error={data.error} /></section>;
  const options = items.obligations.map(entry => <option key={entry.id} value={entry.id}>{entry.referenceCode} · {dateLabel(entry.startsAt)}</option>);
  const payers = items.people.map(entry => <option key={entry.id} value={entry.id}>{entry.displayName}</option>);
  const form = (caption: string, submit: (row: FormData) => void, inputs: ReactNode) =>
    <form onSubmit={onForm(submit)}>{inputs}<button disabled={action.busy}>{caption}</button></form>;
  return <section className="panel clinical-stack">
    <h2>Economía sintética</h2>
    {action.feedback}
    {(staff || patient) && <>
      <h3>Obligaciones</h3>
      {!items.obligations.length && <p>No hay obligaciones visibles.</p>}
      {items.obligations.map(row => <article className="record" key={row.id}>
        <h4>{row.referenceCode} · {dateLabel(row.startsAt)}</h4>
        <p>{row.serviceName}</p>
        <p>Precio acordado {money(row.amountMinor)} · Solidaridad {money(row.solidarityMinor)} · Aplicado {money(row.appliedMinor)}</p>
        <strong>Saldo {money(row.dueMinor)}</strong>
      </article>)}
      {(staff || patient) && items.obligations.length > 0 && <details>
        <summary>Declarar pago sintético</summary>
        {form("Registrar declaración", row => void perform("DECLARE", {
          kind: "PAYMENT", obligationId: get(row, "obligationId"), reference: get(row, "reference"), ...amounts(row),
          ...(staff ? { payerId: get(row, "payerId") } : {}),
        }), <><label>Obligación<select name="obligationId" required>{options}</select></label>
          {staff && <label>Persona pagadora<select name="payerId" required>{payers}</select></label>}
          {referenceInput}{moneyInput}</>)}
      </details>}
      {staff && <details><summary>Registrar donación separada</summary>
        {form("Registrar donación", row => void perform("DECLARE", {
          kind: "DONATION", payerId: get(row, "payerId"), reference: get(row, "reference"), ...amounts(row),
        }), <><label>Persona donante<select name="payerId" required>{payers}</select></label>{referenceInput}{moneyInput}</>)}
      </details>}
      <h3>Declaraciones y comprobantes</h3>
      {items.receipts.map(row => <article className="record" key={row.id}>
        <h4>{row.reference} · {row.kind === "DONATION" ? "Donación" : "Pago"}</h4>
        <p>{money(row.amountMinor)} · {row.verifiedAt ? "Verificado manualmente" : "Declarado"}</p>
        {row.applications.map(entry => <p key={entry.id}>Aplicación {money(entry.amountMinor)} · {items.obligations.find(x => x.id === entry.obligationId)?.referenceCode ?? "Obligación"}</p>)}
        {row.attachments.map(file => <button key={file.id} type="button" className="secondary" onClick={() =>
          void action.run(() => downloadEvidence(file.id))}>Descargar {file.title}</button>)}
        {!row.verifiedAt && <details><summary>Subir comprobante de prueba</summary>
          {form("Guardar comprobante", values => void action.run(async () => {
            const file = values.get("file");
            if (!(file instanceof File) || file.size < 1 || file.size > 16384) throw new ApiError("ATTACHMENT_SIZE_INVALID", 400);
            const content = btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));
            const title = "Comprobante sintético";
            const identity = JSON.stringify([row.id, title, content]);
            const requestId = retries.current.get(identity) ?? crypto.randomUUID();
            retries.current.set(identity, requestId);
            await request(`economy/receipts/${row.id}/evidence`, {
              requestId, title, name: file.name, mediaType: file.type || "text/plain", data: content,
            });
            retries.current.delete(identity);
          }), <label>Archivo .txt UTF-8 de hasta 16 KiB<input name="file" type="file" required accept=".txt,text/plain" /></label>)}
        </details>}
        {verify && !row.verifiedAt && form("Verificar referencia", () => void perform("VERIFY", { receiptId: row.id, confirmed: true }),
          <label className="check"><input type="checkbox" required />Revisé la referencia y la evidencia disponible en la simulación.</label>)}
        {row.verifiedAt && <button type="button" className="secondary" onClick={() =>
          saveDownload(new Blob([`Constancia sintética de verificación (sin validez tributaria)\n${row.reference}\n${row.amountMinor} centavos USD\n${dateLabel(row.verifiedAt!)}\n`],
            { type: "text/plain" }), "constancia-sintetica.txt")}>Descargar constancia de prueba</button>}
        {verify && row.verifiedAt && row.kind === "PAYMENT" && <details><summary>Aplicar o devolver fondos</summary>
          {form("Aplicar pago", values => void perform("APPLY", { receiptId: row.id, obligationId: get(values, "obligationId"), ...amounts(values) }),
            <><label>Aplicar a obligación<select name="obligationId">{options}</select></label>{moneyInput}</>)}
          {form("Preparar devolución", values => void perform("REFUND", { receiptId: row.id, applicationId: get(values, "applicationId"),
            reason: get(values, "reason"), ...amounts(values) }), <>
            <label>Origen de devolución<select name="applicationId"><option value="">Saldo sin aplicar</option>
              {row.applications.map(line => <option key={line.id} value={line.id}>{items.obligations.find(x => x.id === line.obligationId)?.referenceCode} · {money(line.amountMinor)}</option>)}</select></label>
            {moneyInput}{why}</>)}
        </details>}
      </article>)}
    </>}
    {staff && <>
      {items.obligations.length > 0 && <details><summary>Registrar solidaridad</summary>
        {form("Proponer solidaridad", values => void perform("SOLIDARITY", { obligationId: get(values, "obligationId"),
          kind: get(values, "kind"), reason: get(values, "reason"), ...amounts(values) }),
          <><label>Obligación<select name="obligationId">{options}</select></label>
            <label>Tipo<select name="kind"><option value="SCHOLARSHIP">Beca</option><option value="DISCOUNT">Descuento</option>
              <option value="WAIVER">Exoneración</option></select></label>{moneyInput}{why}</>)}
        {items.awards.map(entry => <p key={entry.id}>{entry.kind} · {money(entry.amountMinor)} · {entry.approvedAt ? "Aprobada" : "Pendiente"}
          {approve && !entry.approvedAt && <button disabled={action.busy} onClick={() =>
            void perform("SOLIDARITY_APPROVE", { awardId: entry.id })}>Aprobar solidaridad</button>}</p>)}
      </details>}
      {items.refunds.length > 0 && <><h3>Devoluciones</h3>
        {items.refunds.map(row => <article className="record" key={row.id}>
          <p>{items.receipts.find(item => item.id === row.receiptId)?.reference} · {money(row.amountMinor)} · {stages[row.stage]}</p>
          {approve && row.stage === "PREPARED" && <div className="actions">
            <button disabled={action.busy} onClick={() => void perform("REFUND_APPROVE", { refundId: row.id })}>Aprobar devolución</button>
            <button disabled={action.busy} onClick={() => void perform("REFUND_REJECT", { refundId: row.id })}>Rechazar devolución</button>
          </div>}
          {execute && row.stage === "APPROVED" && <button disabled={action.busy} onClick={() =>
            void perform("REFUND_EXECUTE", { refundId: row.id })}>Confirmar devolución simulada</button>}
        </article>)}</>}
    </>}
    {!patient || staff ? <>
      <h3>Liquidaciones</h3>
      {verify && <details><summary>Preparar liquidación</summary>
        {form("Preparar liquidación", row => void perform("SETTLEMENT", { professionalId: get(row, "professionalId"),
          basisPoints: Number(row.get("basisPoints")) }), <><label>Profesional<select name="professionalId" required>
            {items.professionals.map(person => <option key={person.id} value={person.id}>{person.person.displayName}</option>)}</select></label>
          <label>Participación sintética en puntos básicos<input type="number" name="basisPoints" min="0" max="10000" step="1" required /></label></>)}
      </details>}
      {items.settlements.map(item => <article className="record" key={item.id}>
        <h4>{money(item.netMinor)} · {stages[item.stage]}</h4>
        <p>{item.ruleVersion} · {item.basisPoints / 100}% de base</p>
        <ul>{item.lines.map((line, i) => <li key={i}>{line.refundId ? "Corrección por devolución" : "Pago aplicado"} ·
          base {money(line.grossMinor)} · resultado {money(line.netMinor)}</li>)}</ul>
        {approve && item.stage === "PREPARED" && <button disabled={action.busy} onClick={() =>
          void perform("SETTLEMENT_APPROVE", { settlementId: item.id })}>Aprobar liquidación</button>}
        {execute && item.stage === "APPROVED" && <button disabled={action.busy} onClick={() =>
          void perform("SETTLEMENT_EXECUTE", { settlementId: item.id })}>Confirmar liquidación simulada</button>}
      </article>)}
    </> : null}
  </section>;
}
