"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  cargarOpcionesColumna,
  catalogoColumna,
  combinarOpcionesColumna,
  type OpcionColumna,
} from "@/lib/opciones-columna";
import { resolverEtiqueta } from "@/lib/registros/etiquetas-columna";
import type { OpcionPill } from "@/components/ui/property-pill";

export const EVENTO_CAMBIO_OPCIONES_COLUMNA = "cavala:opciones-columna";

/**
 * Una sola consulta por tabla y por pestaña: en una vista hay decenas de
 * pastillas de la misma columna y todas comparten el catálogo.
 */
const enVuelo = new Map<string, Promise<Record<string, OpcionColumna[]>>>();

export function catalogoDeTabla(tabla: string): Promise<Record<string, OpcionColumna[]>> {
  const cacheado = enVuelo.get(tabla);
  if (cacheado) return cacheado;
  const promesa = cargarOpcionesColumna(createClient(), tabla);
  enVuelo.set(tabla, promesa);
  return promesa;
}

/** Vacía la caché y avisa a las pastillas montadas de que recarguen. */
export function notificarCambioOpcionesColumna(tabla: string) {
  enVuelo.delete(tabla);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO_OPCIONES_COLUMNA, { detail: tabla }));
  }
}

/**
 * Opciones efectivas de una columna nativa: las del código hasta que alguien
 * edita el catálogo, y desde entonces las de la tabla `opciones_columna`.
 * Las columnas que no están en `CATALOGOS_COLUMNA` no consultan nada.
 */
export function useOpcionesColumna(tabla: string, campo: string, base: OpcionPill[]): OpcionPill[] {
  const [catalogo, setCatalogo] = useState<OpcionColumna[] | undefined>(undefined);
  const editable = Boolean(catalogoColumna(tabla, campo));

  useEffect(() => {
    if (!editable) return;
    let cancelado = false;
    function cargar() {
      void catalogoDeTabla(tabla).then((porCampo) => {
        if (!cancelado) setCatalogo(porCampo[campo] ?? []);
      });
    }
    cargar();
    function alCambiar(evento: Event) {
      if ((evento as CustomEvent<string>).detail === tabla) cargar();
    }
    window.addEventListener(EVENTO_CAMBIO_OPCIONES_COLUMNA, alCambiar);
    return () => {
      cancelado = true;
      window.removeEventListener(EVENTO_CAMBIO_OPCIONES_COLUMNA, alCambiar);
    };
  }, [campo, editable, tabla]);

  return useMemo(() => combinarOpcionesColumna(base, catalogo), [base, catalogo]);
}

type ColumnaConCatalogo = {
  id: string;
  catalogoOpciones?: { tabla: string; campo: string; base: OpcionPill[] };
};

/**
 * Etiqueta vigente del valor guardado de cada columna con catálogo editable,
 * para las pantallas que MUESTRAN valores sin ser una pastilla (casillas y
 * chips del filtro, encabezados de grupo). Un solo hook para todas las
 * columnas de la tabla: comparte la consulta por tabla con las pastillas y se
 * actualiza cuando alguien edita las opciones. El valor guardado sigue siendo
 * lo que se filtra, ordena y agrupa; sólo cambia lo que se lee.
 *
 * Las columnas sin catálogo devuelven el valor tal cual.
 */
export function useEtiquetasColumnas(columnas: ColumnaConCatalogo[]): (columnaId: string, crudo: string) => string {
  const definiciones = columnas.filter(
    (columna): columna is ColumnaConCatalogo & { catalogoOpciones: NonNullable<ColumnaConCatalogo["catalogoOpciones"]> } =>
      Boolean(columna.catalogoOpciones && catalogoColumna(columna.catalogoOpciones.tabla, columna.catalogoOpciones.campo))
  );
  const definicionesRef = useRef(definiciones);
  definicionesRef.current = definiciones;

  const firmaTablas = Array.from(new Set(definiciones.map((columna) => columna.catalogoOpciones.tabla))).sort().join("|");
  // Las listas base llegan como constantes o se rehacen en cada render: la firma evita recalcular sin cambios reales.
  const firmaBases = definiciones
    .map((columna) => {
      const { tabla, campo, base } = columna.catalogoOpciones;
      return `${columna.id}:${tabla}.${campo}:${base.map((opcion) => `${opcion.value}=${opcion.label}`).join(",")}`;
    })
    .join("|");

  const [catalogos, setCatalogos] = useState<Record<string, Record<string, OpcionColumna[]>>>({});

  useEffect(() => {
    const tablas = firmaTablas ? firmaTablas.split("|") : [];
    if (tablas.length === 0) return;
    let cancelado = false;
    function cargar(soloTabla?: string) {
      for (const tabla of tablas) {
        if (soloTabla && tabla !== soloTabla) continue;
        void catalogoDeTabla(tabla).then((porCampo) => {
          if (!cancelado) setCatalogos((actual) => ({ ...actual, [tabla]: porCampo }));
        });
      }
    }
    cargar();
    function alCambiar(evento: Event) {
      cargar((evento as CustomEvent<string>).detail);
    }
    window.addEventListener(EVENTO_CAMBIO_OPCIONES_COLUMNA, alCambiar);
    return () => {
      cancelado = true;
      window.removeEventListener(EVENTO_CAMBIO_OPCIONES_COLUMNA, alCambiar);
    };
  }, [firmaTablas]);

  return useMemo(() => {
    const resolvedores = new Map<string, (crudo: string) => string>();
    for (const columna of definicionesRef.current) {
      const { tabla, campo, base } = columna.catalogoOpciones;
      const vigentes = combinarOpcionesColumna(base, catalogos[tabla]?.[campo]);
      resolvedores.set(columna.id, resolverEtiqueta(base, vigentes));
    }
    return (columnaId: string, crudo: string) => resolvedores.get(columnaId)?.(crudo) ?? crudo;
    // `firmaBases` cubre los cambios de `definicionesRef` que importan aquí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogos, firmaBases]);
}
