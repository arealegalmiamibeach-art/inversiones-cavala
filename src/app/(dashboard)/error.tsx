"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <section role="alert" className="glass-panel w-full max-w-md rounded-2xl p-7 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-amber-300">
          <AlertTriangle aria-hidden="true" className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-base font-semibold text-white">No pudimos cargar esta sección</h1>
        <p className="mt-2 text-sm leading-6 text-white/65">
          Puede ser una interrupción temporal. Reintenta sin perder tu sesión o vuelve al inicio.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <button type="button" onClick={reset} className="glass-btn-primary justify-center">
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Reintentar
          </button>
          <Link href="/dashboard" className="glass-btn-secondary justify-center">
            Volver al inicio
          </Link>
        </div>
      </section>
    </div>
  );
}
