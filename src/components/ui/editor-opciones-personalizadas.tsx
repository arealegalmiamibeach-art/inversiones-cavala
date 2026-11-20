"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ListaOpcionesEditable } from "@/components/ui/lista-opciones-editable";
import { colorOpcion } from "@/lib/propiedades/personalizadas";
import { cn } from "@/lib/utils";

function comparable(texto: string) {
  return texto.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-PE");
}

/**
 * Aviso de que renombrar una opción sobre otra que ya existe es unirlas: los
 * registros pasan a la de destino. Lo comparten este editor y los selectores de
 * la celda; `className` pone el margen y el redondeo de cada sitio.
 */
export function AvisoUnirOpcion({
  origen,
  destino,
  procesando,
  onUnir,
  onCancelar,
  className,
}: {
  origen: string;
  destino: string;
  procesando?: boolean;
  onUnir: () => void;
  onCancelar: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex shrink-0 items-center gap-1 border border-amber-400/20 bg-amber-500/[0.07] text-amber-200/90", className)}>
      <span className="min-w-0 flex-1 leading-4">¿Unir «{origen}» con «{destino}»? Los registros pasan a «{destino}».</span>
      <button
        type="button"
        disabled={procesando}
        onClick={onUnir}
        className="shrink-0 rounded px-1.5 py-0.5 font-medium text-amber-100 outline-none transition-colors hover:bg-amber-400/25 focus-visible:ring-1 focus-visible:ring-amber-300/50 disabled:opacity-40"
      >
        Unir
      </button>
      <button
        type="button"
        onClick={onCancelar}
        className="shrink-0 rounded px-1.5 py-0.5 text-white/60 outline-none transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:ring-1 focus-visible:ring-brand-400/50"
      >
        No
      </button>
    </div>
  );
}

/**
 * Opciones de una propiedad personalizada de Selección o Multiselección dentro
 * del panel "Editar propiedad": la lista al estilo Notion (asa, etiqueta de
 * color y "···" para renombrar o eliminar) y, debajo, el campo para añadir.
 *
 * Con `onUnir`, renombrar una opción con el nombre de otra pregunta si se
 * unen (como en las columnas nativas); sin él, el servidor lo rechaza.
 */
export function EditorOpcionesPersonalizadas({
  opciones,
  procesando,
  onAgregar,
  onQuitar,
  onRenombrar,
  onUnir,
  onOrdenar,
}: {
  opciones: string[];
  procesando?: boolean;
  onAgregar: (opcion: string) => void;
  onQuitar: (opcion: string) => void;
  onRenombrar: (anterior: string, nuevo: string) => void;
  onUnir?: (origen: string, destino: string) => void;
  onOrdenar: (opciones: string[]) => void;
}) {
  const [borrador, setBorrador] = useState("");
  const [union, setUnion] = useState<{ origen: string; destino: string } | null>(null);

  function confirmar() {
    const limpio = borrador.trim().replace(/\s+/g, " ");
    setBorrador("");
    if (!limpio || opciones.some((item) => item.toLocaleLowerCase("es-PE") === limpio.toLocaleLowerCase("es-PE"))) return;
    onAgregar(limpio);
  }

  function renombrar(anterior: string, texto: string) {
    // Renombrar sobre una opción que ya existe es unir, no renombrar: se pregunta antes de mover registros.
    const choque = onUnir ? opciones.find((item) => item !== anterior && comparable(item) === comparable(texto)) : undefined;
    if (choque) {
      setUnion({ origen: anterior, destino: choque });
      return;
    }
    onRenombrar(anterior, texto);
  }

  return (
    <div className="space-y-2">
      <ListaOpcionesEditable
        filas={opciones.map((opcion) => ({ id: opcion, etiqueta: opcion, claseColor: colorOpcion(opcion, "oscuro") }))}
        procesando={procesando}
        avisoEliminar="Los registros que la usan la conservarán fuera de la lista. ¿Eliminar?"
        onRenombrar={(fila, texto) => renombrar(fila.id, texto)}
        onEliminar={(fila) => onQuitar(fila.id)}
        onOrdenar={onOrdenar}
      />

      {union && onUnir && (
        <AvisoUnirOpcion
          origen={union.origen}
          destino={union.destino}
          procesando={procesando}
          className="rounded-lg px-2 py-1.5 text-[10px]"
          onUnir={() => {
            const objetivo = union;
            setUnion(null);
            onUnir(objetivo.origen, objetivo.destino);
          }}
          onCancelar={() => setUnion(null)}
        />
      )}

      <div className="flex items-center gap-1.5">
        <input
          value={borrador}
          disabled={procesando}
          onChange={(evento) => setBorrador(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") {
              evento.preventDefault();
              confirmar();
            }
          }}
          onBlur={confirmar}
          maxLength={80}
          placeholder="Añadir opción…"
          className="view-control"
        />
        {procesando && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/45" />}
      </div>
    </div>
  );
}
