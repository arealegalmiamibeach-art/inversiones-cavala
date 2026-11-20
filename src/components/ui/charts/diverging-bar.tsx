"use client";

import Link from "next/link";

export interface FilaVencimiento {
  label: string;
  vencidos: number;
  proximos: number;
  href?: string;
}

/**
 * Barra divergente centrada en "hoy": a la izquierda lo ya vencido, a la
 * derecha lo próximo a vencer. Ambos brazos comparten la MISMA escala
 * (px por unidad), por eso el ancho de cada brazo se reparte según su propio
 * máximo — así las longitudes son comparables entre brazos y entre filas.
 *
 * Cada brazo es el bloque contenedor de su barra (posición relativa) para que
 * el ancho porcentual se resuelva contra el brazo y no contra el contenido; las
 * cifras van posicionadas en absoluto para no robarle ancho a la barra.
 */
export function DivergingBar({
  filas,
  diasFuturo = 90,
}: {
  filas: FilaVencimiento[];
  diasFuturo?: number;
}) {
  const maxV = Math.max(...filas.map((f) => f.vencidos), 1);
  const maxP = Math.max(...filas.map((f) => f.proximos), 1);
  const total = maxV + maxP;
  const izqPct = (maxV / total) * 100;
  const derPct = (maxP / total) * 100;

  return (
    <div className="viz">
      {/* Leyenda — siempre presente con 2 series */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-white/60">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-critical)" }} />
          Ya vencido
        </span>
        <span className="flex items-center gap-1.5 text-white/60">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-warning)" }} />
          Vence en {diasFuturo} días
        </span>
      </div>

      <div className="space-y-2">
        {filas.map((f) => {
          const contenido = (
            <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
              <span className="truncate text-xs font-medium text-white/70">{f.label}</span>
              {/* el padding reserva sitio para las cifras de los extremos */}
              <div className="flex items-center px-10">
                {/* brazo izquierdo — vencido */}
                <div className="relative flex h-6 items-center justify-end" style={{ width: `${izqPct}%` }}>
                  {f.vencidos > 0 && (
                    <div
                      className="relative h-full rounded-l-[4px]"
                      style={{
                        width: `${(f.vencidos / maxV) * 100}%`,
                        minWidth: 3,
                        background: "var(--viz-critical)",
                      }}
                    >
                      <span className="absolute right-full top-1/2 mr-2 -translate-y-1/2 text-xs font-semibold tabular-nums text-white/75">
                        {f.vencidos}
                      </span>
                    </div>
                  )}
                </div>
                {/* línea de "hoy" — separa los dos rellenos */}
                <div className="mx-[1px] h-7 w-px shrink-0 bg-white/25" />
                {/* brazo derecho — próximo */}
                <div className="relative flex h-6 items-center justify-start" style={{ width: `${derPct}%` }}>
                  {f.proximos > 0 && (
                    <div
                      className="relative h-full rounded-r-[4px]"
                      style={{
                        width: `${(f.proximos / maxP) * 100}%`,
                        minWidth: 3,
                        background: "var(--viz-warning)",
                      }}
                    >
                      <span className="absolute left-full top-1/2 ml-2 -translate-y-1/2 text-xs font-semibold tabular-nums text-white/75">
                        {f.proximos}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );

          const titulo = `${f.label}: ${f.vencidos} vencidos · ${f.proximos} vencen en ${diasFuturo} días`;

          return f.href ? (
            <Link
              key={f.label}
              href={f.href}
              title={titulo}
              className="block rounded-lg py-1 transition-colors hover:bg-white/5"
            >
              {contenido}
            </Link>
          ) : (
            <div key={f.label} title={titulo} className="rounded-lg py-1">
              {contenido}
            </div>
          );
        })}
      </div>

      {/* eje */}
      <div className="mt-2 grid grid-cols-[7rem_1fr] gap-3">
        <span />
        <div className="flex items-center px-10 text-[10px] uppercase tracking-wide text-white/30">
          <div className="text-left" style={{ width: `${izqPct}%` }}>◀ vencido</div>
          <div className="mx-[1px] w-px shrink-0" />
          <div className="text-right" style={{ width: `${derPct}%` }}>próximo ▶</div>
        </div>
      </div>
    </div>
  );
}
