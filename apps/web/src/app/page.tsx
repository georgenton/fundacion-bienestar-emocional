"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiBaseUrl, authClient } from "../lib/auth-client";
import { resultForSession, SessionRequestGate, type SessionResult } from "../lib/session-request";

type CaseSummary = { id: string; referenceCode: string; status: string };

export default function Home() {
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needsSecondFactor, setNeedsSecondFactor] = useState(false);
  const [message, setMessage] = useState("");
  const [caseResult, setCaseResult] = useState<SessionResult<CaseSummary[]> | null>(null);
  const [caseRequests] = useState(() => new SessionRequestGate());
  const [signingOut, setSigningOut] = useState(false);
  const sessionKey = session && !signingOut ? `${session.user.id}:${session.session.id}` : null;
  const cases = resultForSession(caseResult, sessionKey) ?? [];

  useEffect(() => {
    caseRequests.cancel();
    setCaseResult(null);
    setMessage("");
    setNeedsSecondFactor(false);
    setTotp("");
    setPassword("");
    return () => caseRequests.cancel();
  }, [sessionKey, caseRequests]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const result = await authClient.signIn.email({ email, password });
    setPassword("");
    if (result.error) {
      setMessage("No fue posible iniciar sesión con esos datos.");
      return;
    }
    const data = result.data as unknown as { twoFactorRedirect?: boolean };
    if (data?.twoFactorRedirect) {
      setNeedsSecondFactor(true);
      setMessage("Ingrese el código del segundo factor.");
      return;
    }
    setMessage("Sesión iniciada.");
  }

  async function verifySecondFactor(event: FormEvent) {
    event.preventDefault();
    const result = await authClient.twoFactor.verifyTotp({ code: totp, trustDevice: false });
    if (result.error) {
      setMessage("El código no fue aceptado.");
      return;
    }
    setNeedsSecondFactor(false);
    setTotp("");
    setMessage("Segundo factor verificado.");
  }

  async function loadCases() {
    if (!sessionKey) return;
    const request = caseRequests.begin(sessionKey);
    try {
      const response = await fetch(`${apiBaseUrl}/api/cases`, {
        credentials: "include", cache: "no-store", signal: request.signal,
      });
      const data: unknown = await response.json();
      if (!caseRequests.isCurrent(request)) return;
      if (!response.ok) {
        setMessage("La política del servidor no permitió listar casos.");
        setCaseResult(null);
        if (data && typeof data === "object" && "code" in data && data.code === "MFA_VERIFICATION_REQUIRED") {
          setNeedsSecondFactor(true);
          setMessage("Verifique el segundo factor para continuar con esta sesión.");
        }
        return;
      }
      setCaseResult({ sessionKey: request.sessionKey, value: data as CaseSummary[] });
      setMessage("Alcance calculado por el servidor.");
    } catch {
      if (!caseRequests.isCurrent(request)) return;
      setCaseResult(null);
      setMessage("No fue posible consultar el alcance. Intente nuevamente.");
    }
  }

  async function signOut() {
    // Clear synchronously; do not wait for the auth provider or effect cleanup.
    caseRequests.cancel();
    setCaseResult(null);
    setPassword("");
    setTotp("");
    setNeedsSecondFactor(false);
    setMessage("");
    setSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) setMessage("No fue posible cerrar sesión. Intente nuevamente.");
    } catch {
      setMessage("No fue posible cerrar sesión. Intente nuevamente.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main>
      <div className="environment">ENTORNO LOCAL · DATOS SINTÉTICOS · NO APTO PARA PACIENTES</div>
      <section className="hero">
        <p className="eyebrow">Fundación para el Bienestar Emocional</p>
        <h1>Base verificable de identidad y acceso</h1>
        <p>
          Este recorrido demuestra autenticación y separación de permisos. No contiene expediente clínico,
          agenda, registro funcional de pacientes ni prestaciones reales.
        </p>
      </section>

      <section className="panel" aria-live="polite">
        {isPending ? <p>Comprobando sesión…</p> : null}
        {!session && !needsSecondFactor ? (
          <form onSubmit={signIn}>
            <h2>Ingreso de demostración</h2>
            <label>
              Correo sintético
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              Contraseña local
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button type="submit">Iniciar sesión</button>
          </form>
        ) : null}

        {needsSecondFactor ? (
          <form onSubmit={verifySecondFactor}>
            <h2>Segundo factor</h2>
            <label>
              Código TOTP
              <input inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={(event) => setTotp(event.target.value)} required />
            </label>
            <button type="submit">Verificar</button>
          </form>
        ) : null}

        {session ? (
          <div>
            <h2>Sesión sintética activa</h2>
            <p>{session.user.name}</p>
            <div className="actions">
              <button type="button" onClick={loadCases} disabled={signingOut}>Consultar mi alcance</button>
              <button type="button" className="secondary" onClick={signOut} disabled={signingOut}>Cerrar sesión</button>
            </div>
            <ul>
              {cases.map((careCase) => (
                <li key={careCase.id}>{careCase.referenceCode} · {careCase.status}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {message ? <p className="message">{message}</p> : null}
      </section>
    </main>
  );
}
