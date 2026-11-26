"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { authClient } from "../lib/auth-client";
import { Workspace } from "./workspace/workspace";

export default function Home() {
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needsSecondFactor, setNeedsSecondFactor] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const sessionKey = session && !signingOut ? `${session.user.id}:${session.session.id}` : null;

  useEffect(() => {
    setMessage("");
    setBlocked(false);
    setNeedsSecondFactor(false);
    setTotp("");
    setPassword("");
  }, [sessionKey]);

  const onSessionError = useCallback((code: string) => {
    setBlocked(true);
    if (code === "MFA_VERIFICATION_REQUIRED") {
      setNeedsSecondFactor(true);
      setMessage("Verifique el segundo factor para continuar.");
    } else if (code === "MFA_ENROLLMENT_REQUIRED") {
      setMessage("La cuenta de personal requiere inscribir el segundo factor.");
    } else {
      setMessage("La sesión ya no está activa. Cierre sesión e ingrese de nuevo.");
    }
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      const result = await authClient.signIn.email({ email, password, rememberMe: false });
      if (result.error) {
        setMessage("No fue posible iniciar sesión con esos datos.");
        return;
      }
      const data = result.data as unknown as { twoFactorRedirect?: boolean };
      if (data?.twoFactorRedirect) {
        setNeedsSecondFactor(true);
      }
    } catch {
      setMessage("No fue posible conectar. Intente nuevamente.");
    } finally {
      setPassword("");
      setSubmitting(false);
    }
  }

  async function verifySecondFactor(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: totp, trustDevice: false });
      if (result.error) {
        setMessage("El código no fue aceptado.");
        return;
      }
      setNeedsSecondFactor(false);
      setBlocked(false);
      setTotp("");
    } catch {
      setMessage("No fue posible conectar. Intente nuevamente.");
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
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
      <div className="environment">ENTORNO DE PRUEBAS · DATOS SINTÉTICOS · NO APTO PARA PACIENTES</div>
      <header className={session ? "workspace-title" : "hero"}>
        <div><p className="eyebrow">Fundación para el Bienestar Emocional</p>
          <h1>Personas, casos y agenda</h1></div>
        {session ? <div className="session">
          <span>{session.user.name}</span>
          <button type="button" className="secondary" onClick={signOut} disabled={signingOut}>Cerrar sesión</button>
        </div> : null}
      </header>
      {!session || needsSecondFactor || message || isPending ? (
        <section className="panel auth-panel">
          {isPending ? <p role="status">Comprobando sesión…</p> : null}
          {!isPending && !session && !needsSecondFactor ? (
            <form onSubmit={signIn}>
              <h2>Iniciar sesión</h2>
              <label>Correo sintético<input type="email" name="email" autoComplete="username" value={email}
                onChange={event => setEmail(event.target.value)} required /></label>
              <label>Contraseña<input type="password" name="password" autoComplete="current-password" value={password}
                onChange={event => setPassword(event.target.value)} required /></label>
              <button type="submit" disabled={submitting}>Iniciar sesión</button>
            </form>
          ) : null}
          {needsSecondFactor ? (
            <form onSubmit={verifySecondFactor}>
              <h2>Segundo factor</h2>
              <label>Código TOTP<input inputMode="numeric" autoComplete="one-time-code" value={totp}
                onChange={event => setTotp(event.target.value)} required /></label>
              <button type="submit" disabled={submitting}>Verificar</button>
            </form>
          ) : null}
          {message ? <p className="message" role="alert">{message}</p> : null}
        </section>
      ) : null}
      {sessionKey && !needsSecondFactor && !blocked ? <Workspace key={sessionKey} onSessionError={onSessionError} /> : null}
    </main>
  );
}
