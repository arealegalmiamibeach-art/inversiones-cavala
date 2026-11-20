"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";

/**
 * Edición de una opción en su propia fila (como Notion): el nombre pasa a ser
 * un campo y aparece el tacho. Enter o salir del campo guarda; Escape descarta.
 *
 * `confirmarEliminar` es el aviso que se muestra antes de borrar (p. ej. "3
 * procesos lo usan…"); sin él, el tacho elimina al instante.
 */
export function EdicionOpcion({
  valor,
  confirmarEliminar,
  procesando,
  onGuardar,
  onEliminar,
  onCerrar,
}: {
  valor: string;
  confirmarEliminar?: string;
  procesando?: boolean;
  onGuardar: (nuevo: string) => void;
  onEliminar: () => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(valor);
  const [confirmando, setConfirmando] = useState(false);
  const descartado = useRef(false);

  if (confirmando) {
    return (
      <div
        className="flex min-w-0 flex-1 items-center gap-1.5 pl-1"
        onClick={(evento) => evento.stopPropagation()}
      >
        <span className="min-w-0 flex-1 text-[10px] leading-4 text-red-200">{confirmarEliminar}</span>
        <button
          type="button"
          disabled={procesando}
          onClick={onEliminar}
          className="shrink-0 rounded-md bg-red-500/25 px-2 py-1 text-[10px] font-medium text-red-100 transition-colors hover:bg-red-500/40 disabled:opacity-40"
        >
          Eliminar
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="shrink-0 rounded-md bg-white/[0.08] px-2 py-1 text-[10px] text-white/70 transition-colors hover:bg-white/[0.16] hover:text-white"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1"
      onClick={(evento) => evento.stopPropagation()}
      onBlur={(evento) => {
        if (evento.currentTarget.contains(evento.relatedTarget as Node | null)) return;
        if (descartado.current) descartado.current = false;
        else if (nombre.trim()) onGuardar(nombre);
        onCerrar();
      }}
    >
      <input
        autoFocus
        onFocus={(evento) => evento.currentTarget.select()}
        value={nombre}
        maxLength={80}
        aria-label="Nombre de la opción"
        onChange={(evento) => setNombre(evento.target.value)}
        onKeyDown={(evento) => {
          evento.stopPropagation();
          if (evento.key === "Enter") {
            evento.preventDefault();
            evento.currentTarget.blur();
          } else if (evento.key === "Escape") {
            evento.preventDefault();
            descartado.current = true;
            evento.currentTarget.blur();
          }
        }}
        className="view-control min-w-0 flex-1 !py-1 text-[11px]"
      />
      <button
        type="button"
        disabled={procesando}
        // Evita que el campo pierda el foco (y se cierre) antes de registrar el clic.
        onMouseDown={(evento) => evento.preventDefault()}
        onClick={() => (confirmarEliminar ? setConfirmando(true) : onEliminar())}
        aria-label={`Eliminar ${valor}`}
        title="Eliminar"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-red-300/70 transition-colors hover:bg-red-500/15 hover:text-red-200 disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
