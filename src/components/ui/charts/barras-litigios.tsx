"use client";

import Link from "next/link";

export interface FilaMateria {
  label: string;
  conSeguimiento: number;
  sinSeguimiento: number;
  href?: string;
}

/**
 * Barra horizontal apilada por materia: una sola marca comunica a la vez el
 * volumen (largo total) y la salud del seguimiento (reparto del relleno).
 */
export function BarrasLitigios({ filas }: { filas: FilaMateria[] }) {
  const orden = [...filas].sort(
    (a, b) => b.conSeguimiento + b.sinSeguimiento - (a.conSeguimiento + a.sinSeguimiento)
  );
  const max = Math.max(...orden.map((f) => f.conSeguimiento + f.sinSeguimiento), 1);

  return (
    <div className="viz">
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-white/60">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-ok)" }} />
          Con descripción registrada
        </span>
        <span className="flex items-center gap-1.5 text-white/60">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-neutral)" }} />
          Sin seguimiento
        </span>
      </div>

      <div className="space-y-2">
        {orden.map((f) => {
          const total = f.conSeguimiento + f.sinSeguimiento;
          const pctSin = total > 0 ? Math.round((f.sinSeguimiento / total) * 100) : 0;
          const contenido = (
            <div className="grid grid-cols-[9.5rem_1fr_2.5rem] items-center gap-3">
              <span className="truncate text-xs font-medium text-white/70">{f.label}</span>
              <div className="flex h-5 items-center" style={{ width: `${(total / max) * 100}%` }}>
                {f.conSeguimiento > 0 && (
                  <div
                    className="h-full"
                    style={{
                      width: `${(f.conSeguimiento / total) * 100}%`,
                      background: "var(--viz-ok)",
                      borderRadius: f.sinSeguimiento > 0 ? "4px 0 0 4px" : "4px",
                    }}
                  />
                )}
                {/* separación de 2px entre rellenos apilados */}
                {f.conSeguimiento > 0 && f.sinSeguimiento > 0 && <div className="h-full w-[2px] shrink-0" />}
                {f.sinSeguimiento > 0 && (
                  <div
                    className="h-full"
                    style={{
                      width: `${(f.sinSeguimiento / total) * 100}%`,
                      background: "var(--viz-neutral)",
                      borderRadius: f.conSeguimiento > 0 ? "0 4px 4px 0" : "4px",
                    }}
                  />
                )}
              </div>
              <span className="text-right text-xs font-semibold tabular-nums text-white/85">{total}</span>
            </div>
          );

          const titulo = `${f.label}: ${total} expedientes · ${f.sinSeguimiento} sin seguimiento (${pctSin}%)`;

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
    </div>
  );
}
