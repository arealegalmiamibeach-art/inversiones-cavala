"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition, type DragEvent } from "react";
import { ChevronDown, ChevronRight, GripVertical, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { EdicionOpcion } from "@/components/ui/edicion-opcion";
import {
  crearEstadoProceso,
  eliminarEstadoProceso,
  ordenarEstadosProceso,
  renombrarEstadoProceso,
} from "@/lib/actions/estados-procesos";
import { colorEstadoNuevo, type EstadoProceso } from "@/lib/procesos/estados";
import { materiaInfo } from "@/lib/procesos/materias";
import { MATERIAS } from "./opciones";

type Cambio =
  | { tipo: "agregar"; estado: EstadoProceso }
  | { tipo: "ordenar"; materia: string; ids: string[] }
  | { tipo: "quitar"; id: string }
  | { tipo: "renombrar"; id: string; valor: string };

/** Dónde caería lo que se arrastra: junto a una fila (antes o después de ella). */
type Linea = { id: string; despues: boolean };

/** Los estados que aún no confirmó el servidor llevan este prefijo en el id. */
const PREFIJO_PROVISIONAL = "provisional:";
const esProvisional = (estado: EstadoProceso) => estado.id.startsWith(PREFIJO_PROVISIONAL);

function aplicar(estados: EstadoProceso[], cambio: Cambio): EstadoProceso[] {
  switch (cambio.tipo) {
    case "agregar":
      return [...estados, cambio.estado];
    case "quitar":
      return estados.filter((estado) => estado.id !== cambio.id);
    case "renombrar":
      return estados.map((estado) => (estado.id === cambio.id ? { ...estado, valor: cambio.valor } : estado));
    case "ordenar":
      return estados.map((estado) => {
        const posicion = cambio.ids.indexOf(estado.id);
        return posicion < 0 ? estado : { ...estado, materia: cambio.materia, orden: posicion + 1 };
      });
  }
}

const minusculas = (texto: string) => texto.toLocaleLowerCase("es-PE");

/** Franja (px) junto al borde de un contenedor donde arrastrar hace scroll. */
const ZONA_AUTOSCROLL = 64;
const VELOCIDAD_MAXIMA = 18;

/**
 * Mientras se arrastra un estado, hace scroll en el contenedor más interno que
 * pueda moverse cuando el cursor se acerca a su borde superior o inferior. El
 * autoscroll nativo sólo actúa pegado al borde y no alcanza aquí: la lista y
 * el panel que la contiene tienen scroll propio.
 */
function useAutoscrollAlArrastrar(activo: boolean, raiz: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!activo) return;
    let cursorY: number | null = null;
    let cuadro = 0;

    const alMover = (evento: globalThis.DragEvent) => {
      cursorY = evento.clientY;
    };

    const desplazables = () => {
      const lista: HTMLElement[] = [];
      for (let nodo = raiz.current; nodo; nodo = nodo.parentElement) {
        const { overflowY } = getComputedStyle(nodo);
        if ((overflowY === "auto" || overflowY === "scroll") && nodo.scrollHeight > nodo.clientHeight) lista.push(nodo);
      }
      return lista;
    };

    const paso = () => {
      if (cursorY !== null) {
        for (const contenedor of desplazables()) {
          const caja = contenedor.getBoundingClientRect();
          const arriba = Math.max(caja.top, 0);
          const abajo = Math.min(caja.bottom, window.innerHeight);
          const zona = Math.min(ZONA_AUTOSCROLL, (abajo - arriba) / 3);
          let delta = 0;
          if (cursorY < arriba + zona && contenedor.scrollTop > 0) {
            delta = -VELOCIDAD_MAXIMA * Math.min(1, (arriba + zona - cursorY) / zona);
          } else if (cursorY > abajo - zona && contenedor.scrollTop + contenedor.clientHeight < contenedor.scrollHeight) {
            delta = VELOCIDAD_MAXIMA * Math.min(1, (cursorY - (abajo - zona)) / zona);
          }
          if (delta !== 0) {
            contenedor.scrollTop += delta;
            break;
          }
        }
      }
      cuadro = requestAnimationFrame(paso);
    };

    document.addEventListener("dragover", alMover);
    cuadro = requestAnimationFrame(paso);
    return () => {
      document.removeEventListener("dragover", alMover);
      cancelAnimationFrame(cuadro);
    };
  }, [activo, raiz]);
}

/**
 * Editor del catálogo de `estados_procesos`, embebido en el panel "Editar
 * propiedad" de la columna Estado. Como los grupos de Notion (To-do / In
 * progress / Complete), pero cada grupo es una materia con su propio conjunto
 * de estados:
 *
 * - "+" en el encabezado agrega un estado a esa materia.
 * - El asa de cada fila lo arrastra: para reordenarlo o pasarlo a otra materia.
 * - Pulsar una fila la deja editable ahí mismo (nombre) y muestra el tacho
 *   para eliminarla.
 *
 * En la vista de una materia va primero la propia y sólo ella viene abierta.
 */
export function EditorEstadosProcesos({
  estados,
  materiaFija,
  etiquetaMateria,
}: {
  estados: EstadoProceso[];
  materiaFija?: string | null;
  /** Etiqueta editable de la materia (catálogo `opciones_columna`); si falta, la del código. */
  etiquetaMateria?: (clave: string) => string;
}) {
  const [vista, aplicarCambio] = useOptimistic(estados, aplicar);
  const [abiertos, setAbiertos] = useState<Set<string>>(
    () => new Set(materiaFija && materiaFija in MATERIAS ? [materiaFija] : Object.keys(MATERIAS))
  );
  const [agregandoEn, setAgregandoEn] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<EstadoProceso | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [linea, setLinea] = useState<Linea | null>(null);
  const [error, setError] = useState("");
  const [procesando, startTransition] = useTransition();
  const raiz = useRef<HTMLDivElement>(null);
  useAutoscrollAlArrastrar(arrastrando !== null, raiz);

  const nombreMateria = (clave: string) => etiquetaMateria?.(clave) ?? MATERIAS[clave] ?? clave;
  const claves = Object.keys(MATERIAS);
  const orden = materiaFija && materiaFija in MATERIAS ? [materiaFija, ...claves.filter((clave) => clave !== materiaFija)] : claves;

  const delGrupo = (materia: string) =>
    vista.filter((estado) => estado.materia === materia).sort((a, b) => a.orden - b.orden);
  /** Estado nuevo que se ve al instante, con el color que el servidor le dará. */
  const provisional = (valor: string, materia: string): EstadoProceso => {
    const igual = vista.find((estado) => minusculas(estado.valor) === minusculas(valor));
    const nuevo = colorEstadoNuevo(valor);
    return {
      id: `${PREFIJO_PROVISIONAL}${crypto.randomUUID()}`,
      valor,
      claseColor: igual?.claseColor ?? nuevo.clase,
      colorPunto: igual?.colorPunto ?? nuevo.punto,
      materia,
      orden: delGrupo(materia).reduce((mayor, estado) => Math.max(mayor, estado.orden), 0) + 1,
      usos: 0,
    };
  };
  const existeEn = (materia: string, valor: string, salvo?: string) =>
    vista.find((estado) => estado.id !== salvo && estado.materia === materia && minusculas(estado.valor) === minusculas(valor));

  /** Ejecuta una acción del servidor mostrando su error; `cambio` se ve al instante. */
  function ejecutar(accion: () => Promise<{ ok: true } | { ok: false; error: string }>, cambio?: Cambio) {
    setError("");
    startTransition(async () => {
      if (cambio) aplicarCambio(cambio);
      const resultado = await accion();
      if (!resultado.ok) setError(resultado.error);
    });
  }

  function alternar(clave: string) {
    setAbiertos((actual) => {
      const siguiente = new Set(actual);
      if (!siguiente.delete(clave)) siguiente.add(clave);
      return siguiente;
    });
  }

  function empezarAgregar(clave: string) {
    setAbiertos((actual) => new Set(actual).add(clave));
    setAgregandoEn(clave);
  }

  function agregar(valor: string, clave: string) {
    const limpio = valor.trim().replace(/\s+/g, " ");
    if (!limpio) return;
    if (existeEn(clave, limpio)) {
      setError(`«${limpio}» ya está en ${nombreMateria(clave)}.`);
      return;
    }
    ejecutar(() => crearEstadoProceso(limpio, clave), { tipo: "agregar", estado: provisional(limpio, clave) });
  }

  function renombrar(estado: EstadoProceso, valor: string) {
    const limpio = valor.trim().replace(/\s+/g, " ");
    if (!limpio || limpio === estado.valor) return;
    const materia = estado.materia ?? "";
    if (existeEn(materia, limpio, estado.id)) {
      setError(`«${limpio}» ya está en ${nombreMateria(materia)}.`);
      return;
    }
    ejecutar(() => renombrarEstadoProceso(estado.id, limpio), { tipo: "renombrar", id: estado.id, valor: limpio });
  }

  /** Deja `estado` en `destino`, antes de la fila `antesDe` (o al final si es null). */
  function colocar(estado: EstadoProceso, destino: string, antesDe: string | null) {
    setEditando(null);
    if (estado.materia !== destino && existeEn(destino, estado.valor)) {
      setError(`«${estado.valor}» ya existe en ${nombreMateria(destino)}.`);
      return;
    }
    const actuales = delGrupo(destino);
    const ids = actuales.filter((item) => item.id !== estado.id).map((item) => item.id);
    const posicion = antesDe ? ids.indexOf(antesDe) : -1;
    ids.splice(posicion < 0 ? ids.length : posicion, 0, estado.id);

    const mismoLugar = estado.materia === destino && actuales.every((item, indice) => item.id === ids[indice]);
    if (mismoLugar) return;

    setAbiertos((actual) => new Set(actual).add(destino));
    ejecutar(() => ordenarEstadosProceso(destino, ids), { tipo: "ordenar", materia: destino, ids });
  }

  function eliminar(estado: EstadoProceso) {
    setEditando(null);
    ejecutar(() => eliminarEstadoProceso(estado.id), { tipo: "quitar", id: estado.id });
  }

  function terminarArrastre() {
    setArrastrando(null);
    setSobre(null);
    setLinea(null);
  }

  function soltar(evento: DragEvent, destino: string, antesDe: string | null) {
    evento.preventDefault();
    evento.stopPropagation();
    const estado = arrastrando;
    terminarArrastre();
    if (estado) colocar(estado, destino, antesDe);
  }

  /** Sobre una fila: antes o después según la mitad en la que esté el cursor. */
  function sobreFila(evento: DragEvent<HTMLElement>, clave: string, estado: EstadoProceso) {
    if (!arrastrando) return;
    evento.preventDefault();
    evento.stopPropagation();
    const caja = evento.currentTarget.getBoundingClientRect();
    const despues = evento.clientY > caja.top + caja.height / 2;
    setSobre(clave);
    setLinea((actual) => (actual?.id === estado.id && actual.despues === despues ? actual : { id: estado.id, despues }));
  }

  return (
    <div className="space-y-1.5">
      <div ref={raiz} className="scrollbar-glass max-h-80 space-y-1 overflow-y-auto pr-1">
        {orden.map((clave) => {
          const estadosGrupo = delGrupo(clave);
          const abierto = abiertos.has(clave);
          const Icono = materiaInfo(clave).icono;
          const destinoValido = arrastrando !== null && (arrastrando.materia !== clave || estadosGrupo.length > 1);

          return (
            <div
              key={clave}
              onDragOver={(evento) => {
                if (!arrastrando) return;
                evento.preventDefault();
                if (sobre !== clave) setSobre(clave);
                if (linea) setLinea(null);
              }}
              onDragLeave={(evento) => {
                if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setSobre((actual) => (actual === clave ? null : actual));
              }}
              onDrop={(evento) => soltar(evento, clave, null)}
              className={cn(
                "rounded-lg transition-colors",
                destinoValido && sobre === clave && "bg-brand-500/10 ring-1 ring-brand-400/40"
              )}
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => alternar(clave)}
                  aria-expanded={abierto}
                  className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.07]"
                >
                  <Icono className="h-3.5 w-3.5 shrink-0 text-white/35 transition-colors group-hover:text-white/70" />
                  <span className="min-w-0 truncate text-[11px] font-medium text-white/60 transition-colors group-hover:text-white/90">
                    {nombreMateria(clave)}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-white/30">{estadosGrupo.length}</span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 shrink-0 text-white/30 transition-transform group-hover:text-white/70",
                      !abierto && "-rotate-90"
                    )}
                  />
                </button>
                <button
                  type="button"
                  disabled={procesando}
                  onClick={() => empezarAgregar(clave)}
                  aria-label={`Agregar estado a ${nombreMateria(clave)}`}
                  title="Agregar estado"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {abierto && (
                <div className="space-y-0.5 pb-1">
                  {estadosGrupo.map((estado, indice) => {
                    const guardandoEstado = esProvisional(estado);
                    return (
                    <div key={estado.id}>
                      <div
                        draggable={!procesando && !guardandoEstado && editando !== estado.id}
                        aria-busy={guardandoEstado}
                        onDragStart={(evento) => {
                          evento.dataTransfer.effectAllowed = "move";
                          evento.dataTransfer.setData("text/plain", estado.id);
                          setEditando(null);
                          setArrastrando(estado);
                        }}
                        onDragEnd={terminarArrastre}
                        onClick={() => {
                          if (!guardandoEstado && editando !== estado.id) setEditando(estado.id);
                        }}
                        onDragOver={(evento) => sobreFila(evento, clave, estado)}
                        onDrop={(evento) => {
                          const antesDe = linea?.id === estado.id && linea.despues ? estadosGrupo[indice + 1]?.id ?? null : estado.id;
                          soltar(evento, clave, antesDe);
                        }}
                        className={cn(
                          "group flex items-center gap-1 rounded-md py-0.5 pl-0.5 pr-1 transition-colors hover:bg-white/[0.07]",
                          editando === estado.id ? "bg-white/[0.07]" : "cursor-pointer",
                          arrastrando?.id === estado.id && "opacity-40",
                          guardandoEstado && "animate-pulse cursor-default",
                          arrastrando && arrastrando.id !== estado.id && linea?.id === estado.id &&
                            (linea.despues ? "shadow-[inset_0_-2px_0_0_rgb(96,165,250)]" : "shadow-[inset_0_2px_0_0_rgb(96,165,250)]")
                        )}
                      >
                        {guardandoEstado ? (
                          <Loader2 aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin text-white/50" />
                        ) : (
                          <GripVertical
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0 cursor-grab text-white/25 transition-colors group-hover:text-white/60"
                          />
                        )}
                        {editando === estado.id && !guardandoEstado ? (
                          <EdicionOpcion
                            valor={estado.valor}
                            procesando={procesando}
                            confirmarEliminar={
                              estado.usos > 0
                                ? `${estado.usos === 1 ? "1 proceso lo usa" : `${estado.usos} procesos lo usan`} y lo conservarán fuera de la lista. ¿Eliminar?`
                                : undefined
                            }
                            onGuardar={(valor) => renombrar(estado, valor)}
                            onEliminar={() => eliminar(estado)}
                            onCerrar={() => setEditando((actual) => (actual === estado.id ? null : actual))}
                          />
                        ) : (
                          <>
                            <span
                              title={estado.valor}
                              className={cn(
                                "inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                                estado.claseColor
                              )}
                            >
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: estado.colorPunto }} />
                              <span className="truncate">{estado.valor}</span>
                            </span>
                            <span className="flex-1" />
                            {guardandoEstado ? (
                              <span className="pr-1 text-[10px] text-white/40">Guardando…</span>
                            ) : (
                              <ChevronRight
                                aria-hidden
                                className="mr-1 h-3.5 w-3.5 shrink-0 text-white/40 transition-colors group-hover:text-white/80"
                              />
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    );
                  })}

                  {agregandoEn === clave && (
                    <CampoNuevoEstado
                      onAgregar={(valor) => agregar(valor, clave)}
                      onCerrar={() => setAgregandoEn((actual) => (actual === clave ? null : actual))}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {procesando && (
        <p role="status" className="flex items-center gap-1.5 px-1 text-[10px] text-white/45">
          <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
          Guardando…
        </p>
      )}
      {error && <p className="text-[9px] leading-4 text-red-300">{error}</p>}
    </div>
  );
}

/** Enter agrega y deja el campo abierto para el siguiente; Escape o salir lo cierra. */
function CampoNuevoEstado({
  onAgregar,
  onCerrar,
}: {
  onAgregar: (valor: string) => void;
  onCerrar: () => void;
}) {
  const [borrador, setBorrador] = useState("");

  function confirmar() {
    const limpio = borrador.trim();
    setBorrador("");
    if (limpio) onAgregar(limpio);
  }

  return (
    <input
      autoFocus
      value={borrador}
      maxLength={80}
      onChange={(evento) => setBorrador(evento.target.value)}
      onKeyDown={(evento) => {
        if (evento.key === "Enter") {
          evento.preventDefault();
          confirmar();
        } else if (evento.key === "Escape") {
          evento.preventDefault();
          evento.stopPropagation();
          setBorrador("");
          onCerrar();
        }
      }}
      onBlur={() => {
        confirmar();
        onCerrar();
      }}
      placeholder="Nuevo estado y presiona Enter…"
      className="view-control ml-5 w-[calc(100%-1.25rem)]"
    />
  );
}
