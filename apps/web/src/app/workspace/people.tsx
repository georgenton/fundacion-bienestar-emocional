"use client";

import { useEffect, useState } from "react";
import { dateLabel, explain, modalities, toInstant, type CaseSummary, type Catalog } from "../../lib/operations";
import { field, ProfessionalOptions, ServiceOptions, SubmitForm, type Requester } from "./common";

type Person = {
  id: string; displayName: string; contactEmail: string | null; userAccount: { status: string } | null;
};
type Assignment = {
  id: string; startsAt: string; endsAt: string | null; revokedAt: string | null; allowedActions: string[];
  account: { id: string; person: { displayName: string } };
};
type CaseDetail = CaseSummary & { service: { name: string } | null; assignments: Assignment[] };
type PersonDetail = Person & { cases: CaseDetail[] };

export function People({ request, catalog, book }: {
  request: Requester; catalog: Catalog; book: (caseId: string) => void;
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState("");
  const [term, setTerm] = useState("");
  const [detail, setDetail] = useState<PersonDetail>();
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    request<Person[]>(`people?q=${encodeURIComponent(term)}`, undefined, controller.signal)
      .then(setPeople).catch(error => { if (!controller.signal.aborted) setError(explain(error)); });
    return () => controller.abort();
  }, [request, term, revision]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    request<PersonDetail>(`people/${selected}`, undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setDetail(result); })
      .catch(error => { if (!controller.signal.aborted) setError(explain(error)); });
    return () => controller.abort();
  }, [request, selected, revision]);

  const person = detail?.id === selected ? detail : undefined;
  const refresh = () => setRevision(value => value + 1);

  return (
    <div className="people-layout">
      <section className="panel">
        <h2>Personas</h2>
        <form role="search" className="search-form" onSubmit={event => {
          event.preventDefault();
          setError("");
          setTerm(field(new FormData(event.currentTarget), "query"));
        }}>
          <label>Nombre o correo de contacto<input type="search" name="query" maxLength={120} /></label>
          <button className="secondary">Buscar</button>
        </form>
        {error ? <p className="message" role="alert">{error}</p> : null}
        <ul className="person-list">
          {people.map(item => (
            <li key={item.id}>
              <button type="button" className="person-row" aria-pressed={selected === item.id}
                onClick={() => { setError(""); setSelected(item.id); }}>
                <strong>{item.displayName}</strong>
                <small>{item.contactEmail ?? "Sin correo"} · {item.userAccount ? "Cuenta vinculada" : "Sin cuenta"}</small>
              </button>
            </li>
          ))}
        </ul>
        {!people.length && !error ? <p className="muted">Sin coincidencias.</p> : null}
        <details className="action-details" open={!selected}>
          <summary>Registrar persona</summary>
          <SubmitForm label="Guardar persona" submit={async (data, form) => {
            const created = await request<Person>("people", {
              displayName: field(data, "displayName"), contactEmail: field(data, "contactEmail"),
            });
            form.reset();
            setSelected(created.id);
            setTerm("");
            refresh();
            return "Persona registrada sin cuenta.";
          }}>
            <label>Nombre de la persona<input name="displayName" autoComplete="off" minLength={3} maxLength={120} required /></label>
            <label>Correo de contacto (opcional)<input name="contactEmail" type="email" autoComplete="off" placeholder="contacto@example.test" /></label>
          </SubmitForm>
        </details>
      </section>
      <section className="panel">
        {!person ? <p className="muted">{selected ? "Cargando ficha…" : "Seleccione una persona para ver su ficha."}</p> : (
          <PersonCard key={person.id} person={person} catalog={catalog} request={request} refresh={refresh} book={book} />
        )}
      </section>
    </div>
  );
}

function PersonCard({ person, catalog, request, refresh, book }: {
  person: PersonDetail; catalog: Catalog; request: Requester; refresh: () => void; book: (caseId: string) => void;
}) {
  const [serviceId, setServiceId] = useState("");
  const services = catalog.services.filter(service => service.enabled);
  const options = services.find(service => service.id === serviceId)?.modalities ?? [];
  return (
    <>
      <h2>{person.displayName}</h2>
      <dl className="facts">
        <div><dt>Contacto</dt><dd>{person.contactEmail ?? "Sin correo"}</dd></div>
        <div><dt>Acceso</dt><dd>{person.userAccount ? `Cuenta vinculada · ${person.userAccount.status === "ACTIVE" ? "Activa" : "Inactiva"}` : "Sin cuenta"}</dd></div>
      </dl>
      {!person.userAccount ? (
        <details className="action-details">
          <summary>Invitar al portal</summary>
          <SubmitForm label="Crear invitación" submit={async (data, form) => {
            await request("invitations", { personId: person.id, email: field(data, "email") });
            form.reset();
            return "Invitación depositada en el buzón sintético privado. Vigencia de 24 horas.";
          }}>
            <label>Correo sintético de acceso<input type="email" name="email" placeholder="paciente@example.test" required /></label>
          </SubmitForm>
        </details>
      ) : null}
      <div className="section-heading"><h3>Casos</h3></div>
      {!person.cases.length ? <p className="muted">Esta ficha aún no tiene casos.</p> : null}
      {person.cases.map(careCase => (
        <CaseCard key={careCase.id} careCase={careCase} catalog={catalog} request={request} refresh={refresh} book={book} />
      ))}
      <details className="action-details">
        <summary>Abrir caso individual</summary>
        <SubmitForm label="Abrir caso" submit={async (data, form) => {
          await request("cases", { personId: person.id, serviceId, modality: field(data, "modality") });
          form.reset();
          setServiceId("");
          refresh();
          return "Caso abierto.";
        }}>
          <label>Servicio<select name="serviceId" value={serviceId} required onChange={event => setServiceId(event.target.value)}>
            <ServiceOptions services={services} />
          </select></label>
          <label>Modalidad<select key={serviceId} name="modality" required>
            {options.length ? options.map(mode => <option key={mode} value={mode}>{modalities[mode]}</option>) : <option value="">Elija primero el servicio</option>}
          </select></label>
        </SubmitForm>
      </details>
    </>
  );
}

function CaseCard({ careCase, catalog, request, refresh, book }: {
  careCase: CaseDetail; catalog: Catalog; request: Requester; refresh: () => void; book: (id: string) => void;
}) {
  const service = catalog.services.find(item => item.id === careCase.serviceId);
  const professionals = catalog.professionals.filter(professional =>
    service?.professionals.some(eligible => eligible.enabled && eligible.professionalId === professional.id));
  return (
    <article className="record">
      <div className="row-content">
        <div>
          <strong>{careCase.service?.name ?? "Caso anterior al catálogo"}</strong>
          <p className="reference">{careCase.referenceCode}</p>
        </div>
        <span className="badge">{careCase.status === "OPEN" ? "Abierto" : careCase.status === "PAUSED" ? "Pausado" : "Cerrado"}</span>
      </div>
      {careCase.modality ? <p>{modalities[careCase.modality]}</p> : null}
      {careCase.assignments.length ? (
        <ul className="compact-list">
          {careCase.assignments.map(assignment => (
            <li key={assignment.id}>
              <strong>{assignment.account.person.displayName}</strong>{" "}
              <small>{dateLabel(assignment.startsAt)} → {assignment.endsAt ? dateLabel(assignment.endsAt) : "Sin fecha de fin"}
                {assignment.revokedAt ? " · Revocada" : ""}
                {assignment.allowedActions.includes("CASE_APPOINTMENT_READ") ? " · Resumen y agenda" : " · Alcance previo"}
              </small>
            </li>
          ))}
        </ul>
      ) : <p className="muted">Sin profesional asignado.</p>}
      {careCase.status === "OPEN" && careCase.serviceId ? (
        <>
          <details className="action-details">
            <summary>Asignar profesional</summary>
            <SubmitForm label="Guardar asignación" submit={async (data, form) => {
              const start = field(data, "start");
              const end = field(data, "end");
              await request(`cases/${careCase.id}/assignments`, {
                professionalId: field(data, "professionalId"),
                ...(start ? { startsAt: toInstant(start) } : {}), ...(end ? { endsAt: toInstant(end) } : {}),
              });
              form.reset();
              refresh();
              return "Asignación guardada con acceso al resumen y a la agenda del caso.";
            }}>
              <label>Profesional<select name="professionalId" required><ProfessionalOptions professionals={professionals} /></select></label>
              <label>Inicio (vacío = ahora)<input type="datetime-local" name="start" /></label>
              <label>Fin (opcional)<input type="datetime-local" name="end" /></label>
            </SubmitForm>
          </details>
          <button type="button" className="secondary" onClick={() => book(careCase.id)}>Agendar este caso</button>
        </>
      ) : null}
    </article>
  );
}
