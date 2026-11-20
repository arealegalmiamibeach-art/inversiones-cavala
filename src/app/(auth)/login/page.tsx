"use client";

import { useState } from "react";
import Link from "next/link";
import { login } from "./actions";
import { ArrowRight, Scale } from "lucide-react";
import LoginVisual from "@/components/auth/login-visual";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const result = await login(formData);
      if (result?.error) setError(result.error);
    } catch {
      setError("No se pudo iniciar sesión. Revisa tu conexión e inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-[#090c0a] lg:grid lg:grid-cols-2">
      <section className="relative min-h-[230px] overflow-hidden border-b border-white/10 bg-black sm:min-h-[280px] lg:min-h-[100dvh] lg:border-b-0 lg:border-r">
        <LoginVisual />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/70" />

        <div className="relative z-10 flex h-full min-h-[230px] flex-col justify-end p-5 sm:min-h-[280px] sm:p-6 lg:min-h-[100dvh] lg:p-10">
          <div className="max-w-md">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/45">
              Gestión legal documentaria
            </p>
            <h1 className="mt-2 max-w-full break-words text-2xl font-medium leading-[1.16] tracking-[-0.03em] text-white sm:mt-3 sm:text-4xl lg:text-5xl">
              Control claro para decisiones seguras.
            </h1>
          </div>
        </div>
      </section>

      <section className="relative flex min-h-[calc(100dvh-230px)] items-center justify-center overflow-hidden px-4 py-8 sm:min-h-[calc(100dvh-280px)] sm:px-8 sm:py-12 lg:min-h-[100dvh] lg:px-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(31,86,51,0.20),transparent_38%)]" />

        <div className="relative w-full min-w-0 max-w-sm">
          <div className="mb-6 sm:mb-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] shadow-glass backdrop-blur-xl">
              <Scale className="h-6 w-6 text-white" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
              Acceso privado
            </p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-white sm:text-3xl">
              Iniciar sesión
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Ingresa tus credenciales para acceder al sistema.
            </p>
          </div>

          <form action={handleSubmit} className="space-y-4 sm:space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-white/65"
              >
                Correo electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                className="input h-12 px-4 text-base sm:text-sm"
                placeholder="usuario@ejemplo.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-white/65"
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
                className="input h-12 px-4 text-base sm:text-sm"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-300/15 bg-[#3c2424]/80 p-3 text-sm text-red-100"
              >
                {error === "Invalid login credentials"
                  ? "Correo o contraseña incorrectos."
                  : error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="btn-primary h-12 w-full justify-between px-5"
            >
              <span>{loading ? "Ingresando..." : "Ingresar"}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="text-center">
              <Link
                href="/reset-password"
                className="text-xs text-white/55 transition-colors hover:text-white"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>

          <p className="mt-8 text-xs text-white/45">
            VECZAIL S.A.C. &copy; {new Date().getFullYear()}
          </p>
        </div>
      </section>
    </main>
  );
}
