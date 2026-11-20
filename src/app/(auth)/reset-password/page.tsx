"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Scale, Send } from "lucide-react";
import { resetPassword } from "./actions";

export default function ResetPasswordPage() {
  const [correo, setCorreo] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await resetPassword(correo);
      if (res.ok) {
        setEnviado(true);
      } else {
        setError(res.error ?? "No se pudo enviar el correo");
      }
    } catch {
      setError("No se pudo enviar el enlace. Revisa tu conexión e inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#090c0a] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] shadow-glass backdrop-blur-xl">
            <Scale className="h-6 w-6 text-white" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
            Recuperar acceso
          </p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-white">
            Restablecer contraseña
          </h1>
          {!enviado && (
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.
            </p>
          )}
        </div>

        {enviado ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              Revisa tu bandeja de entrada — si el correo está registrado, recibirás el enlace en unos minutos.
            </div>
            <Link
              href="/login"
              className="flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-white/65">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                required
                maxLength={254}
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                autoComplete="email"
                className="input h-12 px-4 text-base sm:text-sm"
                placeholder="usuario@ejemplo.com"
              />
            </div>

            {error && (
              <div role="alert" className="rounded-xl border border-red-300/15 bg-[#3c2424]/80 p-3 text-sm text-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !correo.trim()}
              aria-busy={loading}
              className="btn-primary h-12 w-full justify-between px-5"
            >
              <span>{loading ? "Enviando..." : "Enviar enlace"}</span>
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>

            <Link
              href="/login"
              className="flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al inicio de sesión
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
