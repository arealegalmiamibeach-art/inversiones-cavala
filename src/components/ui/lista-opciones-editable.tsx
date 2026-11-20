"use client";

import { useEffect, useState } from "react";
import { GripVertical, MoreHorizontal } from "lucide-react";
import { EdicionOpcion } from "@/components/ui/edicion-opcion";
import { cn } from "@/lib/utils";

/** `avisoEliminar` de la fila (p. ej. cuántos registros la usan) manda sobre el general de la lista. */
export type FilaOpcion = { id: string; etiqueta: string; claseColor: string; avisoEliminar?: string };

type Linea = { id: string; despues: boolean };

/**
 * Lista de opciones de una propiedad de Selección o Multiselección, como el
 * menú de opciones de Notion: asa para reordenar, la opción como etiqueta de
 * color y un "···" al pasar el cursor que la deja editable en su propia fila
 * (nombre + tacho).
 *
 * `avisoEliminar`: si se da, eliminar pide confirmación con ese texto.
 */
export function ListaOpcionesEditable({
  filas,
  procesando,
  avisoEliminar,
  vacio = "Sin opciones todavía.",
  onRenombrar,
  onEliminar,
  onOrdenar,
}: {
  filas: FilaOpcion[];
  procesando?: boolean;
  avisoEliminar?: string;
  vacio?: string;
  onRenombrar: (fila: FilaOpcion, texto: string) => void;
  onEliminar: (fila: FilaOpcion) => void;
  onOrdenar?: (ids: string[]) => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [linea, setLinea] = useState<Linea | null>(null);
  // El orden nuevo se ve al instante; al llegar la lista del servidor deja de hacer falta.
  const [orden, setOrden] = useState<string[] | null>(null);

  const firma = filas.map((fila) => `${fila.id}|${fila.etiqueta}`).join("\n");
  useEffect(() => setOrden(null), [firma]);

  const visibles = orden
    ? [...filas].sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id))
    : filas;

  function soltar(destinoId: string, despues: boolean) {
    const origenId = arrastrando;
    setArrastrando(null);
    setLinea(null);
    if (!origenId || origenId === destinoId || !onOrdenar) return;
    const actuales = visibles.map((fila) => fila.id);
    const ids = actuales.filter((id) => id !== origenId);
    const posicion = ids.indexOf(destinoId);
    ids.splice(despues ? posicion + 1 : posicion, 0, origenId);
    if (ids.every((id, indice) => id === actuales[indice])) return;
    setOrden(ids);
    onOrdenar(ids);
  }

  if (filas.length === 0) return <p className="px-1 py-1 text-[9px] text-white/40">{vacio}</p>;

  return (
    <div className="scrollbar-glass max-h-64 space-y-0.5 overflow-y-auto pr-1">
      {visibles.map((fila) => {
        const enEdicion = editando === fila.id;
        return (
          <div
            key={fila.id}
            draggable={Boolean(onOrdenar) && !enEdicion && !procesando}
            onDragStart={(evento) => {
              evento.dataTransfer.effectAllowed = "move";
              evento.dataTransfer.setData("text/plain", fila.id);
              setEditando(null);
              setArrastrando(fila.id);
            }}
            onDragEnd={() => {
              setArrastrando(null);
              setLinea(null);
            }}
            onDragOver={(evento) => {
              if (!arrastrando) return;
              evento.preventDefault();
              const caja = evento.currentTarget.getBoundingClientRect();
              const despues = evento.clientY > caja.top + caja.height / 2;
              setLinea((actual) => (actual !== null && actual.id === fila.id && actual.despues === despues ? actual : { id: fila.id, despues }));
            }}
            onDrop={(evento) => {
              evento.preventDefault();
              soltar(fila.id, linea !== null && linea.id === fila.id ? linea.despues : false);
            }}
            onClick={() => {
              if (!enEdicion && !procesando) setEditando(fila.id);
            }}
            className={cn(
              "group flex items-center gap-1 rounded-md py-0.5 pl-0.5 pr-1 transition-colors hover:bg-white/[0.07]",
              enEdicion ? "bg-white/[0.07]" : "cursor-pointer",
              arrastrando === fila.id && "opacity-40",
              arrastrando && arrastrando !== fila.id && linea !== null && linea.id === fila.id &&
                (linea.despues ? "shadow-[inset_0_-2px_0_0_rgb(96,165,250)]" : "shadow-[inset_0_2px_0_0_rgb(96,165,250)]")
            )}
          >
            {onOrdenar && (
              <GripVertical
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 cursor-grab text-white/25 transition-colors group-hover:text-white/60"
              />
            )}
            {enEdicion ? (
              <EdicionOpcion
                valor={fila.etiqueta}
                procesando={procesando}
                confirmarEliminar={fila.avisoEliminar ?? avisoEliminar}
                onGuardar={(texto) => onRenombrar(fila, texto)}
                onEliminar={() => {
                  setEditando(null);
                  onEliminar(fila);
                }}
                onCerrar={() => setEditando((actual) => (actual === fila.id ? null : actual))}
              />
            ) : (
              <>
                <span
                  title={fila.etiqueta}
                  className={cn("inline-flex min-w-0 max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-medium", fila.claseColor)}
                >
                  <span className="truncate">{fila.etiqueta}</span>
                </span>
                <span className="flex-1" />
                <MoreHorizontal
                  aria-hidden
                  className="mr-1 h-3.5 w-3.5 shrink-0 text-white/30 opacity-0 transition-opacity group-hover:opacity-100"
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
