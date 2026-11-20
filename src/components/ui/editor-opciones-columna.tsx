"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  crearOpcionColumna,
  eliminarOpcionColumna,
  ordenarOpcionesColumna,
  renombrarOpcionColumna,
  unirOpcionColumna,
} from "@/lib/actions/opciones-columna";
import { catalogoDeTabla, notificarCambioOpcionesColumna } from "@/components/ui/opciones-columna-cliente";
import type { OpcionColumna } from "@/lib/opciones-columna";
import type { OpcionPill } from "@/components/ui/property-pill";
import { ListaOpcionesEditable } from "@/components/ui/lista-opciones-editable";

type Fila = { valor: string; etiqueta: string; claseColor: string };

/**
 * Editor del catálogo de una columna nativa de texto libre (`opciones_columna`),
 * embebido en el panel "Editar propiedad". Mientras la tabla no tenga filas
 * para esa columna se muestran las opciones del código; la primera edición las
 * siembra y desde ahí se renombran o quitan como cualquier otra.
 */
export function EditorOpcionesColumna({
  tabla,
  campo,
  base,
}: {
  tabla: string;
  campo: string;
  base: OpcionPill[];
}) {
  const router = useRouter();
  const [catalogo, setCatalogo] = useState<OpcionColumna[] | null>(null);
  const [borrador, setBorrador] = useState("");
  const [union, setUnion] = useState<{ origen: Fila; destino: Fila } | null>(null);
  const [error, setError] = useState("");
  const [procesando, iniciar] = useTransition();

  const baseServidor = useMemo(
    () => base.map((opcion) => ({ valor: opcion.value, etiqueta: opcion.label })),
    [base]
  );

  const recargar = useCallback(() => {
    notificarCambioOpcionesColumna(tabla);
    void catalogoDeTabla(tabla).then((porCampo) => setCatalogo(porCampo[campo] ?? []));
  }, [campo, tabla]);

  useEffect(() => {
    let cancelado = false;
    void catalogoDeTabla(tabla).then((porCampo) => {
      if (!cancelado) setCatalogo(porCampo[campo] ?? []);
    });
    return () => { cancelado = true; };
  }, [campo, tabla]);

  const filas: Fila[] = useMemo(() => {
    if (catalogo && catalogo.length > 0) {
      return catalogo.map((opcion) => ({ valor: opcion.valor, etiqueta: opcion.etiqueta, claseColor: opcion.claseColor }));
    }
    return base.map((opcion) => ({ valor: opcion.value, etiqueta: opcion.label, claseColor: opcion.className }));
  }, [base, catalogo]);

  function ejecutar(accion: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError("");
    iniciar(async () => {
      const resultado = await accion();
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      recargar();
      router.refresh();
    });
  }

  function agregar() {
    const limpio = borrador.trim().replace(/\s+/g, " ");
    setBorrador("");
    if (!limpio) return;
    if (filas.some((fila) => fila.etiqueta.toLocaleLowerCase("es-PE") === limpio.toLocaleLowerCase("es-PE"))) return;
    ejecutar(() => crearOpcionColumna(tabla, campo, limpio, baseServidor));
  }

  function renombrar(fila: Fila, texto: string) {
    const limpio = texto.trim().replace(/\s+/g, " ");
    if (!limpio || limpio === fila.etiqueta) return;
    // Renombrar sobre una opción que ya existe (los "VIGENTE"/"Vigente" de la
    // migración) es unir, no renombrar: se pregunta antes de mover registros.
    const choque = filas.find(
      (item) => item.valor !== fila.valor && item.etiqueta.toLocaleLowerCase("es-PE") === limpio.toLocaleLowerCase("es-PE")
    );
    if (choque) { setUnion({ origen: fila, destino: choque }); return; }
    ejecutar(() => renombrarOpcionColumna(tabla, campo, fila.valor, limpio, baseServidor));
  }

  function cancelarUnion() {
    setUnion(null);
  }

  return (
    <div className="space-y-2">
      <ListaOpcionesEditable
        filas={filas.map((fila) => ({ id: fila.valor, etiqueta: fila.etiqueta, claseColor: fila.claseColor }))}
        procesando={procesando}
        avisoEliminar="Los registros que la usan la conservarán fuera de la lista. ¿Eliminar?"
        onRenombrar={(fila, texto) => {
          const origen = filas.find((item) => item.valor === fila.id);
          if (origen) renombrar(origen, texto);
        }}
        onEliminar={(fila) => ejecutar(() => eliminarOpcionColumna(tabla, campo, fila.id, baseServidor))}
        onOrdenar={(ids) => ejecutar(() => ordenarOpcionesColumna(tabla, campo, ids, baseServidor))}
      />

      {union && (
        <div className="flex items-center gap-1 rounded-lg border border-amber-400/20 bg-amber-500/[0.07] px-2 py-1.5 text-[9px] text-amber-200/90">
          <span className="min-w-0 flex-1 truncate">¿Unir «{union.origen.etiqueta}» con «{union.destino.etiqueta}»?</span>
          <button
            type="button"
            disabled={procesando}
            onClick={() => {
              const objetivo = union;
              setUnion(null);
              ejecutar(() => unirOpcionColumna(tabla, campo, objetivo.origen.valor, objetivo.destino.valor, baseServidor));
            }}
            className="shrink-0 rounded px-1.5 py-0.5 font-medium text-amber-100 transition-colors hover:bg-amber-400/15 disabled:opacity-40"
          >
            Unir
          </button>
          <button
            type="button"
            onClick={cancelarUnion}
            className="shrink-0 rounded px-1.5 py-0.5 text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            No
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <input
          value={borrador}
          disabled={procesando}
          onChange={(evento) => setBorrador(evento.target.value)}
          onKeyDown={(evento) => { if (evento.key === "Enter") { evento.preventDefault(); agregar(); } }}
          onBlur={agregar}
          placeholder="Añadir opción…"
          className="view-control"
        />
        {procesando && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/45" />}
      </div>

      {error && <p className="text-[9px] leading-4 text-red-300">{error}</p>}
    </div>
  );
}
