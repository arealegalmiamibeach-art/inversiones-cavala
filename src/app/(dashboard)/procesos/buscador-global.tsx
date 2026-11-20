"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { MATERIAS } from "./opciones";
import { normalizarTexto } from "@/lib/procesos/materias";

export type ProcesoBuscable = {
  id: string;
  materia: string;
  expediente: string | null;
  asunto: string | null;
};

const MAX_RESULTADOS = 12;

/** Buscador global del índice: filtra en cliente sobre todos los expedientes. */
export function BuscadorGlobal({ procesos }: { procesos: ProcesoBuscable[] }) {
  const [q, setQ] = useState("");

  const indice = useMemo(
    () => procesos.map((proceso) => ({
      proceso,
      texto: normalizarTexto(`${proceso.expediente ?? ""} ${proceso.asunto ?? ""} ${MATERIAS[proceso.materia] ?? proceso.materia}`),
    })),
    [procesos]
  );

  const consulta = normalizarTexto(q);
  const resultados = useMemo(() => {
    if (consulta.length < 2) return [];
    return indice.filter((entrada) => entrada.texto.includes(consulta)).slice(0, MAX_RESULTADOS).map((entrada) => entrada.proceso);
  }, [consulta, indice]);

  const totalCoincidencias = consulta.length < 2
    ? 0
    : indice.reduce((suma, entrada) => (entrada.texto.includes(consulta) ? suma + 1 : suma), 0);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
      <input
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Buscar expediente o asunto en todas las materias…"
        className="glass-input w-full pl-9 sm:w-96"
      />

      {consulta.length >= 2 && (
        <div className="glass-panel absolute z-20 mt-2 max-h-80 w-full overflow-y-auto p-2 scrollbar-glass sm:w-[32rem]">
          {resultados.length === 0 ? (
            <p className="px-2 py-3 text-xs text-white/55">Sin coincidencias para «{q.trim()}».</p>
          ) : (
            <>
              {resultados.map((proceso) => (
                <Link
                  key={proceso.id}
                  href={`/procesos/${proceso.id}`}
                  className="glass-row block rounded-lg px-3 py-2"
                >
                  <span className="block font-mono text-xs font-semibold text-white/95">
                    {proceso.expediente ?? "Sin expediente"}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-white/60">
                    {MATERIAS[proceso.materia] ?? proceso.materia} · {proceso.asunto ?? "Sin asunto"}
                  </span>
                </Link>
              ))}
              {totalCoincidencias > resultados.length && (
                <p className="px-3 py-2 text-[11px] text-white/45">
                  y {totalCoincidencias - resultados.length} más — abre «Ver todos los procesos» para filtrarlos en la tabla.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
