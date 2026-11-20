"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  crearTipoPropietario,
  eliminarTipoPropietario,
  ordenarTiposPropietario,
  renombrarTipoPropietario,
} from "@/lib/actions/tipos-propietario";
import { ListaOpcionesEditable } from "@/components/ui/lista-opciones-editable";
import {
  CLASE_TIPO_PERSONALIZADO,
  ES_PROPIO_OPCIONES,
  esNombreTipoFijo,
  type TipoPropietarioCatalogo,
} from "@/lib/propietarios/tipos-catalogo";
import { cn } from "@/lib/utils";

type Resultado = { ok: true } | { ok: false; error: string };

function avisoEliminar(usos: number): string | undefined {
  if (usos <= 0) return undefined;
  return `${usos === 1 ? "1 propietario lo usa" : `${usos} propietarios lo usan`} y lo conservarán fuera de la lista. ¿Eliminar?`;
}

/**
 * Editor de los tipos de la columna "Tipo" de Propietarios, embebido en el panel
 * "Editar propiedad". Propio y Tercero son fijos (viven en `es_propio`); los
 * demás salen de `tipos_propietario` y se añaden, renombran (el cambio llega a
 * los propietarios que los usan), reordenan y eliminan como cualquier otra
 * Selección. Eliminar no toca a los propietarios: conservan el texto y el
 * desplegable lo marca como fuera de la lista.
 */
export function EditorTiposPropietario({ tipos }: { tipos: TipoPropietarioCatalogo[] }) {
  const router = useRouter();
  const [borrador, setBorrador] = useState("");
  const [error, setError] = useState("");
  const [procesando, iniciar] = useTransition();

  function ejecutar(accion: () => Promise<Resultado>) {
    setError("");
    iniciar(async () => {
      const resultado = await accion();
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
    });
  }

  function agregar() {
    const limpio = borrador.trim().replace(/\s+/g, " ");
    setBorrador("");
    if (!limpio) return;
    if (esNombreTipoFijo(limpio)) {
      setError("«Propio» y «Tercero» ya existen como tipos fijos");
      return;
    }
    if (tipos.some((tipo) => tipo.nombre.toLocaleLowerCase("es-PE") === limpio.toLocaleLowerCase("es-PE"))) return;
    ejecutar(async () => {
      const creado = await crearTipoPropietario(limpio);
      return creado.ok ? { ok: true } : creado;
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 px-1">
        {ES_PROPIO_OPCIONES.map((opcion) => (
          <span key={opcion.value} className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium", opcion.className)}>
            {opcion.label}
          </span>
        ))}
        <span className="text-[9px] uppercase tracking-wide text-white/30">Fijos</span>
      </div>

      <ListaOpcionesEditable
        filas={tipos.map((tipo) => ({
          id: tipo.id,
          etiqueta: tipo.nombre,
          claseColor: CLASE_TIPO_PERSONALIZADO,
          avisoEliminar: avisoEliminar(tipo.usos),
        }))}
        procesando={procesando}
        vacio="Sin tipos personalizados todavía."
        onRenombrar={(fila, texto) => {
          const limpio = texto.trim().replace(/\s+/g, " ");
          if (!limpio || limpio === fila.etiqueta) return;
          ejecutar(() => renombrarTipoPropietario(fila.id, limpio));
        }}
        onEliminar={(fila) => ejecutar(() => eliminarTipoPropietario(fila.id))}
        onOrdenar={(ids) => ejecutar(() => ordenarTiposPropietario(ids))}
      />

      <div className="flex items-center gap-1.5">
        <input
          value={borrador}
          disabled={procesando}
          onChange={(evento) => setBorrador(evento.target.value)}
          onKeyDown={(evento) => { if (evento.key === "Enter") { evento.preventDefault(); agregar(); } }}
          onBlur={agregar}
          maxLength={80}
          placeholder="Añadir tipo…"
          className="view-control"
        />
        {procesando && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/45" />}
      </div>

      {error && <p className="text-[9px] leading-4 text-red-300">{error}</p>}
    </div>
  );
}
