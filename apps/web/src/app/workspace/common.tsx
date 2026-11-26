import { useState, type FormEvent, type ReactNode } from "react";
import { explain, type Professional, type Service } from "../../lib/operations";

export type Requester = <T>(path: string, body?: object, signal?: AbortSignal) => Promise<T>;
export type FormHandler = (data: FormData, form: HTMLFormElement) => Promise<string | void>;

export function SubmitForm({
  children, submit, label, className,
}: { children: ReactNode; submit: FormHandler; label: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);

  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setStatus("");
    setFailed(false);
    try {
      const message = await submit(data, form);
      if (message) setStatus(message);
    } catch (error) {
      setStatus(explain(error));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handle} className={className}>
      <fieldset disabled={busy} className="fields">
        <div className="form-grid">{children}</div>
        <button type="submit">{busy ? "Procesando…" : label}</button>
      </fieldset>
      {status ? <p className={failed ? "message" : "status"} role={failed ? "alert" : "status"}>{status}</p> : null}
    </form>
  );
}

export const field = (data: FormData, key: string) => String(data.get(key) ?? "");

export function ServiceOptions({ services }: { services: Service[] }) {
  return <>
    <option value="">Seleccione un servicio</option>
    {services.map(service => <option key={service.id} value={service.id}>{service.name}{service.enabled ? "" : " (deshabilitado)"}</option>)}
  </>;
}

export function ProfessionalOptions({ professionals, placeholder = "Seleccione un profesional" }: {
  professionals: Professional[]; placeholder?: string;
}) {
  return <>
    <option value="">{placeholder}</option>
    {professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.person.displayName}</option>)}
  </>;
}
