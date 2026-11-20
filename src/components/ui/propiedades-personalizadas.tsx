"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  Database,
  GripVertical,
  Hash,
  Link2,
  List,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { EntityPropertyRow, ORDEN_FINAL_LISTA } from "@/components/ui/entity-sheet";
import { DialogoPanel } from "@/components/ui/dialogo-panel";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { EdicionOpcion } from "@/components/ui/edicion-opcion";
import { AvisoUnirOpcion } from "@/components/ui/editor-opciones-personalizadas";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";
import {
  actualizarDefinicionPropiedadPersonalizada,
  actualizarOpcionesPropiedadPersonalizada,
  actualizarValorPropiedadPersonalizada,
  crearPropiedadPersonalizada,
  eliminarPropiedadPersonalizada,
  renombrarOpcionPropiedadPersonalizada,
  unirOpcionPropiedadPersonalizada,
} from "@/lib/actions/propiedades-personalizadas";
import { createClient } from "@/lib/supabase/client";
import {
  ENTIDADES_PERSONALIZABLES,
  TIPOS_ENTIDAD_PERSONALIZABLE,
  colorOpcion,
  esValorRelacionPersonalizada,
  requiereSubtipo,
  type PropiedadPersonalizada,
  type TipoEntidadPersonalizable,
  type TipoPropiedadPersonalizada,
  type ValorRelacionPersonalizada,
} from "@/lib/propiedades/personalizadas";
import { OPCIONES_TIPO_FECHA, type TipoFecha } from "@/lib/fechas-config";
import { cn } from "@/lib/utils";

export const EVENTO_CAMBIO_PROPIEDADES_PERSONALIZADAS = "cavala:propiedades-personalizadas-cambio";

function notificarCambioPropiedadesPersonalizadas(entidadTipo: TipoEntidadPersonalizable) {
  window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO_PROPIEDADES_PERSONALIZADAS, { detail: { entidadTipo } }));
}

const TIPO_CONFIG: Record<TipoPropiedadPersonalizada, { label: string; detalle: string; Icono: LucideIcon }> = {
  texto: { label: "Texto", detalle: "Nombres, notas o cualquier texto", Icono: Type },
  numero: { label: "Número", detalle: "Cantidades, montos o porcentajes", Icono: Hash },
  seleccion: { label: "Selección", detalle: "Elige una opción de una lista", Icono: List },
  multiseleccion: { label: "Multiselección", detalle: "Elige una o varias opciones de una lista", Icono: ListChecks },
  fecha: { label: "Fecha", detalle: "Día, mes y año", Icono: CalendarDays },
  booleano: { label: "Casilla", detalle: "Sí o no", Icono: CheckSquare },
  relacion: { label: "Relación", detalle: "Vincula registros de otra tabla", Icono: Link2 },
};

// "Relación" queda fuera del creador: su destino siempre es una de las
// tablas que ya tienen su propia columna fija (Propietarios, Predios…), así
// que cualquier propiedad nueva de ese tipo sería redundante con ella.
const TIPOS = (Object.keys(TIPO_CONFIG) as TipoPropiedadPersonalizada[]).filter((tipo) => tipo !== "relacion");

type PosicionMenu = { left: number; top: number };
type ValorCampo = string | number | boolean | string[] | ValorRelacionPersonalizada[] | null;

/** Tope de opciones de una propiedad personalizada (lo aplica `actualizarOpcionesPropiedadPersonalizada`). */
const MAXIMO_OPCIONES_PERSONALIZADA = 50;
const AVISO_ELIMINAR_OPCION = "Los registros que la usan la conservarán fuera de la lista. ¿Eliminar?";

/**
 * Edición de las opciones desde el propio selector de la celda (como el
 * desplegable de las columnas nativas): "···" para renombrar o eliminar, asa
 * para reordenar y "Crear" al escribir un nombre que no existe. Sólo la reciben
 * quienes pueden administrar la tabla.
 */
type GestionOpcionesPersonalizadas = {
  procesando: boolean;
  error: string;
  /** Crea la opción y devuelve si quedó guardada (para elegirla enseguida). */
  onCrear: (texto: string) => Promise<boolean>;
  onRenombrar: (anterior: string, nuevo: string) => void;
  /** Renombrar sobre una opción que ya existe es unir: se pregunta antes de mover registros. */
  union: { origen: string; destino: string } | null;
  onUnir: () => void;
  onCancelarUnion: () => void;
  onEliminar: (opcion: string) => void;
  onOrdenar: (opciones: string[]) => void;
};

function normalizarOpcion(texto: string) {
  return texto.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-PE");
}

/** Texto de la búsqueda si se puede crear como opción nueva; si no, null. */
function textoParaCrearOpcion(busqueda: string, opciones: string[], gestion: GestionOpcionesPersonalizadas | undefined): string | null {
  if (!gestion) return null;
  const texto = busqueda.trim().replace(/\s+/g, " ");
  if (!texto || texto.length > 80) return null;
  if (opciones.some((opcion) => normalizarOpcion(opcion) === normalizarOpcion(texto))) return null;
  return texto;
}

/** Estado de edición y de arrastre de las filas de un selector con opciones editables. */
function useFilasOpcionEditables(opciones: string[], gestion: GestionOpcionesPersonalizadas | undefined, buscando: boolean) {
  const [editando, setEditando] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [linea, setLinea] = useState<{ opcion: string; despues: boolean } | null>(null);
  // Reordenar sólo tiene sentido con la lista completa a la vista.
  const ordenable = Boolean(gestion) && !buscando && !gestion?.procesando;

  function soltar(destino: string, despues: boolean) {
    const origen = arrastrando;
    setArrastrando(null);
    setLinea(null);
    if (!gestion || !origen || origen === destino) return;
    const siguientes = opciones.filter((opcion) => opcion !== origen);
    siguientes.splice(siguientes.indexOf(destino) + (despues ? 1 : 0), 0, origen);
    if (siguientes.every((opcion, indice) => opcion === opciones[indice])) return;
    gestion.onOrdenar(siguientes);
  }

  function propsFila(opcion: string) {
    return {
      draggable: ordenable && editando !== opcion,
      onDragStart: (evento: React.DragEvent) => {
        evento.dataTransfer.effectAllowed = "move";
        evento.dataTransfer.setData("text/plain", opcion);
        setEditando(null);
        setArrastrando(opcion);
      },
      onDragEnd: () => {
        setArrastrando(null);
        setLinea(null);
      },
      onDragOver: (evento: React.DragEvent<HTMLElement>) => {
        if (!ordenable || !arrastrando) return;
        evento.preventDefault();
        const caja = evento.currentTarget.getBoundingClientRect();
        const despues = evento.clientY > caja.top + caja.height / 2;
        setLinea((actual) => (actual !== null && actual.opcion === opcion && actual.despues === despues ? actual : { opcion, despues }));
      },
      onDrop: (evento: React.DragEvent) => {
        evento.preventDefault();
        soltar(opcion, linea !== null && linea.opcion === opcion ? linea.despues : false);
      },
    };
  }

  function claseFila(opcion: string, redondeo: string) {
    return cn(
      "group/fila flex items-center gap-0.5",
      redondeo,
      arrastrando === opcion && "opacity-40",
      arrastrando && arrastrando !== opcion && linea !== null && linea.opcion === opcion &&
        (linea.despues ? "shadow-[inset_0_-2px_0_0_rgb(96,165,250)]" : "shadow-[inset_0_2px_0_0_rgb(96,165,250)]")
    );
  }

  return { editando, setEditando, ordenable, propsFila, claseFila };
}

function AsaOpcion() {
  return (
    <GripVertical
      aria-hidden
      className="ml-0.5 h-3.5 w-3.5 shrink-0 cursor-grab text-white/20 transition-colors group-hover/fila:text-white/60"
    />
  );
}

function BotonEditarOpcion({ opcion, onClick }: { opcion: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Editar ${opcion}`}
      title="Editar"
      className="mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/50 opacity-0 outline-none transition-all hover:bg-white/10 hover:text-white focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-brand-400/50 group-hover/fila:opacity-100"
    >
      <MoreHorizontal className="h-3.5 w-3.5" />
    </button>
  );
}

/** La opción pasa a ser un campo (nombre + tacho), en su propia fila. */
function EdicionFilaOpcion({ opcion, gestion, onCerrar }: { opcion: string; gestion: GestionOpcionesPersonalizadas; onCerrar: () => void }) {
  return (
    <div className="flex flex-1 items-center rounded-md bg-white/[0.07] py-0.5 pl-1.5 pr-1">
      <EdicionOpcion
        valor={opcion}
        procesando={gestion.procesando}
        confirmarEliminar={AVISO_ELIMINAR_OPCION}
        onGuardar={(texto) => gestion.onRenombrar(opcion, texto)}
        onEliminar={() => {
          onCerrar();
          gestion.onEliminar(opcion);
        }}
        onCerrar={onCerrar}
      />
    </div>
  );
}

function CrearOpcionBusqueda({ texto, procesando, onCrear }: { texto: string; procesando: boolean; onCrear: () => void }) {
  return (
    <button
      type="button"
      disabled={procesando}
      onClick={onCrear}
      className="mt-0.5 flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[11px] text-white/70 outline-none transition-colors hover:bg-white/[0.09] hover:text-white focus-visible:ring-1 focus-visible:ring-brand-400/50 disabled:opacity-50"
    >
      <Plus className="h-3.5 w-3.5 shrink-0 text-white/50" />
      <span className="shrink-0">Crear</span>
      <span className={cn("min-w-0 truncate rounded-md border px-2 py-0.5 text-[11px] font-medium", colorOpcion(texto, "oscuro"))}>{texto}</span>
    </button>
  );
}

export function AgregarPropiedadPersonalizada({
  entidadTipo,
  subtipo,
  subtipoLabel,
  compacta = false,
  onCreada,
}: {
  entidadTipo: TipoEntidadPersonalizable;
  /** Materia/tipo de la tabla donde se está agregando (ver `requiereSubtipo`). */
  subtipo?: string;
  /** Nombre a mostrar de `subtipo` (p. ej. "Minutas"). */
  subtipoLabel?: string;
  compacta?: boolean;
  onCreada?: (id: string) => void | Promise<void>;
}) {
  const rol = useAcceso(entidadTipo);
  const botonRef = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<PosicionMenu>({ left: 8, top: 8 });

  if (!puedeEscribir(rol)) return null;
  // Sin una tabla concreta (p. ej. viendo "Todos los procesos" sin materia)
  // no hay dónde guardar la nueva propiedad: hay que abrir esa tabla primero.
  if (requiereSubtipo(entidadTipo) && !subtipo) return null;

  function abrir(evento: React.MouseEvent) {
    evento.stopPropagation();
    const rect = botonRef.current?.getBoundingClientRect();
    if (rect) {
      const ancho = Math.min(340, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - ancho - 8));
      // Always open above the button — it's at the bottom of a panel
      const maxAlto = Math.min(480, rect.top - 16);
      const top = Math.max(8, rect.top - maxAlto - 6);
      setPosicion({ left, top });
    }
    setAbierto(true);
  }

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={abrir}
        className={cn(
          "inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#c8c2b5] text-neutral-600 transition-all duration-200 hover:bg-[#eeeadf] hover:text-neutral-800 active:scale-95",
          compacta ? "h-8 rounded-full px-3.5 text-[13px] font-semibold tracking-wide" : "px-3 py-2 text-xs"
        )}
      >
        <Plus className="h-4 w-4 text-neutral-500" /> Agregar propiedad
        <ChevronDown className="h-4 w-4 text-neutral-400" />
      </button>
      {abierto && (
        <MenuNuevaPropiedad
          entidadTipo={entidadTipo}
          subtipo={subtipo}
          subtipoLabel={subtipoLabel}
          posicion={posicion}
          onClose={() => setAbierto(false)}
          onCreada={onCreada}
        />
      )}
    </>
  );
}

/**
 * Entrada de opciones estilo Notion: escribes y Enter crea una etiqueta de
 * color (estable por texto), sin textarea de valores separados por coma.
 * La usa tanto el creador de propiedades (tema claro) como el editor de
 * opciones de una propiedad existente (tema oscuro, dentro de la tabla).
 */
export function EditorOpciones({
  opciones,
  onAgregar,
  onQuitar,
  tema = "oscuro",
  autoFocus,
  procesando,
  placeholder = "Añadir opción…",
}: {
  opciones: string[];
  onAgregar: (opcion: string) => void;
  onQuitar: (opcion: string) => void;
  tema?: "claro" | "oscuro";
  autoFocus?: boolean;
  procesando?: boolean;
  placeholder?: string;
}) {
  const [borrador, setBorrador] = useState("");
  const claro = tema === "claro";

  function confirmar() {
    const limpio = borrador.trim().replace(/\s+/g, " ");
    setBorrador("");
    if (!limpio || opciones.some((item) => item.toLocaleLowerCase("es-PE") === limpio.toLocaleLowerCase("es-PE"))) return;
    onAgregar(limpio);
  }

  return (
    <div className={cn(
      "flex flex-wrap items-center gap-1.5 rounded-lg border p-2",
      claro ? "border-[#d9d4c8] bg-[#f7f4eb]" : "border-white/[0.1] bg-white/[0.035]"
    )}>
      {opciones.map((opcion) => (
        <span key={opcion} className={cn("group/tag inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium", colorOpcion(opcion, tema))}>
          {opcion}
          <button
            type="button"
            disabled={procesando}
            onClick={() => onQuitar(opcion)}
            aria-label={`Quitar ${opcion}`}
            className="opacity-60 hover:opacity-100 disabled:opacity-30"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        autoFocus={autoFocus}
        value={borrador}
        disabled={procesando}
        onChange={(evento) => setBorrador(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") { evento.preventDefault(); confirmar(); }
          else if (evento.key === "Backspace" && !borrador && opciones.length > 0) onQuitar(opciones[opciones.length - 1]);
        }}
        onBlur={confirmar}
        placeholder={opciones.length === 0 ? placeholder : "Añadir…"}
        className={cn(
          "min-w-[110px] flex-1 bg-transparent text-[11px] outline-none",
          claro ? "text-neutral-800 placeholder:text-neutral-400" : "text-white/85 placeholder:text-white/30"
        )}
      />
    </div>
  );
}

export function CampoPropiedadPersonalizada({
  entidadId,
  propiedad,
  valor,
  tabla = false,
  onGuardado,
}: {
  entidadId: string;
  propiedad: PropiedadPersonalizada;
  valor: unknown;
  tabla?: boolean;
  onGuardado?: (valor: unknown) => void;
}) {
  const router = useRouter();
  const rol = useAcceso(propiedad.entidadTipo);
  const editable = puedeEscribir(rol);
  const [actual, setActual] = useState<ValorCampo>(() => valorNormalizadoLocal(propiedad.tipo, valor));
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const selectorTriggerRef = useRef<HTMLButtonElement>(null);
  // Escape suelta el campo para descartar: el `onBlur` que dispara ese mismo
  // `blur()` todavía ve el texto editado, así que sin esta marca lo guardaba.
  const descartarEdicion = useRef(false);
  const [error, setError] = useState("");
  const [guardando, iniciarGuardado] = useTransition();

  useEffect(() => setActual(valorNormalizadoLocal(propiedad.tipo, valor)), [propiedad.tipo, valor]);

  function guardar(valorServidor: unknown, valorLocal: ValorCampo = valorServidor as ValorCampo) {
    setError("");
    setActual(valorLocal);
    iniciarGuardado(async () => {
      const resultado = await actualizarValorPropiedadPersonalizada(propiedad.id, entidadId, valorServidor);
      if (!resultado.ok) {
        setError(resultado.error);
        setActual(valorNormalizadoLocal(propiedad.tipo, valor));
        return;
      }
      onGuardado?.(valorLocal);
      router.refresh();
    });
  }

  // Opciones de Selección/Multiselección: se editan desde el propio selector.
  // Lo recién hecho se ve al instante; al llegar la definición nueva del
  // servidor (otra lista de opciones) el ajuste ya no hace falta.
  const [opcionesAjustadas, setOpcionesAjustadas] = useState<string[] | null>(null);
  const [errorOpciones, setErrorOpciones] = useState("");
  const [gestionando, setGestionando] = useState(false);
  // Renombrar sobre una opción que ya existe es unir: se guarda el par hasta que se confirme.
  const [union, setUnion] = useState<{ origen: string; destino: string } | null>(null);
  const firmaOpciones = propiedad.opciones.join("\n");
  useEffect(() => setOpcionesAjustadas(null), [firmaOpciones]);
  const opcionesLista = opcionesAjustadas ?? propiedad.opciones;

  async function gestionarOpciones(
    siguientes: string[],
    accion: () => Promise<{ ok: true } | { ok: false; error: string }>,
    alFallar?: () => void
  ): Promise<boolean> {
    const anteriores = opcionesLista;
    setErrorOpciones("");
    setOpcionesAjustadas(siguientes);
    setGestionando(true);
    try {
      const resultado = await accion();
      if (!resultado.ok) {
        setOpcionesAjustadas(anteriores);
        setErrorOpciones(resultado.error);
        alFallar?.();
        return false;
      }
      notificarCambioPropiedadesPersonalizadas(propiedad.entidadTipo);
      router.refresh();
      return true;
    } catch {
      setOpcionesAjustadas(anteriores);
      setErrorOpciones("No se pudo guardar. Intenta nuevamente.");
      alFallar?.();
      return false;
    } finally {
      setGestionando(false);
    }
  }

  const gestionOpciones: GestionOpcionesPersonalizadas | undefined =
    editable && (propiedad.tipo === "seleccion" || propiedad.tipo === "multiseleccion")
      ? {
          procesando: gestionando,
          error: errorOpciones,
          onCrear: async (texto) => {
            const limpio = texto.trim().replace(/\s+/g, " ");
            if (!limpio || limpio.length > 80) return false;
            if (opcionesLista.some((opcion) => normalizarOpcion(opcion) === normalizarOpcion(limpio))) return false;
            if (opcionesLista.length >= MAXIMO_OPCIONES_PERSONALIZADA) {
              setErrorOpciones(`Esta propiedad ya tiene ${MAXIMO_OPCIONES_PERSONALIZADA} opciones`);
              return false;
            }
            const siguientes = [...opcionesLista, limpio];
            return gestionarOpciones(siguientes, () => actualizarOpcionesPropiedadPersonalizada(propiedad.id, siguientes));
          },
          onEliminar: (opcion) => {
            const siguientes = opcionesLista.filter((item) => item !== opcion);
            void gestionarOpciones(siguientes, () => actualizarOpcionesPropiedadPersonalizada(propiedad.id, siguientes));
          },
          onOrdenar: (siguientes) => {
            void gestionarOpciones(siguientes, () => actualizarOpcionesPropiedadPersonalizada(propiedad.id, siguientes));
          },
          onRenombrar: (anterior, nuevo) => {
            const limpio = nuevo.trim().replace(/\s+/g, " ");
            if (!limpio || limpio === anterior) return;
            const choque = opcionesLista.find((opcion) => opcion !== anterior && normalizarOpcion(opcion) === normalizarOpcion(limpio));
            if (choque) {
              setErrorOpciones("");
              setUnion({ origen: anterior, destino: choque });
              return;
            }
            // El valor de este registro sigue a la opción renombrada (el servidor hace lo mismo con todos).
            const previo = actual;
            setActual((valorActual) =>
              Array.isArray(valorActual)
                ? ((valorActual as unknown[]).map((item) => (item === anterior ? limpio : item)) as ValorCampo)
                : valorActual === anterior ? limpio : valorActual
            );
            const siguientes = opcionesLista.map((opcion) => (opcion === anterior ? limpio : opcion));
            void gestionarOpciones(
              siguientes,
              () => renombrarOpcionPropiedadPersonalizada(propiedad.id, anterior, limpio),
              () => setActual(previo)
            );
          },
          union,
          onCancelarUnion: () => setUnion(null),
          onUnir: () => {
            if (!union) return;
            const { origen, destino } = union;
            setUnion(null);
            // El valor de este registro pasa al destino (sin repetirlo en Multiselección); el servidor hace lo mismo con todos.
            const previo = actual;
            setActual((valorActual) => {
              if (!Array.isArray(valorActual)) return valorActual === origen ? destino : valorActual;
              const reemplazado = (valorActual as unknown[]).map((item) => (item === origen ? destino : item));
              return reemplazado.filter((item, indice) => reemplazado.indexOf(item) === indice) as ValorCampo;
            });
            const siguientes = opcionesLista.filter((opcion) => opcion !== origen);
            void gestionarOpciones(
              siguientes,
              () => unirOpcionPropiedadPersonalizada(propiedad.id, origen, destino),
              () => setActual(previo)
            );
          },
        }
      : undefined;

  function cerrarSelector() {
    setSelectorAbierto(false);
    setErrorOpciones("");
    setUnion(null);
  }

  if (propiedad.tipo === "relacion") {
    const relaciones = Array.isArray(actual) ? actual.filter(esValorRelacionPersonalizada) : [];
    const tipoDestino = propiedad.configuracion.entidad_tipo;
    return (
      <div className="relative min-w-[150px]" onClick={(evento) => evento.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-1">
          {relaciones.map((relacion) => (
            <span key={relacion.id} className="group/relation inline-flex max-w-[190px] items-center rounded-md border border-brand-400/20 bg-brand-500/10 text-[10px] text-brand-100">
              <Link href={relacion.href} className="truncate py-1 pl-2" title={relacion.nombre}>{relacion.nombre}</Link>
              {editable && (
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => {
                    const siguientes = relaciones.filter((item) => item.id !== relacion.id);
                    guardar(siguientes.map((item) => item.id), siguientes);
                  }}
                  aria-label={`Desvincular ${relacion.nombre}`}
                  className="mx-0.5 flex h-5 w-5 items-center justify-center rounded text-white/45 opacity-0 hover:bg-white/10 hover:text-white group-hover/relation:opacity-100 focus:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))}
          {editable && tipoDestino && relaciones.length < 100 && (
            <button
              type="button"
              disabled={guardando}
              onClick={() => setSelectorAbierto(true)}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-white/20 px-2 py-1 text-[10px] text-white/55 hover:border-brand-400/35 hover:bg-brand-500/10 hover:text-brand-100"
            >
              <Plus className="h-3 w-3" /> {relaciones.length === 0 ? "Vincular" : "Otro"}
            </button>
          )}
          {!editable && relaciones.length === 0 && <span className="text-[12px] text-white/45">—</span>}
          {guardando && <Loader2 className="h-3 w-3 animate-spin text-brand-300" />}
        </div>
        {!tipoDestino && <p className="text-[10px] text-amber-300">Relación sin tabla configurada</p>}
        {error && <p className="mt-1 text-[10px] text-red-300">{error}</p>}
        {selectorAbierto && tipoDestino && (
          <SelectorValorRelacion
            entidadId={entidadId}
            entidadTipoOrigen={propiedad.entidadTipo}
            tipoDestino={tipoDestino}
            vinculados={relaciones}
            onClose={() => setSelectorAbierto(false)}
            onSelect={(relacion) => {
              const siguientes = [...relaciones, relacion];
              guardar(siguientes.map((item) => item.id), siguientes);
              setSelectorAbierto(false);
            }}
          />
        )}
      </div>
    );
  }

  if (propiedad.tipo === "multiseleccion") {
    const elegidas = Array.isArray(actual) ? actual.filter((item): item is string => typeof item === "string") : [];
    return (
      <div className="relative min-w-[150px]" onClick={(evento) => evento.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-1">
          {elegidas.map((opcion) => (
            <span key={opcion} className={cn("group/tag inline-flex max-w-[190px] items-center rounded-md border text-[10px] font-medium", colorOpcion(opcion, "oscuro"))}>
              <span className="truncate py-1 pl-2">{opcion}</span>
              {editable && (
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => {
                    const siguientes = elegidas.filter((item) => item !== opcion);
                    guardar(siguientes, siguientes);
                  }}
                  aria-label={`Quitar ${opcion}`}
                  className="mx-0.5 flex h-5 w-5 items-center justify-center rounded opacity-60 hover:bg-white/10 hover:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))}
          {editable && opcionesLista.length > 0 && (
            <button
              ref={selectorTriggerRef}
              type="button"
              disabled={guardando}
              onClick={() => setSelectorAbierto(true)}
              aria-haspopup="listbox"
              aria-expanded={selectorAbierto}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-white/20 px-2 py-1 text-[10px] text-white/55 hover:border-brand-400/35 hover:bg-brand-500/10 hover:text-brand-100"
            >
              <Plus className="h-3 w-3" /> {elegidas.length === 0 ? "Elegir" : "Otro"}
            </button>
          )}
          {!editable && elegidas.length === 0 && <span className="text-[12px] text-white/45">—</span>}
          {guardando && <Loader2 className="h-3 w-3 animate-spin text-brand-300" />}
        </div>
        {error && <p className="mt-1 text-[10px] text-red-300">{error}</p>}
        {selectorAbierto && selectorTriggerRef.current && (
          <SelectorMultiseleccion
            ancla={selectorTriggerRef.current}
            opciones={opcionesLista}
            elegidas={elegidas}
            gestion={gestionOpciones}
            onClose={cerrarSelector}
            onToggle={(opcion) => {
              const siguientes = elegidas.includes(opcion) ? elegidas.filter((item) => item !== opcion) : [...elegidas, opcion];
              guardar(siguientes, siguientes);
            }}
          />
        )}
      </div>
    );
  }

  if (propiedad.tipo === "seleccion") {
    const elegida = typeof actual === "string" ? actual : "";
    return (
      <div className="relative min-w-[120px]" onClick={(evento) => evento.stopPropagation()}>
        {editable ? (
          <button
            type="button"
            disabled={guardando}
            onClick={() => setSelectorAbierto(true)}
            className="flex min-h-[26px] w-full items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 text-left transition-colors hover:border-white/[0.08] hover:bg-white/[0.035]"
          >
            {elegida ? (
              <span className={cn("inline-flex max-w-full items-center truncate rounded-md border px-2 py-0.5 text-[10px] font-medium", colorOpcion(elegida, "oscuro"))}>{elegida}</span>
            ) : (
              <span className="text-[11px] text-white/30">—</span>
            )}
            {guardando && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-brand-300" />}
          </button>
        ) : elegida ? (
          <span className={cn("inline-flex max-w-full items-center truncate rounded-md border px-2 py-0.5 text-[10px] font-medium", colorOpcion(elegida, "oscuro"))}>{elegida}</span>
        ) : (
          <span className="text-[12px] text-white/45">—</span>
        )}
        {error && <p className="mt-1 text-[10px] text-red-300">{error}</p>}
        {selectorAbierto && (
          <SelectorSeleccion
            opciones={opcionesLista}
            elegida={elegida}
            gestion={gestionOpciones}
            onClose={cerrarSelector}
            onSelect={(opcion) => {
              guardar(opcion || null, opcion || null);
              cerrarSelector();
            }}
          />
        )}
      </div>
    );
  }

  if (!editable) {
    return <span className="block py-1 text-[12px] text-white/80">{formatearValor(propiedad.tipo, actual) || "—"}</span>;
  }

  const claseBase = cn(
    "w-full rounded-md border border-transparent bg-transparent text-white/90 outline-none transition-colors placeholder:text-white/30 hover:border-white/[0.08] hover:bg-white/[0.035] focus:border-brand-400/30 focus:bg-white/[0.045]",
    tabla ? "min-w-[145px] px-2 py-1 text-xs" : "px-2 py-1.5 text-[13px]",
    // `date-dark` vuelve blanco el icono nativo del selector de fecha (globals.css).
    propiedad.tipo === "fecha" && "date-dark"
  );

  let control: React.ReactNode;
  if (propiedad.tipo === "booleano") {
    control = (
      <label className="inline-flex cursor-pointer items-center gap-2 py-1 text-xs text-white/80">
        <input
          type="checkbox"
          checked={actual === true}
          disabled={guardando}
          onChange={(evento) => guardar(evento.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-white/5 accent-brand-500"
        />
        {actual === true ? "Sí" : "No"}
      </label>
    );
  } else {
    control = (
      <input
        type={propiedad.tipo === "numero" ? "number" : propiedad.tipo === "fecha" ? "date" : "text"}
        value={actual === null ? "" : String(actual)}
        disabled={guardando}
        placeholder="—"
        step={propiedad.tipo === "numero" ? "any" : undefined}
        onChange={(evento) => setActual(evento.target.value)}
        onBlur={(evento) => {
          if (descartarEdicion.current) {
            descartarEdicion.current = false;
            return;
          }
          const siguiente = evento.target.value.trim();
          const original = valor === null || valor === undefined ? "" : String(valor);
          if (siguiente !== original) guardar(siguiente || null);
        }}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") evento.currentTarget.blur();
          if (evento.key === "Escape") {
            // Descarta sólo la edición: el panel lateral no debe cerrarse.
            evento.preventDefault();
            descartarEdicion.current = true;
            setActual(valorNormalizadoLocal(propiedad.tipo, valor));
            evento.currentTarget.blur();
          }
        }}
        className={claseBase}
      />
    );
  }

  return (
    <div className="relative min-w-0" onClick={(evento) => evento.stopPropagation()}>
      {control}
      {guardando && <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-brand-300" />}
      {error && <p className="mt-1 text-[10px] text-red-300">{error}</p>}
    </div>
  );
}

export function FilasPropiedadesPersonalizadas({
  entidadTipo,
  subtipo,
  subtipoLabel,
  entidadId,
  propiedades,
  valores,
  onCreada,
}: {
  entidadTipo: TipoEntidadPersonalizable;
  /** Materia/tipo del registro (p. ej. `proceso.materia`); ver `requiereSubtipo`. */
  subtipo?: string;
  subtipoLabel?: string;
  entidadId: string;
  propiedades: PropiedadPersonalizada[];
  valores: Record<string, unknown>;
  onCreada?: () => void | Promise<void>;
}) {
  return (
    <>
      {propiedades.map((propiedad) => (
        <FilaPropiedadPersonalizada
          key={propiedad.id}
          entidadId={entidadId}
          propiedad={propiedad}
          valor={valores[propiedad.id]}
          onCambio={onCreada}
        />
      ))}
      <div style={{ order: ORDEN_FINAL_LISTA }} className="px-1 pb-1 pt-2 sm:px-0">
        <AgregarPropiedadPersonalizada entidadTipo={entidadTipo} subtipo={subtipo} subtipoLabel={subtipoLabel} compacta onCreada={onCreada} />
      </div>
    </>
  );
}

function FilaPropiedadPersonalizada({
  entidadId,
  propiedad,
  valor,
  onCambio,
}: {
  entidadId: string;
  propiedad: PropiedadPersonalizada;
  valor: unknown;
  onCambio?: () => void | Promise<void>;
}) {
  const rol = useAcceso(propiedad.entidadTipo);
  const [dialogo, setDialogo] = useState<"editar" | "eliminar" | null>(null);
  const Icono = TIPO_CONFIG[propiedad.tipo].Icono;

  return (
    <>
      <EntityPropertyRow
        id={propiedad.id}
        icon={<Icono className="h-3.5 w-3.5" />}
        label={propiedad.nombre}
        acciones={puedeEscribir(rol) ? (
          <DropdownMenuItem onSelect={() => setDialogo("editar")} className="gap-2 text-xs">
            <Pencil className="h-3.5 w-3.5" /> Editar propiedad
          </DropdownMenuItem>
        ) : undefined}
        onEliminar={puedeEscribir(rol) ? () => setDialogo("eliminar") : undefined}
      >
        <CampoPropiedadPersonalizada entidadId={entidadId} propiedad={propiedad} valor={valor} />
      </EntityPropertyRow>
      {dialogo === "editar" && (
        <DialogoEditarPropiedad propiedad={propiedad} onClose={() => setDialogo(null)} onGuardado={onCambio} />
      )}
      {dialogo === "eliminar" && (
        <DialogoEliminarPropiedad propiedad={propiedad} onClose={() => setDialogo(null)} onEliminada={onCambio} />
      )}
    </>
  );
}

function DialogoEditarPropiedad({
  propiedad,
  onClose,
  onGuardado,
}: {
  propiedad: PropiedadPersonalizada;
  onClose: () => void;
  onGuardado?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(propiedad.nombre);
  const [descripcion, setDescripcion] = useState(propiedad.descripcion ?? "");
  const [error, setError] = useState("");
  const [guardando, iniciarGuardado] = useTransition();

  function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setError("");
    iniciarGuardado(async () => {
      const resultado = await actualizarDefinicionPropiedadPersonalizada(propiedad.id, { nombre, descripcion });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      await onGuardado?.();
      notificarCambioPropiedadesPersonalizadas(propiedad.entidadTipo);
      router.refresh();
      onClose();
    });
  }

  return (
    <DialogoPanel titulo="Editar propiedad" onClose={onClose}>
      <form onSubmit={guardar} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-white/45">Nombre</span>
          <input autoFocus required maxLength={80} value={nombre} onChange={(evento) => setNombre(evento.target.value)} className="view-control h-9 w-full" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-white/45">Descripción <span className="normal-case text-white/30">(opcional)</span></span>
          <input maxLength={240} value={descripcion} onChange={(evento) => setDescripcion(evento.target.value)} placeholder="Qué información guarda" className="view-control h-9 w-full" />
        </label>
        {error && <p className="text-[11px] text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={guardando} className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.08] hover:text-white">Cancelar</button>
          <button type="submit" disabled={guardando || !nombre.trim()} className="glass-btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
            {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
          </button>
        </div>
      </form>
    </DialogoPanel>
  );
}

function DialogoEliminarPropiedad({
  propiedad,
  onClose,
  onEliminada,
}: {
  propiedad: PropiedadPersonalizada;
  onClose: () => void;
  onEliminada?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [eliminando, iniciarEliminacion] = useTransition();

  function eliminar() {
    setError("");
    iniciarEliminacion(async () => {
      const resultado = await eliminarPropiedadPersonalizada(propiedad.id);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      await onEliminada?.();
      notificarCambioPropiedadesPersonalizadas(propiedad.entidadTipo);
      router.refresh();
      onClose();
    });
  }

  return (
    <DialogoPanel titulo="Eliminar propiedad" onClose={onClose}>
      <p className="flex items-start gap-2 text-xs text-red-100">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Se eliminará <strong>«{propiedad.nombre}»</strong> de todos los registros de{" "}
          {ENTIDADES_PERSONALIZABLES[propiedad.entidadTipo].plural.toLocaleLowerCase("es-PE")}, junto con sus valores.
        </span>
      </p>
      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={eliminando} className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.08] hover:text-white">Cancelar</button>
        <button type="button" onClick={eliminar} disabled={eliminando} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50">
          {eliminando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Sí, eliminar
        </button>
      </div>
    </DialogoPanel>
  );
}

export { DialogoPanel };

export function PanelPropiedadesPersonalizadas({
  entidadTipo,
  entidadId,
  propiedades,
  valores,
}: {
  entidadTipo: TipoEntidadPersonalizable;
  entidadId: string;
  propiedades: PropiedadPersonalizada[];
  valores: Record<string, unknown>;
}) {
  return (
    <div>
      {propiedades.length > 0 && (
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {propiedades.map((propiedad) => {
            const Icono = TIPO_CONFIG[propiedad.tipo].Icono;
            return (
              <div key={propiedad.id} className="group/custom relative rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                <div className="mb-1.5 flex items-center gap-2 pr-7">
                  <Icono className="h-3.5 w-3.5 text-brand-300" />
                  <span className="truncate text-[11px] font-semibold text-white/65">{propiedad.nombre}</span>
                </div>
                {propiedad.descripcion && <p className="mb-1.5 line-clamp-2 text-[10px] text-white/40">{propiedad.descripcion}</p>}
                <CampoPropiedadPersonalizada entidadId={entidadId} propiedad={propiedad} valor={valores[propiedad.id]} />
                <EliminarPropiedad propiedad={propiedad} />
              </div>
            );
          })}
        </div>
      )}
      <AgregarPropiedadPersonalizada entidadTipo={entidadTipo} />
    </div>
  );
}

export function MenuNuevaPropiedad({
  entidadTipo,
  subtipo,
  subtipoLabel,
  posicion,
  onClose,
  onCreada,
}: {
  entidadTipo: TipoEntidadPersonalizable;
  subtipo?: string;
  subtipoLabel?: string;
  posicion: PosicionMenu;
  onClose: () => void;
  onCreada?: (id: string) => void | Promise<void>;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoPropiedadPersonalizada | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [opciones, setOpciones] = useState<string[]>([]);
  const [relacionTipo, setRelacionTipo] = useState<TipoEntidadPersonalizable | "">("");
  const [tipoFecha, setTipoFecha] = useState<TipoFecha | "">("");
  const [error, setError] = useState("");
  const [guardando, iniciarGuardado] = useTransition();

  useEffect(() => {
    function cerrar(evento: KeyboardEvent) {
      if (evento.key === "Escape") onClose();
    }
    document.addEventListener("keydown", cerrar);
    return () => document.removeEventListener("keydown", cerrar);
  }, [onClose]);

  const tiposVisibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es-PE");
    return TIPOS.filter((item) => !texto || `${TIPO_CONFIG[item].label} ${TIPO_CONFIG[item].detalle}`.toLocaleLowerCase("es-PE").includes(texto));
  }, [busqueda]);

  function crear(evento: React.FormEvent) {
    evento.preventDefault();
    if (!tipo) return;
    setError("");
    iniciarGuardado(async () => {
      const resultado = await crearPropiedadPersonalizada({
        entidadTipo,
        subtipo,
        nombre,
        descripcion,
        tipo,
        opciones,
        relacionTipo,
        tipoFecha,
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      await onCreada?.(resultado.id);
      notificarCambioPropiedadesPersonalizadas(entidadTipo);
      onClose();
      router.refresh();
    });
  }

  return createPortal(
    <>
      <button
        type="button"
        data-property-creation-menu
        className="fixed inset-0 z-[118] cursor-default"
        onClick={onClose}
        aria-label="Cerrar menú"
      />
      <div
        data-property-creation-menu
        data-entity-sheet-portal
        style={{ left: posicion.left, top: posicion.top }}
        className="light-panel fixed z-[119] flex max-h-[min(480px,calc(100vh-32px))] w-[min(340px,calc(100vw-16px))] flex-col overflow-hidden rounded-xl border border-[#d9d4c8] bg-[#eeeadf] shadow-[0_16px_40px_rgba(48,42,31,0.18)]"
        role="dialog"
        aria-label="Agregar propiedad"
      >
        {tipo === null ? (
          <div className="p-2">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f7f4eb] text-neutral-600"><Plus className="h-4 w-4" /></div>
              <div>
                <p className="text-xs font-semibold text-neutral-900">Nueva propiedad</p>
                <p className="text-[9px] text-neutral-400">Elige el tipo de información</p>
              </div>
            </div>
            <label className="my-1.5 flex items-center gap-2 rounded-lg border border-[#d9d4c8] bg-[#f7f4eb] px-2.5 focus-within:border-neutral-400">
              <Search className="h-3.5 w-3.5 text-neutral-400" />
              <input autoFocus value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar tipo de propiedad…" className="h-8 min-w-0 flex-1 bg-transparent text-[11px] text-neutral-800 outline-none placeholder:text-neutral-400" />
            </label>
            <div className="max-h-[390px] space-y-0.5 overflow-y-auto">
              {tiposVisibles.map((item) => {
                const { Icono, label, detalle } = TIPO_CONFIG[item];
                return (
                  <button key={item} type="button" onClick={() => setTipo(item)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-[#e5e0d4]">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#d9d4c8] bg-[#f7f4eb] text-neutral-600"><Icono className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-medium text-neutral-800">{label}</span>
                      <span className="block truncate text-[9px] text-neutral-400">{detalle}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <form onSubmit={crear} className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-[#d9d4c8] px-3 py-2.5">
              <button type="button" onClick={() => { setTipo(null); setError(""); }} className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-[#e5e0d4] hover:text-neutral-700" aria-label="Volver"><ArrowLeft className="h-3.5 w-3.5" /></button>
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#f7f4eb] text-neutral-600">{(() => { const Icono = TIPO_CONFIG[tipo].Icono; return <Icono className="h-3.5 w-3.5" />; })()}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-neutral-900">Propiedad de {TIPO_CONFIG[tipo].label.toLocaleLowerCase("es-PE")}</p>
                <p className="truncate text-[9px] text-neutral-400">
                  {ENTIDADES_PERSONALIZABLES[entidadTipo].plural}
                  {subtipoLabel && <> · sólo en <span className="font-medium text-neutral-500">{subtipoLabel}</span></>}
                </p>
              </div>
              <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-[#e5e0d4] hover:text-neutral-700" aria-label="Cerrar"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              <label className="block">
                <span className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-neutral-400">Nombre</span>
                <input autoFocus required maxLength={80} value={nombre} onChange={(evento) => setNombre(evento.target.value)} placeholder="Nombre de la propiedad" className="view-control" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-neutral-400">Descripción <span className="normal-case text-neutral-300">(opcional)</span></span>
                <input maxLength={240} value={descripcion} onChange={(evento) => setDescripcion(evento.target.value)} placeholder="Qué información guarda" className="view-control" />
              </label>
              {(tipo === "seleccion" || tipo === "multiseleccion") && (
                <div>
                  <span className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-neutral-400">Opciones</span>
                  <EditorOpciones
                    tema="claro"
                    opciones={opciones}
                    onAgregar={(opcion) => setOpciones((actual) => [...actual, opcion])}
                    onQuitar={(opcion) => setOpciones((actual) => actual.filter((item) => item !== opcion))}
                  />
                </div>
              )}
              {tipo === "relacion" && (
                <div>
                  <span className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-neutral-400">Relacionar con</span>
                  <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-lg border border-[#d9d4c8] bg-[#f7f4eb] p-1">
                    {TIPOS_ENTIDAD_PERSONALIZABLE.map((tipoEntidad) => {
                      const config = ENTIDADES_PERSONALIZABLES[tipoEntidad];
                      return (
                        <button
                          key={tipoEntidad}
                          type="button"
                          onClick={() => setRelacionTipo(tipoEntidad)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10px]",
                            relacionTipo === tipoEntidad ? "bg-blue-50 text-blue-700" : "text-neutral-600 hover:bg-[#e5e0d4] hover:text-neutral-800"
                          )}
                        >
                          <Database className="h-3.5 w-3.5" />
                          <span className="flex-1">{config.plural}</span>
                          {relacionTipo === tipoEntidad && <CheckSquare className="h-3.5 w-3.5 text-blue-500" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {tipo === "fecha" && (
                <div>
                  <span className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-neutral-400">Tipo de fecha</span>
                  <div role="radiogroup" aria-label="Tipo de fecha" className="space-y-0.5 rounded-lg border border-[#d9d4c8] bg-[#f7f4eb] p-1">
                    {OPCIONES_TIPO_FECHA.map((opcion) => (
                      <button
                        key={opcion.tipo}
                        type="button"
                        role="radio"
                        aria-checked={tipoFecha === opcion.tipo}
                        onClick={() => setTipoFecha(opcion.tipo)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
                          tipoFecha === opcion.tipo ? "bg-blue-50 text-blue-700" : "text-neutral-600 hover:bg-[#e5e0d4] hover:text-neutral-800"
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] font-medium">{opcion.label}</span>
                          <span className="block text-[9px] text-neutral-400">{opcion.ayuda}</span>
                        </span>
                        {tipoFecha === opcion.tipo && <CheckSquare className="h-3.5 w-3.5 text-blue-500" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {error && <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[10px] text-red-600">{error}</p>}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-[#d9d4c8] px-3 py-2.5">
              <button type="button" onClick={onClose} disabled={guardando} className="rounded-md px-2.5 py-1.5 text-[10px] text-neutral-500 hover:bg-[#e5e0d4] hover:text-neutral-700">Cancelar</button>
              <button type="submit" disabled={guardando || !nombre.trim() || ((tipo === "seleccion" || tipo === "multiseleccion") && opciones.length === 0) || (tipo === "relacion" && !relacionTipo) || (tipo === "fecha" && !tipoFecha)} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-[10px] font-medium text-white hover:bg-neutral-700 disabled:opacity-40">
                {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Crear
              </button>
            </div>
          </form>
        )}
      </div>
    </>,
    document.body
  );
}

/**
 * Acota el selector a una familia de la tabla destino: `valores` deja sólo
 * esas (p. ej. la materia "civil" de un proceso) y `excluir` todo lo que no
 * esté en la lista, vacíos incluidos (el "Otros contratos" del catálogo).
 */
export type FiltroRelacion = { campo: string; valores?: string[]; excluir?: string[] };

export function SelectorValorRelacion({
  entidadId,
  entidadTipoOrigen,
  tipoDestino,
  tipoDocumento,
  filtro,
  tituloCategoria,
  vinculados,
  onClose,
  onSelect,
}: {
  entidadId: string;
  entidadTipoOrigen?: TipoEntidadPersonalizable;
  tipoDestino: TipoEntidadPersonalizable;
  /** Sólo para `tipoDestino: "documento"`: acota la búsqueda a `documentos.tipo` (la categoría desde la que se abrió), en vez de listar los ~1000 documentos de todo tipo. */
  tipoDocumento?: string;
  /** Acota la búsqueda a una familia del destino (materia de proceso, tipo de contrato). */
  filtro?: FiltroRelacion;
  /** Título de la categoría a mostrar en el diálogo, cuando difiere del genérico "Documentos" (p. ej. "Minutas"). */
  tituloCategoria?: string;
  vinculados: ValorRelacionPersonalizada[];
  onClose: () => void;
  onSelect: (valor: ValorRelacionPersonalizada) => void;
}) {
  const config = ENTIDADES_PERSONALIZABLES[tipoDestino];
  const tituloDialogo = tituloCategoria ?? config.plural;
  const [opciones, setOpciones] = useState<Array<ValorRelacionPersonalizada & { detalle: string }> | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  // El filtro llega como objeto literal: su identidad cambia en cada render
  // del padre, así que la consulta depende de su contenido, no del objeto.
  const claveFiltro = JSON.stringify(filtro ?? null);

  useEffect(() => {
    let cancelado = false;
    const supabase = createClient();
    const filtroActual = JSON.parse(claveFiltro) as FiltroRelacion | null;
    let consulta = supabase
      .from(config.tabla)
      .select(["id", config.campoNombre, ...config.camposDetalle].join(", "))
      .order(config.campoNombre)
      .limit(1000);
    if (tipoDestino === "documento" && tipoDocumento) consulta = consulta.eq("tipo", tipoDocumento);
    if (filtroActual?.valores?.length) consulta = consulta.in(filtroActual.campo, filtroActual.valores);
    if (filtroActual?.excluir?.length) {
      const lista = filtroActual.excluir.map((valor) => `"${valor.replace(/"/g, '\\"')}"`).join(",");
      consulta = consulta.or(`${filtroActual.campo}.is.null,${filtroActual.campo}.not.in.(${lista})`);
    }
    consulta
      .then(({ data, error: errorCarga }) => {
        if (cancelado) return;
        if (errorCarga) {
          setError("No se pudieron cargar los registros disponibles.");
          setOpciones([]);
          return;
        }
        setOpciones(((data ?? []) as unknown as Record<string, unknown>[]).flatMap((fila) => {
          if (typeof fila.id !== "string") return [];
          return [{
            id: fila.id,
            nombre: typeof fila[config.campoNombre] === "string" && fila[config.campoNombre]
              ? String(fila[config.campoNombre])
              : config.singular,
            href: `${config.href}/${fila.id}`,
            detalle: config.camposDetalle.map((campo) => fila[campo]).filter(Boolean).join(" · "),
          }];
        }));
      });
    return () => { cancelado = true; };
  }, [config, tipoDestino, tipoDocumento, claveFiltro]);

  useEffect(() => {
    function cerrar(evento: KeyboardEvent) {
      if (evento.key === "Escape") onClose();
    }
    document.addEventListener("keydown", cerrar);
    return () => document.removeEventListener("keydown", cerrar);
  }, [onClose]);

  const idsVinculados = useMemo(() => new Set(vinculados.map((item) => item.id)), [vinculados]);
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es-PE");
    return (opciones ?? []).filter((opcion) =>
      !idsVinculados.has(opcion.id) &&
      !(entidadTipoOrigen === tipoDestino && opcion.id === entidadId) &&
      (!texto || `${opcion.nombre} ${opcion.detalle}`.toLocaleLowerCase("es-PE").includes(texto))
    );
  }, [busqueda, entidadId, entidadTipoOrigen, idsVinculados, opciones, tipoDestino]);

  return createPortal(
    <div data-entity-sheet-portal className="fixed inset-0 z-[125] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Relacionar con ${tituloDialogo}`}>
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Cerrar" />
      <div className="relative z-10 flex max-h-[min(650px,86vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.13] bg-[#11131d]/[0.99] shadow-[0_30px_100px_rgba(0,0,0,.72)]">
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/12 text-brand-300"><Link2 className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-white">Relacionar con {tituloDialogo}</p><p className="text-[10px] text-white/45">Selecciona un registro existente</p></div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.07] hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="border-b border-white/[0.07] p-3">
          <label className="flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 focus-within:border-brand-400/35">
            <Search className="h-4 w-4 text-white/35" />
            <input autoFocus value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder={`Buscar ${tituloDialogo.toLocaleLowerCase("es-PE")}…`} className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
          </label>
        </div>
        <div className="min-h-44 flex-1 overflow-y-auto p-2 scrollbar-glass">
          {opciones === null ? (
            <div className="flex h-36 items-center justify-center gap-2 text-xs text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
          ) : visibles.length === 0 ? (
            <div className="flex h-36 items-center justify-center px-6 text-center text-xs text-white/45">{busqueda ? "No hay coincidencias." : "No quedan registros por vincular."}</div>
          ) : visibles.map((opcion) => (
            <button key={opcion.id} type="button" onClick={() => onSelect(opcion)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.06]">
              <Link2 className="h-4 w-4 shrink-0 text-brand-300/70" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-white/90">{opcion.nombre}</span>{opcion.detalle && <span className="block truncate text-[10px] text-white/40">{opcion.detalle}</span>}</span>
              <Plus className="h-4 w-4 text-white/35" />
            </button>
          ))}
        </div>
        {error && <p className="border-t border-red-400/15 bg-red-500/[0.08] px-4 py-2.5 text-[11px] text-red-200">{error}</p>}
      </div>
    </div>,
    document.body
  );
}

function SelectorMultiseleccion({
  ancla,
  opciones,
  elegidas,
  gestion,
  onClose,
  onToggle,
}: {
  ancla: HTMLElement;
  opciones: string[];
  elegidas: string[];
  gestion?: GestionOpcionesPersonalizadas;
  onClose: () => void;
  onToggle: (opcion: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const [posicion, setPosicion] = useState(() => posicionarDesplegable(ancla));
  const filas = useFilasOpcionEditables(opciones, gestion, busqueda.trim().length > 0);
  const textoNuevo = textoParaCrearOpcion(busqueda, opciones, gestion);

  // Crea la opción y, si quedó guardada, la marca en este registro.
  async function crearOpcion(texto: string) {
    if (!gestion) return;
    setBusqueda("");
    if (await gestion.onCrear(texto)) onToggle(texto);
  }

  useEffect(() => {
    function cerrar(evento: KeyboardEvent) {
      if (evento.key === "Escape") onClose();
    }
    document.addEventListener("keydown", cerrar);
    return () => document.removeEventListener("keydown", cerrar);
  }, [onClose]);

  useLayoutEffect(() => {
    function actualizarPosicion() {
      setPosicion(posicionarDesplegable(ancla, panelRef.current?.offsetHeight));
    }

    actualizarPosicion();
    window.addEventListener("resize", actualizarPosicion);
    window.addEventListener("scroll", actualizarPosicion, true);
    return () => {
      window.removeEventListener("resize", actualizarPosicion);
      window.removeEventListener("scroll", actualizarPosicion, true);
    };
  }, [ancla]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es-PE");
    return opciones.filter((opcion) => !texto || opcion.toLocaleLowerCase("es-PE").includes(texto));
  }, [busqueda, opciones]);

  return createPortal(
    <>
      <button type="button" className="fixed inset-0 z-[124] cursor-default bg-transparent" onClick={onClose} aria-label="Cerrar opciones" />
      <div
        ref={panelRef}
        data-entity-sheet-portal
        style={{ left: posicion.left, top: posicion.top, width: posicion.width }}
        className="fixed z-[125] flex max-h-[min(360px,calc(100vh-16px))] flex-col overflow-hidden rounded-xl border border-white/[0.13] bg-[#171923]/[0.99] shadow-[0_16px_48px_rgba(0,0,0,.55)]"
        role="listbox"
        aria-label="Elegir opciones"
        aria-multiselectable="true"
      >
        <div className="border-b border-white/[0.07] p-2">
          <label className="flex items-center gap-2 rounded-md border border-white/[0.1] bg-white/[0.035] px-2.5 focus-within:border-brand-400/35">
            <Search className="h-3.5 w-3.5 text-white/35" />
            <input
              autoFocus
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === "Enter" && textoNuevo) {
                  evento.preventDefault();
                  void crearOpcion(textoNuevo);
                }
              }}
              placeholder={gestion ? "Buscar o crear opción…" : "Buscar opción…"}
              className="h-8 min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/30"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5 scrollbar-glass">
          {visibles.length === 0 && !textoNuevo ? (
            <div className="flex h-20 items-center justify-center px-4 text-center text-[11px] text-white/45">No hay coincidencias.</div>
          ) : visibles.map((opcion) => {
            const activo = elegidas.includes(opcion);
            if (gestion && filas.editando === opcion) {
              return (
                <div key={opcion} className="flex">
                  <EdicionFilaOpcion opcion={opcion} gestion={gestion} onCerrar={() => filas.setEditando(null)} />
                </div>
              );
            }
            return (
              <div key={opcion} {...filas.propsFila(opcion)} className={filas.claseFila(opcion, "rounded-md")}>
                {filas.ordenable && <AsaOpcion />}
                <button
                  type="button"
                  role="option"
                  aria-selected={activo}
                  onClick={() => onToggle(opcion)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-brand-400/50",
                    activo ? "bg-white/[0.065] hover:bg-white/[0.11]" : "hover:bg-white/[0.09]"
                  )}
                >
                  <span className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                    activo ? "border-brand-400/60 bg-brand-500/80 text-white" : "border-white/25 text-transparent"
                  )}>
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  <span className={cn("min-w-0 max-w-full truncate rounded-md border px-2 py-0.5 text-[11px] font-medium", colorOpcion(opcion, "oscuro"))}>{opcion}</span>
                </button>
                {gestion && <BotonEditarOpcion opcion={opcion} onClick={() => filas.setEditando(opcion)} />}
              </div>
            );
          })}
          {textoNuevo && gestion && (
            <CrearOpcionBusqueda texto={textoNuevo} procesando={gestion.procesando} onCrear={() => void crearOpcion(textoNuevo)} />
          )}
        </div>
        {gestion?.union && (
          <AvisoUnirOpcion
            origen={gestion.union.origen}
            destino={gestion.union.destino}
            procesando={gestion.procesando}
            className="mx-1.5 mb-1.5 rounded-lg px-2 py-1.5 text-[10px]"
            onUnir={gestion.onUnir}
            onCancelar={gestion.onCancelarUnion}
          />
        )}
        {gestion?.error && <p role="alert" className="border-t border-red-400/15 bg-red-500/[0.08] px-2.5 py-1.5 text-[10px] text-red-200">{gestion.error}</p>}
        <div className="border-t border-white/[0.07] px-2.5 py-1.5 text-[9px] text-white/35">
          {elegidas.length} de {opciones.length} seleccionada{elegidas.length === 1 ? "" : "s"}
        </div>
      </div>
    </>,
    document.body
  );
}

function posicionarDesplegable(ancla: HTMLElement, altoMedido?: number) {
  const margen = 8;
  const separacion = 6;
  const rect = ancla.getBoundingClientRect();
  const width = Math.min(300, window.innerWidth - margen * 2);
  const alto = altoMedido ?? Math.min(360, window.innerHeight - margen * 2);
  const left = Math.max(margen, Math.min(rect.left, window.innerWidth - width - margen));
  const cabeAbajo = rect.bottom + separacion + alto <= window.innerHeight - margen;
  const top = cabeAbajo
    ? rect.bottom + separacion
    : Math.max(margen, rect.top - alto - separacion);

  return { left, top, width };
}

function SelectorSeleccion({
  opciones,
  elegida,
  gestion,
  onClose,
  onSelect,
}: {
  opciones: string[];
  elegida: string;
  gestion?: GestionOpcionesPersonalizadas;
  onClose: () => void;
  onSelect: (opcion: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const filas = useFilasOpcionEditables(opciones, gestion, busqueda.trim().length > 0);
  const textoNuevo = textoParaCrearOpcion(busqueda, opciones, gestion);

  // Crea la opción y, si quedó guardada, la elige para este registro.
  async function crearOpcion(texto: string) {
    if (!gestion) return;
    setBusqueda("");
    if (await gestion.onCrear(texto)) onSelect(texto);
  }

  useEffect(() => {
    function cerrar(evento: KeyboardEvent) {
      if (evento.key === "Escape") onClose();
    }
    document.addEventListener("keydown", cerrar);
    return () => document.removeEventListener("keydown", cerrar);
  }, [onClose]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es-PE");
    return opciones.filter((opcion) => !texto || opcion.toLocaleLowerCase("es-PE").includes(texto));
  }, [busqueda, opciones]);

  return createPortal(
    <div data-entity-sheet-portal className="fixed inset-0 z-[125] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Elegir una opción">
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Cerrar" />
      <div className="relative z-10 flex max-h-[min(520px,86vh)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/[0.13] bg-[#11131d]/[0.99] shadow-[0_30px_100px_rgba(0,0,0,.72)]">
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/12 text-brand-300"><List className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-white">Elegir una opción</p></div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.07] hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="border-b border-white/[0.07] p-3">
          <label className="flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 focus-within:border-brand-400/35">
            <Search className="h-4 w-4 text-white/35" />
            <input
              autoFocus
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === "Enter" && textoNuevo) {
                  evento.preventDefault();
                  void crearOpcion(textoNuevo);
                }
              }}
              placeholder={gestion ? "Buscar o crear opción…" : "Buscar opción…"}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
            />
          </label>
        </div>
        <div className="min-h-32 flex-1 overflow-y-auto p-2 scrollbar-glass">
          {elegida && (
            <button type="button" onClick={() => onSelect("")} className="mb-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-left text-[11px] text-white/50 transition-colors hover:bg-white/[0.09] hover:text-white/80">
              <X className="h-3.5 w-3.5" /> Quitar selección
            </button>
          )}
          {visibles.length === 0 && !textoNuevo ? (
            <div className="flex h-28 items-center justify-center px-6 text-center text-xs text-white/45">No hay coincidencias.</div>
          ) : visibles.map((opcion) => {
            const activo = opcion === elegida;
            if (gestion && filas.editando === opcion) {
              return (
                <div key={opcion} className="flex">
                  <EdicionFilaOpcion opcion={opcion} gestion={gestion} onCerrar={() => filas.setEditando(null)} />
                </div>
              );
            }
            return (
              <div key={opcion} {...filas.propsFila(opcion)} className={filas.claseFila(opcion, "rounded-xl")}>
                {filas.ordenable && <AsaOpcion />}
                <button
                  type="button"
                  onClick={() => onSelect(opcion)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-white/[0.09] focus-visible:ring-1 focus-visible:ring-brand-400/50"
                >
                  <span className={cn("min-w-0 max-w-full truncate rounded-md border px-2 py-1 text-[12px] font-medium", colorOpcion(opcion, "oscuro"))}>{opcion}</span>
                  {activo && <Check className="ml-auto h-4 w-4 shrink-0 text-brand-300" />}
                </button>
                {gestion && <BotonEditarOpcion opcion={opcion} onClick={() => filas.setEditando(opcion)} />}
              </div>
            );
          })}
          {textoNuevo && gestion && (
            <CrearOpcionBusqueda texto={textoNuevo} procesando={gestion.procesando} onCrear={() => void crearOpcion(textoNuevo)} />
          )}
        </div>
        {gestion?.union && (
          <AvisoUnirOpcion
            origen={gestion.union.origen}
            destino={gestion.union.destino}
            procesando={gestion.procesando}
            className="mx-2 mb-2 rounded-xl px-3 py-2 text-[11px]"
            onUnir={gestion.onUnir}
            onCancelar={gestion.onCancelarUnion}
          />
        )}
        {gestion?.error && <p role="alert" className="border-t border-red-400/15 bg-red-500/[0.08] px-4 py-2 text-[11px] text-red-200">{gestion.error}</p>}
      </div>
    </div>,
    document.body
  );
}

function EliminarPropiedad({ propiedad }: { propiedad: PropiedadPersonalizada }) {
  const router = useRouter();
  const rol = useAcceso(propiedad.entidadTipo);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState("");
  const [eliminando, iniciarEliminacion] = useTransition();
  if (!puedeEscribir(rol)) return null;

  function eliminar() {
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    iniciarEliminacion(async () => {
      const resultado = await eliminarPropiedadPersonalizada(propiedad.id);
      if (!resultado.ok) {
        setError(resultado.error);
        setConfirmando(false);
        return;
      }
      notificarCambioPropiedadesPersonalizadas(propiedad.entidadTipo);
      router.refresh();
    });
  }

  return (
    <div className="absolute right-2 top-2">
      <button
        type="button"
        onClick={eliminar}
        onBlur={() => setConfirmando(false)}
        disabled={eliminando}
        title={confirmando ? "Haz clic otra vez para eliminar la propiedad y todos sus valores" : "Eliminar propiedad"}
        className={cn(
          "flex h-7 items-center justify-center rounded-md text-white/35 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-300 group-hover/custom:opacity-100 focus:opacity-100",
          confirmando ? "w-auto bg-red-500/10 px-2 text-[9px] text-red-300 opacity-100" : "w-7"
        )}
      >
        {eliminando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : confirmando ? "Confirmar" : <Trash2 className="h-3.5 w-3.5" />}
      </button>
      {error && <p className="absolute right-0 top-8 z-10 w-48 rounded-lg border border-red-400/20 bg-[#24151b] px-2 py-1.5 text-[10px] leading-4 text-red-200 shadow-xl">{error}</p>}
    </div>
  );
}

function valorNormalizadoLocal(tipo: TipoPropiedadPersonalizada, valor: unknown): ValorCampo {
  if (valor === null || valor === undefined) return tipo === "relacion" || tipo === "multiseleccion" ? [] : null;
  if (tipo === "relacion") return Array.isArray(valor) ? valor.filter(esValorRelacionPersonalizada) : [];
  if (tipo === "multiseleccion") return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === "string") : [];
  if (tipo === "booleano") return typeof valor === "boolean" ? valor : null;
  if (tipo === "numero") return typeof valor === "number" || typeof valor === "string" ? valor : null;
  return typeof valor === "string" ? valor : null;
}

function formatearValor(tipo: TipoPropiedadPersonalizada, valor: ValorCampo) {
  if (valor === null || valor === "") return "";
  if (tipo === "booleano") return valor ? "Sí" : "No";
  if (tipo === "fecha" && typeof valor === "string") {
    return new Date(`${valor}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  }
  if (tipo === "relacion" && Array.isArray(valor)) return valor.map((item) => typeof item === "string" ? item : item.nombre).join(", ");
  if (tipo === "multiseleccion" && Array.isArray(valor)) return valor.map((item) => typeof item === "string" ? item : item.nombre).join(", ");
  return String(valor);
}
