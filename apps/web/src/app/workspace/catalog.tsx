"use client";

import { useState } from "react";
import { dateLabel, explain, modalities, tariffLabel, toInstant, type Absence, type Catalog } from "../../lib/operations";
import { field, ProfessionalOptions, ServiceOptions, SubmitForm, type Requester } from "./common";

const weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const hoursLabel = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const toMinute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
type AbsenceConflicts = Absence & {
  conflicts: { id: string; startsAt: string; endsAt: string; status: string; careCase: { referenceCode: string } }[];
};

export function CatalogPane({ request, catalog, reload }: { request: Requester; catalog: Catalog; reload: () => Promise<void> }) {
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [conflicts, setConflicts] = useState<AbsenceConflicts>();
  const [error, setError] = useState("");
  const service = catalog.services.find(item => item.id === serviceId);
  const professional = catalog.professionals.find(item => item.id === professionalId);

  return (
    <div className="workspace-columns">
      <section className="panel">
        <h2>Servicios y tarifas</h2>
        <label>Servicio para editar<select value={serviceId} onChange={event => setServiceId(event.target.value)}>
          <option value="">Crear un servicio nuevo</option>
          {catalog.services.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <SubmitForm key={serviceId} label="Guardar servicio" className="action-form" submit={async (data) => {
          const result = await request<{ id: string }>("agenda/catalog/services", {
            ...(service ? { id: service.id } : {}), name: field(data, "name"),
            enabled: data.has("enabled"), modalities: data.getAll("modalities"),
            durationMinutes: Number(data.get("duration")), marginMinutes: Number(data.get("margin")),
          });
          await reload();
          setServiceId(result.id);
          return "Servicio guardado.";
        }}>
          <label>Nombre del servicio<input name="name" defaultValue={service?.name ?? ""} minLength={3} maxLength={100} required /></label>
          <label>Duración en minutos<input type="number" name="duration" min={5} max={240} defaultValue={service?.durationMinutes ?? 50} required /></label>
          <label>Margen posterior en minutos<input type="number" name="margin" min={0} max={120} defaultValue={service?.marginMinutes ?? 10} required /></label>
          <div className="checks">
            <label><input type="checkbox" name="enabled" defaultChecked={service?.enabled ?? true} /> Servicio habilitado</label>
            <label><input type="checkbox" name="modalities" value="IN_PERSON" defaultChecked={service?.modalities.includes("IN_PERSON") ?? true} /> Presencial</label>
            <label><input type="checkbox" name="modalities" value="ONLINE" defaultChecked={service?.modalities.includes("ONLINE") ?? false} /> En línea</label>
          </div>
        </SubmitForm>

        <details className="action-details">
          <summary>Habilitación por profesional</summary>
          <SubmitForm label="Guardar habilitación" submit={async data => {
            await request("agenda/catalog/eligibility", {
              serviceId: field(data, "serviceId"), professionalId: field(data, "professionalId"),
              enabled: field(data, "enabled") === "true",
            });
            await reload();
            return "Habilitación actualizada.";
          }}>
            <label>Servicio<select name="serviceId" defaultValue={serviceId} required><ServiceOptions services={catalog.services} /></select></label>
            <label>Profesional<select name="professionalId" required><ProfessionalOptions professionals={catalog.professionals} /></select></label>
            <label>Estado<select name="enabled"><option value="true">Habilitado</option><option value="false">Deshabilitado</option></select></label>
          </SubmitForm>
          {service ? <p className="muted">{service.professionals.filter(item => item.enabled).length} profesionales habilitados en {service.name}.</p> : null}
        </details>

        <details className="action-details">
          <summary>Crear versión de tarifa</summary>
          <SubmitForm label="Agregar tarifa" submit={async (data, form) => {
            const startsAt = field(data, "startsAt");
            await request("agenda/catalog/tariffs", {
              serviceId: field(data, "serviceId"), amountMinor: Number(data.get("amount")), currency: "USD",
              ...(startsAt ? { startsAt: toInstant(startsAt) } : {}),
            });
            form.reset();
            await reload();
            return "Versión guardada. Las citas existentes conservan su tarifa.";
          }}>
            <label>Servicio<select name="serviceId" defaultValue={serviceId} required><ServiceOptions services={catalog.services} /></select></label>
            <label>Importe en centavos de USD<input type="number" name="amount" min={0} max={100000000} step={1} required /></label>
            <label>Vigente desde (vacío = ahora)<input type="datetime-local" name="startsAt" /></label>
          </SubmitForm>
          {service?.tariffs.length ? <ul className="compact-list">
            {service.tariffs.map(tariff => <li key={tariff.id}>{tariffLabel(tariff.amountMinor, tariff.currency)} · Desde {dateLabel(tariff.startsAt)}</li>)}
          </ul> : null}
        </details>
      </section>

      <section className="panel">
        <div className="section-heading"><h2>Disponibilidad</h2><small>America/Guayaquil</small></div>
        <label>Profesional para configurar<select value={professionalId} onChange={event => {
          setProfessionalId(event.target.value);
          setConflicts(undefined);
        }}><ProfessionalOptions professionals={catalog.professionals} /></select></label>
        {professional ? <>
          <div className="action-details">
            <h3>Horario habitual</h3>
            {professional.workingHours.length ? <ul className="compact-list">
              {professional.workingHours.map(hours => <li key={hours.weekday}>{weekdays[hours.weekday - 1]} · {hoursLabel(hours.opensMinute)}–{hoursLabel(hours.closesMinute)}</li>)}
            </ul> : <p className="muted">Todavía no hay horarios configurados.</p>}
            <SubmitForm key={professional.id} label="Guardar horario" submit={async data => {
              const enabled = field(data, "enabled") === "true";
              const start = field(data, "open");
              const end = field(data, "close");
              await request("agenda/catalog/hours", {
                professionalId: professional.id, weekday: Number(data.get("weekday")), enabled,
                ...(enabled ? { opensMinute: toMinute(start), closesMinute: toMinute(end) } : {}),
              });
              await reload();
              return "Horario guardado.";
            }}>
              <label>Día<select name="weekday">{weekdays.map((weekday, index) => <option key={weekday} value={index + 1}>{weekday}</option>)}</select></label>
              <label>Desde<input name="open" type="time" defaultValue="09:00" required /></label>
              <label>Hasta<input name="close" type="time" defaultValue="17:00" required /></label>
              <label>Disponibilidad<select name="enabled"><option value="true">Disponible</option><option value="false">No disponible</option></select></label>
            </SubmitForm>
          </div>
          <details className="action-details">
            <summary>Registrar ausencia</summary>
            <SubmitForm label="Guardar ausencia" submit={async (data, form) => {
              const result = await request<AbsenceConflicts>("agenda/catalog/absences", {
                professionalId: professional.id, startsAt: toInstant(field(data, "start")), endsAt: toInstant(field(data, "end")),
              });
              setConflicts(result);
              form.reset();
              await reload();
              return result.conflicts.length ? "Ausencia guardada. Revise las citas afectadas." : "Ausencia guardada sin citas afectadas.";
            }}>
              <label>Inicio de la ausencia<input type="datetime-local" name="start" required /></label>
              <label>Fin de la ausencia<input type="datetime-local" name="end" required /></label>
            </SubmitForm>
          </details>
          {professional.absences.length ? <ul className="compact-list">
            {professional.absences.map(absence => (
              <li key={absence.id}>
                <p>{dateLabel(absence.startsAt)} → {dateLabel(absence.endsAt)}</p>
                <div className="actions">
                  <button type="button" className="secondary" onClick={async () => {
                    try { setError(""); setConflicts(await request<AbsenceConflicts>(`agenda/catalog/absences/${absence.id}/conflicts`)); }
                    catch (error) { setError(explain(error)); }
                  }}>Ver citas afectadas</button>
                  <button type="button" className="secondary" onClick={async () => {
                    try {
                      setError("");
                      await request(`agenda/catalog/absences/${absence.id}/remove`, {});
                      setConflicts(undefined);
                      await reload();
                    } catch (error) { setError(explain(error)); }
                  }}>Retirar ausencia</button>
                </div>
              </li>
            ))}
          </ul> : null}
          {error ? <p className="message" role="alert">{error}</p> : null}
          {conflicts ? (
            <article className="record" role="status">
              <strong>{conflicts.conflicts.length ? "Citas que requieren resolución" : "Sin citas afectadas"}</strong>
              <ul className="compact-list">
                {conflicts.conflicts.map(item => <li key={item.id}>{dateLabel(item.startsAt)} · {item.careCase.referenceCode} · {item.status === "HELD" ? "Reserva" : "Confirmada"}</li>)}
              </ul>
            </article>
          ) : null}
        </> : <p className="muted">Seleccione un profesional habilitado para configurar su horario y ausencias.</p>}
      </section>
    </div>
  );
}
