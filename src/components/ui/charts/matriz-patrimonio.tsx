"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

interface Celda {
  valor: number;
  riesgo?: boolean;
}

/**
 * Cruce de dos variables binarias (registrado × titularidad). La matriz es la
 * forma canónica para este caso: hace legible el cuadrante de riesgo y —igual
 * de importante— el cuadrante vacío, que por sí solo es un hallazgo.
 */
export function MatrizPatrimonio({
  registradoNuestro,
  registradoTerceros,
  noRegNuestro,
  noRegTerceros,
  enLitigioRiesgo,
  total,
}: {
  registradoNuestro: number;
  registradoTerceros: number;
  noRegNuestro: number;
  noRegTerceros: number;
  enLitigioRiesgo: number;
  total: number;
}) {
  const noPropio = registradoTerceros + noRegNuestro + noRegTerceros;

  function Cuadrante({ valor, riesgo }: Celda) {
    const vacio = valor === 0;
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-xl border px-3 py-5 transition-colors ${
          riesgo
            ? "border-[color:var(--viz-critical)]/40 bg-[color:var(--viz-critical)]/10"
            : vacio
              ? "border-dashed border-white/10 bg-transparent"
              : "border-white/10 bg-white/[0.04]"
        }`}
      >
        <span
          className={`text-2xl font-bold ${
            riesgo ? "text-[color:var(--viz-critical)]" : vacio ? "text-white/20" : "text-white/90"
          }`}
        >
          {valor}
        </span>
        {riesgo && (
          <span className="mt-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-[color:var(--viz-critical)]">
            <AlertTriangle className="h-3 w-3" /> Riesgo
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="viz">
      <div className="grid grid-cols-[5.5rem_1fr_1fr] gap-2">
        <span />
        <span className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-white/35">
          A nuestro nombre
        </span>
        <span className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-white/35">
          A nombre de 3ros
        </span>

        <span className="flex items-center text-xs font-medium text-white/60">Registrado</span>
        <Cuadrante valor={registradoNuestro} />
        <Cuadrante valor={registradoTerceros} />

        <span className="flex items-center text-xs font-medium text-white/60">No registrado</span>
        <Cuadrante valor={noRegNuestro} />
        <Cuadrante valor={noRegTerceros} riesgo={noRegTerceros > 0} />
      </div>

      <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-xs">
        <p className="text-white/55">
          <strong className="font-semibold text-white/85">{noPropio}</strong> de {total} predios no están
          inscritos a nombre de Cavala
        </p>
        {enLitigioRiesgo > 0 && (
          <Link
            href="/procesos"
            className="inline-flex items-center gap-1.5 text-[color:var(--viz-critical)] hover:underline"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {enLitigioRiesgo} de ellos están además en litigio →
          </Link>
        )}
      </div>
    </div>
  );
}
