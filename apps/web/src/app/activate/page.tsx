"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api, explain } from "../../lib/operations";

export default function Activate() {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    // Keep the initial invitation out of referrers and the browser history.
    const location = window.location;
    const value = new URLSearchParams(location.hash.slice(1)).get("token") ?? new URLSearchParams(location.search).get("token");
    setToken(value ?? "");
    if (value) window.history.replaceState(null, "", location.pathname);
    setReady(true);
  }, []);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = data.get("password");
    if (password !== data.get("repeat")) {
      setMessage("Las contraseñas deben coincidir.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ mfaEnrollmentRequired: boolean }>("invitations/activate", { token, password });
      form.reset();
      setToken("");
      setActivated(true);
      setMessage(result.mfaEnrollmentRequired ? "Cuenta activada. El acceso de personal requiere configurar MFA." : "Cuenta activada. Ya puede iniciar sesión.");
    } catch (error) {
      setMessage(explain(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="environment">ENTORNO DE PRUEBAS · DATOS SINTÉTICOS · NO APTO PARA PACIENTES</div>
      <section className="panel auth-panel">
        <h1 className="auth-heading">Activar mi cuenta</h1>
        {ready && token ? (
          <form onSubmit={activate}>
            <label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
            <label>Repetir contraseña<input name="repeat" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
            <button disabled={busy}>Activar cuenta</button>
          </form>
        ) : ready && !activated ? <p>Abra el enlace de activación de la invitación sintética.</p> : null}
        {message ? <p className="message" role="status">{message}</p> : null}
        <p><Link href="/">Ir a inicio de sesión</Link></p>
      </section>
    </main>
  );
}
