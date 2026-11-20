"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { History, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  agruparPorDia,
  cargarHistorial,
  describirEntrada,
  diffTexto,
  esValorLargo,
  formatearValor,
  inicialActor,
  nombreActor,
  tiempoRelativo,
  textoUltimaEdicion,
  type EntradaHistorial,
} from "@/lib/historial";
import { cn } from "@/lib/utils";

interface HistorialPanelProps {
  tabla: string;
  registroId: string;
  /** Etiqueta del registro, para el encabezado del panel. */
  titulo?: string;
}

export function HistorialPanel({ tabla, registroId, titulo }: HistorialPanelProps) {
  const [montado, setMontado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [entradas, setEntradas] = useState<EntradaHistorial[]>([]);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMontado(true), []);

  const cargar = useCallback(async () => {
    setCargando(true);
    const datos = await cargarHistorial(createClient(), tabla, registroId);
    setEntradas(datos);
    setCargando(false);
  }, [tabla, registroId]);

  // Carga inicial ligera para poder mostrar "Editado hace…" en el botón.
  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Al abrir, revalida y bloquea el scroll del fondo.
  useEffect(() => {
    if (!abierto) return;
    void cargar();
    cerrarRef.current?.focus();
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previo;
      document.removeEventListener("keydown", onEscape);
    };
  }, [abierto, cargar]);

  const grupos = useMemo(() => agruparPorDia(entradas), [entradas]);
  const etiquetaBoton = textoUltimaEdicion(entradas) || "Historial";

  const panel = (
    <div data-entity-sheet-portal className="fixed inset-0 z-[90]">
      <button
        type="button"
        aria-label="Cerrar historial"
        onClick={() => setAbierto(false)}
        className="absolute inset-0 h-full w-full cursor-default bg-black/50 backdrop-blur-[2px] animate-fade-in"
      />
      <aside
        role="dialog"
        aria-label="Historial de cambios"
        className="absolute right-0 top-0 flex h-full w-[min(27rem,100vw)] flex-col border-l border-white/10 bg-[#0d0f16] shadow-glass-lg animate-slide-in-right"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Historial de cambios</p>
            {titulo && <p className="mt-0.5 truncate text-[11px] text-white/40">{titulo}</p>}
          </div>
          <button
            ref={cerrarRef}
            type="button"
            onClick={() => setAbierto(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-glass min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {cargando ? (
            <ul className="space-y-4">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex gap-3">
                  <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-white/5" />
                  <div className="flex-1 space-y-1.5 pt-1">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
                    <div className="h-2.5 w-1/3 animate-pulse rounded bg-white/5" />
                  </div>
                </li>
              ))}
            </ul>
          ) : entradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <History className="h-7 w-7 text-white/15" />
              <p className="text-xs text-white/45">Sin cambios registrados</p>
              <p className="text-[11px] leading-relaxed text-white/25">
                A partir de ahora, cada edición de un campo, nota o archivo queda anotada aquí con
                autor y fecha.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {grupos.map((grupo) => (
                <section key={grupo.dia}>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                    {grupo.dia}
                  </h3>
                  <ul className="space-y-3">
                    {grupo.entradas.map((entrada) => (
                      <EntradaFila key={entrada.id} entrada={entrada} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Ver historial de cambios"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
      >
        <History className="h-3.5 w-3.5" />
        {etiquetaBoton}
      </button>
      {abierto && montado && createPortal(panel, document.body)}
    </>
  );
}

function EntradaFila({ entrada }: { entrada: EntradaHistorial }) {
  const { accion, muestraDiff } = describirEntrada(entrada);
  // En un "editar" (mover un archivo de carpeta) el nombre ya sale dentro del
  // diff antes/ahora, así que la píldora sólo repetiría lo mismo.
  const nombreAdjunto =
    entrada.accion !== "editar" &&
    (entrada.campo === "archivo" || entrada.campo === "adenda" || entrada.campo === "vinculo" || entrada.campo === "vencimiento")
      ? entrada.valorNuevo ?? entrada.valorAnterior
      : null;

  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-[10px] font-bold text-white">
        {inicialActor(entrada)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-white/75">
          <span className="font-semibold text-white/95">{nombreActor(entrada)}</span> {accion}
        </p>
        <p className="mt-0.5 text-[11px] tabular-nums text-white/30" title={new Date(entrada.creadoEn).toLocaleString("es-PE")}>
          {tiempoRelativo(entrada.creadoEn)}
        </p>

        {nombreAdjunto && (
          <p className="mt-1.5 truncate rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/60">
            {nombreAdjunto}
          </p>
        )}

        {muestraDiff && <DiffCambio entrada={entrada} />}
      </div>
    </li>
  );
}

function DiffCambio({ entrada }: { entrada: EntradaHistorial }) {
  const { valorAnterior: antes, valorNuevo: ahora } = entrada;
  const usarRecorte = esValorLargo(antes) || esValorLargo(ahora);

  if (usarRecorte) {
    const d = diffTexto(antes, ahora);
    return (
      <div className="mt-1.5 overflow-hidden rounded-md border border-white/10 bg-white/[0.03] p-2 text-[11px] leading-relaxed">
        <p className="whitespace-pre-wrap break-words text-white/70">
          {d.recortadoInicio && <span className="select-none text-white/25">… </span>}
          <span className="text-white/45">{d.prefijo}</span>
          {d.eliminado && (
            <span className="rounded-sm bg-red-500/15 text-red-300/80 line-through decoration-red-300/40">
              {d.eliminado}
            </span>
          )}
          {d.agregado && (
            <span className="rounded-sm bg-emerald-500/15 text-emerald-200">{d.agregado}</span>
          )}
          <span className="text-white/45">{d.sufijo}</span>
          {d.recortadoFin && <span className="select-none text-white/25"> …</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-1.5 space-y-1 rounded-md border border-white/10 bg-white/[0.03] p-2 text-[11px] leading-relaxed">
      <ValorLinea etiqueta="antes" valor={antes} tachado />
      <ValorLinea etiqueta="ahora" valor={ahora} />
    </div>
  );
}

function ValorLinea({
  etiqueta,
  valor,
  tachado,
}: {
  etiqueta: string;
  valor: string | null;
  tachado?: boolean;
}) {
  const texto = formatearValor(valor);
  return (
    <div className="flex gap-2">
      <span className="shrink-0 select-none text-white/25">{etiqueta}</span>
      <span
        className={cn(
          "whitespace-pre-wrap break-words",
          tachado ? "text-white/35 line-through decoration-white/20" : "text-white/80"
        )}
      >
        {texto}
      </span>
    </div>
  );
}
