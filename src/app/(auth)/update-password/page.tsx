"use client";

import { useEffect, useState } from "react";
import { Scale, KeyRound } from "lucide-react";
import { updatePassword } from "./actions";

export default function UpdatePasswordPage() {
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "enlace-invalido") {
      setError("El enlace venció o ya fue utilizado. Solicita una nueva invitación o recuperación de contraseña.");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (nueva !== confirmar) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await updatePassword(nueva);
      if (res && !res.ok) setError(res.error ?? "Error al actualizar la contraseña");
    } catch {
      setError("No se pudo actualizar la contraseña. Revisa tu conexión o solicita un nuevo enlace.");
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
            Nueva contraseña
          </p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-white">
            Elige tu contraseña
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Ingresa y confirma tu nueva contraseña para acceder al sistema.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nueva" className="mb-2 block text-sm font-medium text-white/65">
              Nueva contraseña
            </label>
            <input
              id="nueva"
              type="password"
              required
              minLength={8}
              maxLength={128}
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              autoComplete="new-password"
              className="input h-12 px-4 text-base sm:text-sm"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div>
            <label htmlFor="confirmar" className="mb-2 block text-sm font-medium text-white/65">
              Confirmar contraseña
            </label>
            <input
              id="confirmar"
              type="password"
              required
              minLength={8}
              maxLength={128}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              autoComplete="new-password"
              className="input h-12 px-4 text-base sm:text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-red-300/15 bg-[#3c2424]/80 p-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !nueva || !confirmar}
            aria-busy={loading}
            className="btn-primary h-12 w-full justify-between px-5"
          >
            <span>{loading ? "Guardando..." : "Guardar contraseña"}</span>
            <KeyRound className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    </main>
  );
}
