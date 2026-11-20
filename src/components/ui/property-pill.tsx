"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, GripVertical, Loader2, MoreHorizontal, Plus } from "lucide-react";
import { actualizarCampo } from "@/lib/actions/entidades";
import {
  crearOpcionColumna,
  eliminarOpcionColumna,
  ordenarOpcionesColumna,
  renombrarOpcionColumna,
  unirOpcionColumna,
} from "@/lib/actions/opciones-columna";
import { eliminarEstadoProceso, ordenarEstadosProceso, renombrarEstadoProceso } from "@/lib/actions/estados-procesos";
import {
  crearTipoPropietario,
  eliminarTipoPropietario,
  ordenarTiposPropietario,
  renombrarTipoPropietario,
} from "@/lib/actions/tipos-propietario";
import { EdicionOpcion } from "@/components/ui/edicion-opcion";
import { notificarCambioOpcionesColumna, useOpcionesColumna } from "@/components/ui/opciones-columna-cliente";
import { catalogoColumna } from "@/lib/opciones-columna";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";

export interface OpcionPill {
  value: string;
  label: string;
  className: string;
  /** Encabezado de sección a mostrar antes de esta opción (si cambia respecto a la anterior). */
  grupoLabel?: string;
  /** Sólo con `gestion`: id de la fila del catálogo que respalda la opción. */
  id?: string;
  /** Sólo con `gestion`: cuántos registros la usan hoy (para avisar antes de eliminarla). */
  usos?: number;
  /** Opción que no se edita, elimina ni reordena (sin "···" ni asa), p. ej. Propio y Tercero. */
  fija?: boolean;
}

/**
 * Permite editar el catálogo desde el propio menú: renombrar y eliminar (el
 * "···" de cada opción) y reordenar arrastrando. Es un descriptor, no
 * funciones, para poder pasarlo desde componentes de servidor.
 *
 * `catalogo` (`opciones_columna`) no hace falta pasarlo: lo activa solo toda
 * columna que esté en `CATALOGOS_COLUMNA`, en la tabla, el panel y la ficha.
 *
 * `tipo-propietario` gestiona los tipos personalizados de `tipos_propietario`
 * (la columna Tipo de Propietarios); Propio y Tercero llegan con `fija`.
 */
export type GestionOpciones =
  | { tipo: "estado-proceso"; materia: string | null }
  | { tipo: "catalogo" }
  | { tipo: "tipo-propietario" };

type ResultadoGestion = { ok: true } | { ok: false; error: string };

interface PropertyPillProps {
  tabla: string;
  id: string;
  campo: string;
  valor: string | boolean | null | undefined;
  opciones: OpcionPill[];
  revalidar: string;
  disabled?: boolean;
  /**
   * Como en Notion: el menú trae un buscador y, si lo escrito no coincide con
   * ninguna opción, ofrece crearla en el catálogo (`opciones_columna`) y
   * elegirla. Sólo para columnas con catálogo editable: sin indicarlo, se
   * activa solo en ellas (`false` lo apaga).
   */
  crearOpciones?: boolean;
  /**
   * Corta la etiqueta en una línea con puntos suspensivos (el texto completo
   * queda en el tooltip). Para columnas de etiquetas largas, como Legalizado.
   */
  truncar?: boolean;
  /**
   * Muestra en cada opción el menú para editarla o eliminarla y el asa para
   * reordenarla. Sin indicarlo, lo traen solas las columnas con catálogo
   * editable (`false` lo apaga).
   */
  gestion?: GestionOpciones | false;
}

/** A partir de cuántas opciones el menú trae buscador aunque no se pueda crear. */
const OPCIONES_CON_BUSCADOR = 8;

/** Marca de `confirmando` para "Crear", que también pisa un valor fuera de lista. */
const CONFIRMAR_CREAR = "\u0000crear";

type PosicionMenu = { left: number; maxHeight: number } & ({ top: number } | { bottom: number });

type AjustesOpciones = { renombrados: Record<string, string>; quitados: string[]; orden: string[] | null };
const SIN_AJUSTES: AjustesOpciones = { renombrados: {}, quitados: [], orden: null };

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-PE").trim();
}

function aClave(valor: string | boolean | null | undefined): string {
  if (valor === true) return "true";
  if (valor === false) return "false";
  return valor ?? "";
}

export function PropertyPill({
  tabla,
  id,
  campo,
  valor,
  opciones: opcionesBase,
  revalidar,
  disabled: disabledProp,
  crearOpciones: crearOpcionesProp,
  truncar = false,
  gestion: gestionProp,
}: PropertyPillProps) {
  const router = useRouter();
  // Las columnas con catálogo editable (`opciones_columna`) sustituyen la lista
  // del código en cuanto alguien las edita desde "Editar propiedad".
  const opcionesCatalogo = useOpcionesColumna(tabla, campo, opcionesBase);
  const rol = useAcceso(tabla);
  const disabled = disabledProp || !puedeEscribir(rol);

  // Toda columna con catálogo trae sola la edición de opciones en el menú
  // (renombrar, eliminar, reordenar, crear), igual que el panel "Editar propiedad".
  const esCatalogo = Boolean(catalogoColumna(tabla, campo));
  const gestion: GestionOpciones | null = gestionProp === false ? null : gestionProp ?? (esCatalogo ? { tipo: "catalogo" } : null);
  const gestionCatalogo = gestion?.tipo === "catalogo";
  const crearOpciones = crearOpcionesProp ?? (esCatalogo && gestionProp !== false);

  const [ajustes, setAjustes] = useState<AjustesOpciones>(SIN_AJUSTES);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const [lineaOpcion, setLineaOpcion] = useState<{ id: string; despues: boolean } | null>(null);
  // Renombrar sobre una opción que ya existe es unir, no renombrar: se pregunta antes de mover registros.
  const [union, setUnion] = useState<{ origen: OpcionPill; destino: OpcionPill } | null>(null);
  // Valor guardado de las opciones renombradas mientras no llega el catálogo nuevo,
  // para que una segunda edición encuentre la opción con el nombre que ya tiene.
  const valorGuardado = useRef<Record<string, string>>({});

  // Lo que el usuario acaba de renombrar, quitar o reordenar se ve al instante;
  // cuando llega el catálogo nuevo del servidor, ese ajuste ya no hace falta.
  const firmaOpciones = opcionesCatalogo.map((o) => `${o.id ?? ""}|${o.value}|${o.label}`).join("\n");
  useEffect(() => {
    setAjustes(SIN_AJUSTES);
    valorGuardado.current = {};
  }, [firmaOpciones]);
  const opciones = useMemo(() => {
    let lista = opcionesCatalogo
      // Las opciones del catálogo se identifican por su valor guardado (único por columna).
      .map((o) => (gestionCatalogo && !o.id ? { ...o, id: o.value } : o))
      .filter((o) => !(o.id && ajustes.quitados.includes(o.id)))
      .map((o) => {
        const nuevo = o.id ? ajustes.renombrados[o.id] : undefined;
        if (!nuevo) return o;
        // Con un valor guardado distinto de la etiqueta (materia, tipo de contrato) sólo cambia lo que se ve.
        return gestionCatalogo && o.value !== o.label ? { ...o, label: nuevo } : { ...o, value: nuevo, label: nuevo };
      });
    const orden = ajustes.orden;
    if (orden) lista = [...lista].sort((a, b) => orden.indexOf(a.id ?? "") - orden.indexOf(b.id ?? ""));
    return lista;
  }, [opcionesCatalogo, ajustes, gestionCatalogo]);

  // Mismo par valor/etiqueta que el editor del panel: siembra el catálogo en la primera edición.
  const baseServidor = useMemo(() => opcionesBase.map((o) => ({ valor: o.value, etiqueta: o.label })), [opcionesBase]);
  const valorDe = (id: string) => valorGuardado.current[id] ?? id;

  const acciones = gestion?.tipo === "estado-proceso"
    ? {
        renombrar: (id: string, valor: string): Promise<ResultadoGestion> => renombrarEstadoProceso(id, valor),
        eliminar: (id: string): Promise<ResultadoGestion> => eliminarEstadoProceso(id),
        ordenar: gestion.materia
          ? (ids: string[]): Promise<ResultadoGestion> => ordenarEstadosProceso(gestion.materia as string, ids)
          : undefined,
        unir: undefined as ((origen: string, destino: string) => Promise<ResultadoGestion>) | undefined,
      }
    : gestion?.tipo === "tipo-propietario"
      ? {
          renombrar: (id: string, texto: string): Promise<ResultadoGestion> => renombrarTipoPropietario(id, texto),
          eliminar: (id: string): Promise<ResultadoGestion> => eliminarTipoPropietario(id),
          ordenar: (ids: string[]): Promise<ResultadoGestion> => ordenarTiposPropietario(ids),
          unir: undefined as ((origen: string, destino: string) => Promise<ResultadoGestion>) | undefined,
        }
    : gestionCatalogo
      ? {
          renombrar: (id: string, texto: string): Promise<ResultadoGestion> => renombrarOpcionColumna(tabla, campo, valorDe(id), texto, baseServidor),
          eliminar: (id: string): Promise<ResultadoGestion> => eliminarOpcionColumna(tabla, campo, valorDe(id), baseServidor),
          ordenar: (ids: string[]): Promise<ResultadoGestion> => ordenarOpcionesColumna(tabla, campo, ids.map(valorDe), baseServidor),
          unir: (origen: string, destino: string): Promise<ResultadoGestion> => unirOpcionColumna(tabla, campo, valorDe(origen), valorDe(destino), baseServidor),
        }
      : null;
  const gestionable = Boolean(acciones) && !disabled;
  const [valorLocal, setValorLocal] = useState(aClave(valor));
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<PosicionMenu | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [montado, setMontado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Opción que espera un segundo clic para pisar un valor fuera de la lista.
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const opcionesRef = useRef<Array<HTMLButtonElement | null>>([]);
  const busquedaRef = useRef<HTMLInputElement>(null);
  const menuId = useId();

  useEffect(() => setMontado(true), []);
  useEffect(() => setValorLocal(aClave(valor)), [valor]);
  useEffect(() => {
    if (abierto) return;
    setConfirmando(null);
    setBusqueda("");
    setEditandoId(null);
    setUnion(null);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    function onClickAfuera(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setAbierto(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAbierto(false);
        triggerRef.current?.focus();
      }
    }
    function onScroll(e: Event) {
      // La lista del menú tiene su propio scroll: moverla no debe cerrarlo.
      if (menuRef.current?.contains(e.target as Node)) return;
      setAbierto(false);
    }
    document.addEventListener("mousedown", onClickAfuera);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClickAfuera);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [abierto]);

  // Estos campos son texto libre, no enums reales: si el valor guardado no
  // coincide con ninguna opción conocida, la PASTILLA lo muestra igual (para no
  // perder el dato), pero el menú desplegable solo ofrece las opciones
  // estándar — no lo inyecta como una entrada más para evitar duplicados.
  const actual =
    opciones.find((o) => o.value === valorLocal) ??
    (valorLocal ? { value: valorLocal, label: valorLocal, className: "bg-white/10 text-white/80" } : undefined);

  // Elegir una opción sobre un valor que no está en la lista destruye un dato que
  // nadie podrá recuperar desde la UI (pasó con `procesos.estado`: el desplegable
  // se comió bitácoras enteras de expedientes). En ese caso pedimos un segundo
  // clic antes de guardar.
  const valorFueraDeLista = Boolean(valorLocal) && !opciones.some((o) => o.value === valorLocal);

  const conBuscador = crearOpciones || opciones.length > OPCIONES_CON_BUSCADOR;
  const consulta = normalizar(busqueda);
  const visibles = consulta
    ? opciones.filter((o) => normalizar(o.label).includes(consulta) || normalizar(o.value).includes(consulta))
    : opciones;
  // Reordenar sólo tiene sentido con la lista completa y con ids de catálogo.
  const ordenable = gestionable && Boolean(acciones?.ordenar) && !consulta && opciones.every((o) => o.id || o.fija);
  // Mismo recorte que hace `crearOpcionColumna`, para elegir justo lo que se guarda.
  const textoNuevo = busqueda.trim().replace(/\s+/g, " ");
  const coincidenciaExacta = consulta
    ? opciones.find((o) => normalizar(o.label) === consulta || normalizar(o.value) === consulta)
    : undefined;
  const puedeCrear = crearOpciones && textoNuevo.length > 0 && textoNuevo.length <= 80 && !coincidenciaExacta;

  function avisarError(mensaje: string) {
    setError(mensaje);
    setTimeout(() => setError(null), 3000);
  }

  /** El catálogo de una columna nativa cambió: las demás pastillas y la página lo releen. */
  function refrescarCatalogo() {
    if (gestion?.tipo === "tipo-propietario") {
      router.refresh();
      return;
    }
    if (!gestionCatalogo) return;
    notificarCambioOpcionesColumna(tabla);
    router.refresh();
  }

  function renombrarOpcion(op: OpcionPill, texto: string) {
    const limpio = texto.trim().replace(/\s+/g, " ");
    if (!acciones || !op.id || !limpio || limpio === op.label) return;
    const id = op.id;
    const choque = opciones.find((o) => o.id !== id && normalizar(o.label) === normalizar(limpio));
    if (choque) {
      if (acciones.unir) setUnion({ origen: op, destino: choque });
      else avisarError(`«${limpio}» ya existe.`);
      return;
    }
    // En el catálogo el valor guardado sólo cambia cuando coincide con la etiqueta.
    const cambiaElValor = !gestionCatalogo || op.value === op.label;
    setAjustes((a) => ({ ...a, renombrados: { ...a.renombrados, [id]: limpio } }));
    const eraElActual = op.value === valorLocal;
    if (eraElActual && cambiaElValor) setValorLocal(limpio);
    startTransition(async () => {
      const resultado = await acciones.renombrar(id, limpio);
      if (resultado.ok) {
        if (gestionCatalogo && cambiaElValor) valorGuardado.current[id] = limpio;
        refrescarCatalogo();
        return;
      }
      setAjustes((a) => {
        const { [id]: _descartado, ...resto } = a.renombrados;
        return { ...a, renombrados: resto };
      });
      if (eraElActual && cambiaElValor) setValorLocal(op.value);
      avisarError(resultado.error);
    });
  }

  function eliminarOpcion(op: OpcionPill) {
    if (!acciones || !op.id) return;
    const id = op.id;
    setEditandoId(null);
    setAjustes((a) => ({ ...a, quitados: [...a.quitados, id] }));
    startTransition(async () => {
      const resultado = await acciones.eliminar(id);
      if (resultado.ok) {
        refrescarCatalogo();
        return;
      }
      setAjustes((a) => ({ ...a, quitados: a.quitados.filter((item) => item !== id) }));
      avisarError(resultado.error);
    });
  }

  /** Pasa los registros de `origen` a `destino` y quita `origen` de la lista. */
  function unirOpciones(origen: OpcionPill, destino: OpcionPill) {
    if (!acciones?.unir || !origen.id || !destino.id) return;
    const unirAcciones = acciones.unir;
    const idOrigen = origen.id;
    const idDestino = destino.id;
    setUnion(null);
    setEditandoId(null);
    setAjustes((a) => ({ ...a, quitados: [...a.quitados, idOrigen] }));
    const eraElActual = origen.value === valorLocal;
    if (eraElActual) setValorLocal(destino.value);
    startTransition(async () => {
      const resultado = await unirAcciones(idOrigen, idDestino);
      if (resultado.ok) {
        refrescarCatalogo();
        return;
      }
      setAjustes((a) => ({ ...a, quitados: a.quitados.filter((item) => item !== idOrigen) }));
      if (eraElActual) setValorLocal(origen.value);
      avisarError(resultado.error);
    });
  }

  function soltarOpcion(destinoId: string, despues: boolean) {
    const origenId = arrastrandoId;
    setArrastrandoId(null);
    setLineaOpcion(null);
    if (!acciones?.ordenar || !origenId || origenId === destinoId) return;
    // Las opciones fijas (Propio, Tercero) no entran en el orden: sólo las que tienen id.
    const actuales = opciones.filter((o) => o.id).map((o) => o.id as string);
    const ids = actuales.filter((item) => item !== origenId);
    const posicion = ids.indexOf(destinoId);
    ids.splice(despues ? posicion + 1 : posicion, 0, origenId);
    if (ids.every((item, indice) => item === actuales[indice])) return;
    const anterior = ajustes.orden;
    setAjustes((a) => ({ ...a, orden: ids }));
    startTransition(async () => {
      const resultado = await acciones.ordenar?.(ids);
      if (!resultado) return;
      if (resultado.ok) {
        refrescarCatalogo();
        return;
      }
      setAjustes((a) => ({ ...a, orden: anterior }));
      avisarError(resultado.error);
    });
  }

  function alternar() {
    if (disabled) return;
    if (!abierto && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const abajo = window.innerHeight - r.bottom - 12;
      const arriba = r.top - 12;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 268));
      setPosicion(abajo >= 240 || abajo >= arriba
        ? { top: r.bottom + 4, left, maxHeight: Math.min(abajo, 360) }
        : { bottom: window.innerHeight - r.top + 4, left, maxHeight: Math.min(arriba, 360) });
    }
    setAbierto((a) => {
      const siguiente = !a;
      if (siguiente) {
        requestAnimationFrame(() => (conBuscador ? busquedaRef.current : opcionesRef.current[0])?.focus());
      }
      return siguiente;
    });
  }

  function crear() {
    if (!puedeCrear) return;
    if (valorFueraDeLista && confirmando !== CONFIRMAR_CREAR) {
      setConfirmando(CONFIRMAR_CREAR);
      return;
    }
    const texto = textoNuevo;
    setAbierto(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
    const anterior = valorLocal;
    setValorLocal(texto);
    setError(null);
    startTransition(async () => {
      try {
        let valorElegido = texto;
        if (gestion?.tipo === "tipo-propietario") {
          // Tipos de propietario: su propio catálogo (`tipos_propietario`). Si el nombre ya
          // existía con otras mayúsculas, se elige el existente.
          const creado = await crearTipoPropietario(texto);
          if (!creado.ok) {
            setValorLocal(anterior);
            setError(creado.error);
            setTimeout(() => setError(null), 3000);
            return;
          }
          valorElegido = creado.tipo.nombre;
          setValorLocal(valorElegido);
          router.refresh();
        } else {
          const base = opcionesBase.map((o) => ({ valor: o.value, etiqueta: o.label }));
          const creada = await crearOpcionColumna(tabla, campo, texto, base);
          if (!creada.ok) {
            setValorLocal(anterior);
            setError(creada.error);
            setTimeout(() => setError(null), 3000);
            return;
          }
          notificarCambioOpcionesColumna(tabla);
        }
        const res = await actualizarCampo(tabla, id, campo, valorElegido, revalidar);
        if (!("error" in res)) { window.dispatchEvent(new Event("registros-actualizados")); return; }
        setValorLocal(anterior);
        setError(res.code === "42501" ? "Sin permiso" : res.error);
        setTimeout(() => setError(null), 3000);
      } catch {
        setValorLocal(anterior);
        setError("No se pudo guardar. Intenta nuevamente.");
        setTimeout(() => setError(null), 3000);
      }
    });
  }

  function elegir(op: OpcionPill) {
    if (op.value === valorLocal) {
      setAbierto(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
      return;
    }
    if (valorFueraDeLista && confirmando !== op.value) {
      setConfirmando(op.value);
      return;
    }
    setAbierto(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
    const anterior = valorLocal;
    setValorLocal(op.value);
    setError(null);
    const valorReal = op.value === "true" ? true : op.value === "false" ? false : op.value;
    startTransition(async () => {
      try {
        const res = await actualizarCampo(tabla, id, campo, valorReal, revalidar);
        if (!("error" in res)) { window.dispatchEvent(new Event("registros-actualizados")); return; }
        setValorLocal(anterior);
        setError(res.code === "42501" ? "Sin permiso" : res.error);
        setTimeout(() => setError(null), 3000);
      } catch {
        setValorLocal(anterior);
        setError("No se pudo guardar. Intenta nuevamente.");
        setTimeout(() => setError(null), 3000);
      }
    });
  }

  const menu = posicion && (
    <div
      ref={menuRef}
      id={menuId}
      data-entity-sheet-portal
      role="listbox"
      aria-label={`Opciones de ${campo.replaceAll("_", " ")}`}
      style={{
        left: posicion.left,
        maxHeight: posicion.maxHeight,
        ...("top" in posicion ? { top: posicion.top } : { bottom: posicion.bottom }),
      }}
      className={`fixed z-[100] flex min-w-[170px] max-w-[260px] flex-col rounded-xl border border-white/10 bg-[#11131c] p-1 shadow-glass-lg ${conBuscador ? "w-[260px]" : ""}`}
    >
      {conBuscador && (
        <input
          ref={busquedaRef}
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              opcionesRef.current[0]?.focus();
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (coincidenciaExacta) elegir(coincidenciaExacta);
              else if (puedeCrear) crear();
              else if (visibles[0]) elegir(visibles[0]);
            }
          }}
          maxLength={80}
          placeholder={crearOpciones ? "Buscar o crear opción…" : "Buscar opción…"}
          aria-label={crearOpciones ? "Buscar o crear opción" : "Buscar opción"}
          className="mb-1 w-full shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-white/35 hover:border-white/20 focus:border-brand-400/40"
        />
      )}
      {valorFueraDeLista && (
        <p className="shrink-0 border-b border-white/10 px-2.5 pb-1.5 pt-1 text-[11px] leading-snug text-amber-300/90">
          Valor actual fuera de la lista. Elegir una opción lo reemplaza.
        </p>
      )}
      <div className="scrollbar-glass min-h-0 flex-1 space-y-0.5 overflow-y-auto">
      {visibles.map((op, index) => {
        const seleccionado = op.value === valorLocal;
        const porConfirmar = confirmando === op.value;
        const mostrarEncabezado = Boolean(op.grupoLabel) && op.grupoLabel !== visibles[index - 1]?.grupoLabel;
        const editando = gestionable && editandoId !== null && editandoId === op.id;
        return (
          <div key={op.value}>
            {mostrarEncabezado && (
              <p className="px-2.5 pb-0.5 pt-1.5 text-[9px] font-medium uppercase tracking-wide text-white/40 first:pt-0.5">
                {op.grupoLabel}
              </p>
            )}
            {editando ? (
              <div className="rounded-lg bg-white/[0.07] py-0.5 pl-1.5 pr-1 flex items-center">
                <EdicionOpcion
                  valor={op.label}
                  procesando={pending}
                  confirmarEliminar={
                    op.usos && op.usos > 0
                      ? `${op.usos === 1 ? "1 registro lo usa" : `${op.usos} registros lo usan`} y lo conservarán fuera de la lista. ¿Eliminar?`
                      : gestionCatalogo
                        ? "Los registros que la usan la conservarán fuera de la lista. ¿Eliminar?"
                        : undefined
                  }
                  onGuardar={(texto) => renombrarOpcion(op, texto)}
                  onEliminar={() => eliminarOpcion(op)}
                  onCerrar={() => setEditandoId((actualId) => (actualId === op.id ? null : actualId))}
                />
              </div>
            ) : (
              <div
                draggable={ordenable && Boolean(op.id)}
                onDragStart={(evento) => {
                  evento.dataTransfer.effectAllowed = "move";
                  evento.dataTransfer.setData("text/plain", op.id ?? "");
                  setArrastrandoId(op.id ?? null);
                }}
                onDragEnd={() => {
                  setArrastrandoId(null);
                  setLineaOpcion(null);
                }}
                onDragOver={(evento) => {
                  if (!ordenable || !arrastrandoId || !op.id) return;
                  evento.preventDefault();
                  const caja = evento.currentTarget.getBoundingClientRect();
                  const despues = evento.clientY > caja.top + caja.height / 2;
                  setLineaOpcion((actual) => (actual !== null && actual.id === op.id && actual.despues === despues ? actual : { id: op.id as string, despues }));
                }}
                onDrop={(evento) => {
                  evento.preventDefault();
                  if (op.id) soltarOpcion(op.id, lineaOpcion !== null && lineaOpcion.id === op.id ? lineaOpcion.despues : false);
                }}
                className={`group/fila flex items-center gap-0.5 rounded-lg ${arrastrandoId === op.id ? "opacity-40" : ""} ${
                  arrastrandoId && arrastrandoId !== op.id && lineaOpcion !== null && lineaOpcion.id === op.id
                    ? lineaOpcion.despues ? "shadow-[inset_0_-2px_0_0_rgb(96,165,250)]" : "shadow-[inset_0_2px_0_0_rgb(96,165,250)]"
                    : ""
                }`}
              >
                {ordenable && (op.id ? (
                  <GripVertical
                    aria-hidden
                    className="ml-0.5 h-3.5 w-3.5 shrink-0 cursor-grab text-white/20 transition-colors group-hover/fila:text-white/60"
                  />
                ) : (
                  // Opción fija: sin asa, pero con el mismo hueco para que todas queden alineadas.
                  <span aria-hidden className="ml-0.5 h-3.5 w-3.5 shrink-0" />
                ))}
            <button
              ref={(elemento) => { opcionesRef.current[index] = elemento; }}
              type="button"
              role="option"
              aria-selected={seleccionado}
              onClick={() => elegir(op)}
              onKeyDown={(event) => {
                const ultimo = visibles.length - 1;
                let siguiente: number | null = null;
                if (event.key === "ArrowUp" && index === 0 && conBuscador) {
                  event.preventDefault();
                  busquedaRef.current?.focus();
                  return;
                }
                if (event.key === "ArrowDown") siguiente = index === ultimo ? 0 : index + 1;
                if (event.key === "ArrowUp") siguiente = index === 0 ? ultimo : index - 1;
                if (event.key === "Home") siguiente = 0;
                if (event.key === "End") siguiente = ultimo;
                if (siguiente !== null) {
                  event.preventDefault();
                  opcionesRef.current[siguiente]?.focus();
                }
              }}
              className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-brand-400/50 ${
                porConfirmar ? "bg-amber-500/15" : seleccionado ? "bg-white/10" : "hover:bg-white/[0.09]"
              }`}
            >
              <span className={`badge min-w-0 ${op.className}`}>{op.label}</span>
              {porConfirmar
                ? <span className="shrink-0 text-[11px] font-medium text-amber-300">Confirmar</span>
                : seleccionado && <Check className="h-3.5 w-3.5 shrink-0 text-white/60" />}
            </button>
                {gestionable && op.id && (
                  <button
                    type="button"
                    onClick={() => setEditandoId(op.id ?? null)}
                    aria-label={`Editar ${op.label}`}
                    title="Editar"
                    className="mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/50 opacity-0 outline-none transition-all hover:bg-white/10 hover:text-white focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-brand-400/50 group-hover/fila:opacity-100"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {visibles.length === 0 && !puedeCrear && (
        <p className="px-2.5 py-1.5 text-[11px] text-white/45">
          {consulta ? "Ninguna opción coincide." : crearOpciones ? "Escribe para crear la primera opción." : "Sin opciones."}
        </p>
      )}
      </div>
      {union && (
        <div className="mt-0.5 flex shrink-0 items-center gap-1 rounded-lg border border-amber-400/20 bg-amber-500/[0.07] px-2 py-1.5 text-[10px] text-amber-200/90">
          <span className="min-w-0 flex-1 leading-4">¿Unir «{union.origen.label}» con «{union.destino.label}»? Los registros pasan a «{union.destino.label}».</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => unirOpciones(union.origen, union.destino)}
            className="shrink-0 rounded px-1.5 py-0.5 font-medium text-amber-100 outline-none transition-colors hover:bg-amber-400/25 focus-visible:ring-1 focus-visible:ring-amber-300/50 disabled:opacity-40"
          >
            Unir
          </button>
          <button
            type="button"
            onClick={() => setUnion(null)}
            className="shrink-0 rounded px-1.5 py-0.5 text-white/60 outline-none transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:ring-1 focus-visible:ring-brand-400/50"
          >
            No
          </button>
        </div>
      )}
      {puedeCrear && (
        <button
          type="button"
          onClick={crear}
          className={`mt-0.5 flex w-full shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs text-white/70 outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-1 focus-visible:ring-brand-400/50 ${
            confirmando === CONFIRMAR_CREAR ? "bg-amber-500/15" : ""
          }`}
        >
          <Plus className="h-3.5 w-3.5 shrink-0 text-white/50" />
          <span className="shrink-0">Crear</span>
          <span className="badge min-w-0 bg-white/10 text-white/85"><span className="truncate">{textoNuevo}</span></span>
          {confirmando === CONFIRMAR_CREAR && <span className="ml-auto shrink-0 text-[11px] font-medium text-amber-300">Confirmar</span>}
        </button>
      )}
      {error && <p role="alert" className="shrink-0 px-2.5 py-1 text-[11px] text-red-300">{error}</p>}
    </div>
  );

  // Sin opciones no hay nada que elegir (p. ej. el estado de las materias que no
  // manejan estado): se pinta estática, sin hover ni foco, para no aparentar que
  // es clicable.
  if (!opciones.length && !crearOpciones) {
    return (
      <span className={`badge ${actual?.className ?? "bg-white/10 text-white/70"}`}>
        {actual?.label ?? "—"}
      </span>
    );
  }

  return (
    <div
      role="presentation"
      className="inline-block"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={alternar}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? menuId : undefined}
        aria-busy={pending}
        aria-label={`${campo.replaceAll("_", " ")}: ${actual?.label ?? "sin valor"}`}
        title={truncar ? actual?.label : undefined}
        className={`badge gap-1.5 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-brand-400/50 ${
          actual?.className ?? "bg-white/10 text-white/70"
        } ${disabled ? "cursor-default opacity-60" : "cursor-pointer hover:opacity-80"} ${pending ? "opacity-60" : ""} ${truncar ? "max-w-[220px]" : ""}`}
      >
        {pending && <Loader2 aria-hidden className="h-3 w-3 shrink-0 animate-spin" />}
        {truncar ? <span className="min-w-0 truncate">{actual?.label ?? "—"}</span> : actual?.label ?? "—"}
      </button>
      {abierto && montado && createPortal(menu, document.body)}
    </div>
  );
}
