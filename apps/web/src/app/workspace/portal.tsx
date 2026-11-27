"use client";

import { dateLabel } from "../../lib/operations";
import { Loading, onForm, useAction, useResource } from "./clinical/shared";
import type { Requester } from "./common";

export function ReminderInbox({ request }: { request: Requester }) {
  const preference = useResource<{ enabled: boolean }>(request, "portal/preferences");
  const inbox = useResource<{ id: string; startsAt: string; deliveredAt: string; message: string; current: boolean }[]>(request, "portal/inbox");
  const action = useAction(async () => { await preference.reload(); await inbox.reload(); });
  return <section className="panel clinical-stack">
    <h2>Recordatorios de prueba</h2>
    <Loading error={preference.error || inbox.error}>
      {preference.value && inbox.value ? <>
        <p>Bandeja privada de prueba del portal.</p>
        <button disabled={action.busy} onClick={() => void action.run(() =>
          request("portal/preferences", { enabled: !preference.value!.enabled }))}>
          {preference.value.enabled ? "Desactivar recordatorios" : "Aceptar recordatorios en la bandeja privada"}
        </button>
        <button type="button" className="secondary" onClick={() => void action.run(inbox.reload)}>Actualizar bandeja</button>
        {inbox.value.map(item => <article className="record" key={item.id}>
          <p>{item.message}</p><p>{dateLabel(item.deliveredAt)} · {item.current ? "Horario vigente" : "Horario reemplazado"}</p>
        </article>)}
        {inbox.value.length === 0 && <p>No hay entregas de prueba.</p>}
      </> : undefined}
    </Loading>{action.feedback}
  </section>;
}

type Video = { available: boolean; present: boolean; canManage: boolean; externalPending: boolean; externalConfirmedAt: string | null };

export function VideoAccess({ request, id }: { request: Requester; id: string }) {
  const route = `portal/video/${id}`;
  const details = useResource<Video>(request, route);
  const action = useAction(details.reload);
  const video = details.value;
  if (!video) return <Loading error={details.error} />;
  return <div className="clinical-stack">
    <p>Google Meet · gestión manual</p>
    {video.available && <button disabled={action.busy} onClick={() => void action.run(async () => {
      const tab = window.open("about:blank", "_blank");
      if (tab) tab.opener = null;
      try {
        const { url } = await request<{ url: string }>(`${route}/join`, {});
        if (tab) tab.location.replace(url);
        else window.location.assign(url);
      } catch (error) {
        tab?.close();
        throw error;
      }
    })}>Abrir enlace de participante</button>}
    {!video.available && <p>Enlace sin acceso desde el portal.</p>}
    {video.canManage && !video.present && <form onSubmit={onForm(data => void action.run(() => request(route, {
      url: data.get("url"), safetyChecked: data.has("controls"),
    })))}>
      <label>Enlace HTTPS del participante<input name="url" type="url" required maxLength={48} autoComplete="off" /></label>
      <label className="check"><input name="controls" required type="checkbox" />
        Revisé la admisión y desactivé grabación, transcripción y resúmenes en la reunión.</label>
      <button disabled={action.busy}>Registrar enlace administrado</button>
    </form>}
    {video.externalPending && <form onSubmit={onForm(data => void action.run(() => request(`${route}/external-confirmation`, {
      observed: data.has("observed"),
    })))}>
      <p>El enlace ya se retiró del portal. El profesional responsable debe cerrar o invalidar la reunión en el proveedor y verificar el resultado.</p>
      <label className="check"><input name="observed" type="checkbox" required />Comprobé el cierre o la invalidación en el proveedor.</label>
      <button disabled={action.busy}>Registrar confirmación externa</button>
    </form>}
    {video.externalConfirmedAt && <p>Confirmación manual del profesional · {dateLabel(video.externalConfirmedAt)}</p>}
    <p>Si se corta la conexión, vuelva a abrir el acceso desde la cita. Si el enlace sigue inaccesible, acuerde una reprogramación por la vía administrativa.</p>
    {action.feedback}
  </div>;
}
