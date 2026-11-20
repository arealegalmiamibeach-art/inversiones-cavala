"use client";

import { useState, useTransition } from "react";
import { Bell, CalendarDays, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { OPCIONES_TIPO_FECHA, type ConfigFecha, type TipoFecha } from "@/lib/fechas-config";
import { guardarConfigFecha } from "./actions";

export type FilaFecha = {
  fuente: string;
  label: string;
  detalle?: string;
  config: ConfigFecha;
  aceptaVigencia: boolean;
};

export type GrupoFechas = {
  titulo: string;
  descripcion?: string;
  filas: FilaFecha[];
  vacio?: string;
};

const ESTILO_TIPO: Record<TipoFecha, { icono: typeof FileText; activo: string }> = {
  dato: { icono: FileText, activo: "border-white/25 bg-white/[0.12] text-white" },
  evento: { icono: CalendarDays, activo: "border-pink-400/40 bg-pink-500/15 text-pink-200" },
  vencimiento: { icono: Bell, activo: "border-amber-400/40 bg-amber-500/15 text-amber-200" },
};

const TIPOS = OPCIONES_TIPO_FECHA.map((opcion) => ({ ...opcion, ...ESTILO_TIPO[opcion.tipo] }));

export function FechasPanel({ grupos }: { grupos: GrupoFechas[] }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-3">
        {TIPOS.map(({ tipo, label, ayuda, icono: Icono, activo }) => (
          <div key={tipo} className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", activo)}>
              <Icono className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white/90">{label}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-white/50">{ayuda}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-5 text-white/40">
        Los avisos cubren lo que vence en los próximos 60 días y lo vencido en los últimos 30. Los cambios se guardan solos y se aplican a todo el equipo.
      </p>

      {grupos.map((grupo) => (
        <section key={grupo.titulo} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <div className="border-b border-white/[0.07] px-4 py-3">
            <h2 className="text-sm font-semibold text-white/90">{grupo.titulo}</h2>
            {grupo.descripcion && <p className="mt-0.5 text-[11px] leading-4 text-white/45">{grupo.descripcion}</p>}
          </div>
          {grupo.filas.length === 0 ? (
            <p className="px-4 py-5 text-xs text-white/40">{grupo.vacio ?? "Nada para configurar."}</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {grupo.filas.map((fila) => (
                <FilaConfig key={fila.fuente} fila={fila} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function FilaConfig({ fila }: { fila: FilaFecha }) {
  const [config, setConfig] = useState<ConfigFecha>(fila.config);
  const [dias, setDias] = useState(fila.config.diasVigencia ? String(fila.config.diasVigencia) : "");
  const [error, setError] = useState("");
  const [pendiente, startTransition] = useTransition();

  function guardar(siguiente: ConfigFecha) {
    const anterior = config;
    setConfig(siguiente);
    setDias(siguiente.diasVigencia ? String(siguiente.diasVigencia) : "");
    setError("");
    startTransition(async () => {
      const resultado = await guardarConfigFecha(fila.fuente, siguiente.tipo, siguiente.diasVigencia);
      if (!resultado.ok) {
        setConfig(anterior);
        setDias(anterior.diasVigencia ? String(anterior.diasVigencia) : "");
        setError(resultado.error);
      }
    });
  }

  function guardarDias() {
    const texto = dias.trim();
    const numero = texto ? Number(texto) : null;
    if (numero === config.diasVigencia) return;
    if (numero !== null && (!Number.isInteger(numero) || numero < 1 || numero > 3650)) {
      setError("Escribe un número de días entre 1 y 3650, o déjalo vacío.");
      return;
    }
    guardar({ tipo: config.tipo, diasVigencia: numero });
  }

  const muestraVigencia = fila.aceptaVigencia && config.tipo === "vencimiento";

  return (
    <li className="flex flex-col gap-2.5 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-white/85">
          <span className="truncate">{fila.label}</span>
          {pendiente && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/40" />}
        </p>
        {fila.detalle && <p className="mt-0.5 text-[11px] text-white/40">{fila.detalle}</p>}
        {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {muestraVigencia && (
          <label className="flex items-center gap-1.5 text-[11px] text-white/50">
            Vence a los
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              onBlur={guardarDias}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder="—"
              aria-label={`Días de vigencia de ${fila.label}`}
              className="h-8 w-16 rounded-lg border border-white/[0.12] bg-white/[0.04] px-2 text-center text-xs text-white outline-none transition-colors hover:border-white/25 focus:border-brand-400/50"
            />
            días de emitido
          </label>
        )}
        <div role="radiogroup" aria-label={`Tipo de fecha de "${fila.label}"`} className="flex rounded-xl border border-white/[0.1] bg-black/20 p-0.5">
          {TIPOS.map(({ tipo, label, ayuda, icono: Icono, activo }) => {
            const seleccionado = config.tipo === tipo;
            return (
              <button
                key={tipo}
                type="button"
                role="radio"
                aria-checked={seleccionado}
                title={ayuda}
                disabled={pendiente}
                onClick={() => {
                  if (seleccionado) return;
                  guardar({ tipo, diasVigencia: tipo === "vencimiento" ? config.diasVigencia : null });
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-wait",
                  seleccionado
                    ? activo
                    : "border-transparent text-white/45 hover:bg-white/[0.08] hover:text-white/85"
                )}
              >
                <Icono className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </li>
  );
}
