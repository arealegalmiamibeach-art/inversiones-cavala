"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Orden y visibilidad de los bloques del panel lateral, por navegador — igual
// que la vista de columnas de las tablas (`records-view:*`).
type Guardado = { orden: string[]; ocultos: string[] };

const EVENTO = "cavala:orden-local";
const VACIO: Guardado = { orden: [], ocultos: [] };

function leer(clave: string): Guardado {
  try {
    const crudo = JSON.parse(localStorage.getItem(`cavala:orden:${clave}`) ?? "null") as Partial<Guardado> | null;
    return {
      orden: Array.isArray(crudo?.orden) ? crudo.orden.filter((id) => typeof id === "string") : [],
      ocultos: Array.isArray(crudo?.ocultos) ? crudo.ocultos.filter((id) => typeof id === "string") : [],
    };
  } catch {
    return VACIO;
  }
}

function escribir(clave: string, valor: Guardado) {
  try {
    localStorage.setItem(`cavala:orden:${clave}`, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento el orden dura hasta recargar.
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { clave, valor } }));
}

export type OrdenLocal = {
  /** Posición guardada del id, o `undefined` si nunca se reordenó. */
  posicion: (id: string) => number | undefined;
  oculto: (id: string) => boolean;
  /** Si ya hay un orden guardado (lo nuevo va entonces al final). */
  personalizado: boolean;
  /** Deja `idArrastrado` justo antes (o después) de `idDestino`, a partir del orden visible actual. */
  mover: (visibles: string[], idArrastrado: string, idDestino: string, despues: boolean) => void;
  alternarOculto: (id: string) => void;
  ordenar: <T>(items: T[], id: (item: T) => string) => T[];
};

export function useOrdenLocal(clave: string | undefined): OrdenLocal {
  const [guardado, setGuardado] = useState<Guardado>(VACIO);

  useEffect(() => {
    if (!clave) return;
    setGuardado(leer(clave));
    function sincronizar(evento: Event) {
      const detalle = (evento as CustomEvent<{ clave: string; valor: Guardado }>).detail;
      if (detalle?.clave === clave) setGuardado(detalle.valor);
    }
    window.addEventListener(EVENTO, sincronizar);
    return () => window.removeEventListener(EVENTO, sincronizar);
  }, [clave]);

  const indices = useMemo(() => new Map(guardado.orden.map((id, i) => [id, i])), [guardado.orden]);
  const ocultos = useMemo(() => new Set(guardado.ocultos), [guardado.ocultos]);

  const mover = useCallback((visibles: string[], idArrastrado: string, idDestino: string, despues: boolean) => {
    if (!clave || idArrastrado === idDestino) return;
    const lista = visibles.filter((id) => id !== idArrastrado);
    const destino = lista.indexOf(idDestino);
    if (destino === -1) return;
    lista.splice(despues ? destino + 1 : destino, 0, idArrastrado);
    // Conserva la posición relativa de lo que no está a la vista (ocultos, filas de otra ficha).
    const resto = guardado.orden.filter((id) => !lista.includes(id));
    escribir(clave, { ...guardado, orden: [...lista, ...resto] });
  }, [clave, guardado]);

  const alternarOculto = useCallback((id: string) => {
    if (!clave) return;
    const siguientes = ocultos.has(id) ? guardado.ocultos.filter((item) => item !== id) : [...guardado.ocultos, id];
    escribir(clave, { ...guardado, ocultos: siguientes });
  }, [clave, guardado, ocultos]);

  const ordenar = useCallback(<T,>(items: T[], id: (item: T) => string) => {
    if (indices.size === 0) return items;
    return items
      .map((item, i) => ({ item, i, pos: indices.get(id(item)) }))
      .sort((a, b) => (a.pos ?? 10_000 + a.i) - (b.pos ?? 10_000 + b.i))
      .map(({ item }) => item);
  }, [indices]);

  return useMemo(() => ({
    posicion: (id: string) => indices.get(id),
    oculto: (id: string) => ocultos.has(id),
    personalizado: indices.size > 0,
    mover,
    alternarOculto,
    ordenar,
  }), [indices, ocultos, mover, alternarOculto, ordenar]);
}

/** Mitad del elemento sobre la que cae el arrastre: define si se suelta antes o después. */
export function soltarDespues(evento: React.DragEvent<HTMLElement>) {
  const rect = evento.currentTarget.getBoundingClientRect();
  return evento.clientY > rect.top + rect.height / 2;
}

const LINEA_ANTES = "[&>td]:shadow-[inset_0_2px_0_rgba(96,165,250,0.8)] shadow-[0_-3px_0_rgba(96,165,250,0.8)]";
const LINEA_DESPUES = "[&>td]:shadow-[inset_0_-2px_0_rgba(96,165,250,0.8)] shadow-[0_3px_0_rgba(96,165,250,0.8)]";

/**
 * Arrastrar para reordenar una lista: `asa(id)` va en el agarre y
 * `destino(id)` en el elemento completo (fila o tarjeta). Los eventos no
 * suben al contenedor, así una fila dentro de una categoría arrastrable no
 * mueve también la categoría.
 */
export function useArrastreOrden(orden: OrdenLocal, visibles: string[]) {
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<{ id: string; despues: boolean } | null>(null);

  function terminar() {
    setArrastrando(null);
    setSobre(null);
  }

  return {
    asa: (id: string) => ({
      draggable: true,
      title: "Arrastrar para reordenar",
      onDragStart: (evento: React.DragEvent<HTMLElement>) => {
        evento.stopPropagation();
        evento.dataTransfer.effectAllowed = "move";
        evento.dataTransfer.setData("text/plain", id);
        const elemento = evento.currentTarget.closest<HTMLElement>("[data-arrastre-destino]");
        if (elemento) evento.dataTransfer.setDragImage(elemento, 12, 12);
        setArrastrando(id);
      },
      onDragEnd: terminar,
    }),
    destino: (id: string) => ({
      "data-arrastre-destino": "",
      onDragOver: (evento: React.DragEvent<HTMLElement>) => {
        if (!arrastrando) return;
        evento.preventDefault();
        evento.stopPropagation();
        if (arrastrando === id) return;
        const despues = soltarDespues(evento);
        setSobre((previo) => (previo?.id === id && previo.despues === despues ? previo : { id, despues }));
      },
      onDrop: (evento: React.DragEvent<HTMLElement>) => {
        if (!arrastrando) return;
        evento.preventDefault();
        evento.stopPropagation();
        orden.mover(visibles, arrastrando, id, soltarDespues(evento));
        terminar();
      },
    }),
    clase: (id: string) =>
      arrastrando === id ? "opacity-40" : sobre?.id === id ? (sobre.despues ? LINEA_DESPUES : LINEA_ANTES) : "",
  };
}

export type ArrastreOrden = ReturnType<typeof useArrastreOrden>;
