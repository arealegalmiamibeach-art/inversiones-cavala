"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Columns2, Eye, EyeOff, GripVertical, Loader2, MoreHorizontal, RotateCcw, Trash2, X } from "lucide-react";
import { DialogoPanel } from "@/components/ui/dialogo-panel";
import { HistorialPanel } from "@/components/ui/historial-panel";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePropiedadesEliminadas } from "@/components/ui/propiedades-eliminadas-context";
import { selectorArchivoActivo } from "@/lib/archivos/selector-nativo";
import { soltarDespues, useOrdenLocal, type OrdenLocal } from "@/lib/orden-local";
import { ENTIDADES_PERSONALIZABLES, type TipoEntidadPersonalizable } from "@/lib/propiedades/personalizadas";
import { cn } from "@/lib/utils";

interface EntitySheetProps {
  open: boolean;
  onClose: () => void;
  titulo: React.ReactNode;
  /** Editor que reemplaza al título grande sin duplicarlo entre las propiedades. */
  tituloEditor?: React.ReactNode;
  subtitulo?: React.ReactNode;
  icono?: React.ReactNode;
  children: React.ReactNode;
  /** Muestra el botón de historial de cambios en la cabecera del panel. */
  historial?: { tabla: string; registroId: string; titulo?: string };
}

type ResultadoCambio = { ok: true } | { ok: false; error: string };

type ContextoListaPropiedades = {
  orden: OrdenLocal;
  mostrarOcultos: boolean;
  arrastrando: string | null;
  setArrastrando: (id: string | null) => void;
  registrar: (id: string, campo?: string) => () => void;
  visibles: () => string[];
  /** Tipo de entidad cuyas propiedades nativas se pueden eliminar; sin él la ficha sólo permite ocultar. */
  entidadTipo?: TipoEntidadPersonalizable;
  eliminadas: ReadonlySet<string>;
  puedeAdministrar: boolean;
  mostrarEliminadas: boolean;
  eliminar: (campo: string) => Promise<ResultadoCambio>;
  restaurar: (campo: string) => Promise<ResultadoCambio>;
};

const ListaPropiedadesContext = createContext<ContextoListaPropiedades | null>(null);

/** Orden por encima de cualquier fila: lo que va siempre al final de la lista (p. ej. "Agregar propiedad"). */
export const ORDEN_FINAL_LISTA = 9000;

export function EntityPropertyList({
  children,
  ordenKey,
  entidadTipo,
}: {
  children: React.ReactNode;
  ordenKey?: string;
  /** Activa "Eliminar propiedad" en las filas que declaran su `campo`. */
  entidadTipo?: TipoEntidadPersonalizable;
}) {
  const orden = useOrdenLocal(ordenKey ? `propiedades:${ordenKey}` : undefined);
  const { eliminadas, eliminar, restaurar, puedeAdministrar } = usePropiedadesEliminadas(entidadTipo);
  const [mostrarOcultos, setMostrarOcultos] = useState(false);
  const [mostrarEliminadas, setMostrarEliminadas] = useState(false);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [registrados, setRegistrados] = useState<Array<{ id: string; campo?: string }>>([]);
  const contenedor = useRef<HTMLDivElement>(null);

  const registrar = useCallback((id: string, campo?: string) => {
    setRegistrados((actual) => [...actual.filter((item) => item.id !== id), { id, campo }]);
    return () => setRegistrados((actual) => actual.filter((item) => item.id !== id));
  }, []);

  const visibles = useCallback(() => {
    const filas = Array.from(contenedor.current?.querySelectorAll<HTMLElement>("[data-propiedad-id]") ?? []);
    return filas
      .map((el, i) => ({ id: el.dataset.propiedadId!, pos: Number(el.style.order || 0), i }))
      .sort((a, b) => a.pos - b.pos || a.i - b.i)
      .map(({ id }) => id);
  }, []);

  const contexto = useMemo<ContextoListaPropiedades | null>(
    () => (ordenKey ? {
      orden, mostrarOcultos, arrastrando, setArrastrando, registrar, visibles,
      entidadTipo, eliminadas, puedeAdministrar, mostrarEliminadas, eliminar, restaurar,
    } : null),
    [ordenKey, orden, mostrarOcultos, arrastrando, registrar, visibles, entidadTipo, eliminadas, puedeAdministrar, mostrarEliminadas, eliminar, restaurar]
  );

  const estaEliminada = (campo?: string) => Boolean(entidadTipo && campo && eliminadas.has(campo));
  const totalEliminadas = registrados.filter((item) => estaEliminada(item.campo)).length;
  const ocultos = registrados.filter((item) => !estaEliminada(item.campo) && orden.oculto(item.id)).length;

  return (
    <ListaPropiedadesContext.Provider value={contexto}>
      <div ref={contenedor} className="flex flex-col gap-0.5 border-y border-white/[0.055] py-2">
        {children}
        {contexto && ocultos > 0 && (
          <button
            type="button"
            style={{ order: ORDEN_FINAL_LISTA + 1 }}
            onClick={() => setMostrarOcultos((m) => !m)}
            className="-mx-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/80 sm:-mx-3 sm:px-3"
          >
            {mostrarOcultos ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {mostrarOcultos ? "Esconder las propiedades ocultas" : `${ocultos} propiedad${ocultos === 1 ? "" : "es"} oculta${ocultos === 1 ? "" : "s"}`}
          </button>
        )}
        {contexto && puedeAdministrar && totalEliminadas > 0 && (
          <button
            type="button"
            style={{ order: ORDEN_FINAL_LISTA + 2 }}
            onClick={() => setMostrarEliminadas((m) => !m)}
            className="-mx-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/80 sm:-mx-3 sm:px-3"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {mostrarEliminadas
              ? "Esconder las propiedades eliminadas"
              : `${totalEliminadas} propiedad${totalEliminadas === 1 ? "" : "es"} eliminada${totalEliminadas === 1 ? "" : "s"} · Restaurar`}
          </button>
        )}
      </div>
    </ListaPropiedadesContext.Provider>
  );
}

export function EntityPropertyRow({
  id: idProp,
  icon,
  label,
  children,
  align = "center",
  acciones,
  campo,
  onEliminar,
}: {
  /** Identidad estable para guardar el orden; por defecto la etiqueta. */
  id?: string;
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
  align?: "center" | "start";
  /** Ítems extra del menú "⋯" (editar…), como `DropdownMenuItem`. Van antes de "Ocultar". */
  acciones?: React.ReactNode;
  /**
   * Id de la propiedad NATIVA (el de su columna en la tabla). Con él, y con
   * `entidadTipo` en la lista, el menú ofrece "Eliminar propiedad": se quita
   * para todos y el dato queda guardado, así que se puede restaurar.
   */
  campo?: string;
  /** Propiedades personalizadas: el menú muestra "Eliminar propiedad" y delega la confirmación en quien la pasa. */
  onEliminar?: () => void;
}) {
  const lista = useContext(ListaPropiedadesContext);
  const id = idProp ?? label;
  const fila = useRef<HTMLDivElement>(null);
  const [destino, setDestino] = useState<"antes" | "despues" | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [errorCambio, setErrorCambio] = useState("");
  const registrar = lista?.registrar;
  const campoNativo = lista?.entidadTipo ? campo : undefined;

  useEffect(() => registrar?.(id, campoNativo), [registrar, id, campoNativo]);

  const eliminada = Boolean(campoNativo && lista?.eliminadas.has(campoNativo));
  if (eliminada && !(lista?.mostrarEliminadas && lista.puedeAdministrar)) return null;
  const oculto = !eliminada && (lista?.orden.oculto(id) ?? false);
  if (oculto && !lista?.mostrarOcultos) return null;

  const posicion = lista?.orden.posicion(id);
  const puedeEliminar = Boolean(onEliminar) || Boolean(campoNativo && lista?.puedeAdministrar);
  const conMenu = eliminada || Boolean(lista || acciones || onEliminar);

  async function cambiarEliminada(eliminar: boolean) {
    if (!lista || !campoNativo || procesando) return;
    setProcesando(true);
    setErrorCambio("");
    const resultado = eliminar ? await lista.eliminar(campoNativo) : await lista.restaurar(campoNativo);
    setProcesando(false);
    if (!resultado.ok) {
      setErrorCambio(resultado.error);
      return;
    }
    setConfirmando(false);
  }

  return (
    <>
      <div
        ref={fila}
        data-propiedad-id={lista && !eliminada ? id : undefined}
        style={posicion !== undefined ? { order: posicion + 1 } : lista?.orden.personalizado ? { order: ORDEN_FINAL_LISTA - 1 } : undefined}
        onDragOver={lista?.arrastrando && lista.arrastrando !== id && !eliminada ? (evento) => {
          evento.preventDefault();
          setDestino(soltarDespues(evento) ? "despues" : "antes");
        } : undefined}
        onDragLeave={() => setDestino(null)}
        onDrop={lista?.arrastrando && !eliminada ? (evento) => {
          evento.preventDefault();
          const despues = soltarDespues(evento);
          setDestino(null);
          if (lista.arrastrando) lista.orden.mover(lista.visibles(), lista.arrastrando, id, despues);
          lista.setArrastrando(null);
        } : undefined}
        className={cn(
          "group/property -mx-2 flex min-h-10 flex-col items-stretch gap-1 rounded-md px-2 py-2 transition-colors hover:bg-white/[0.035] sm:-mx-3 sm:flex-row sm:gap-0 sm:px-3 sm:py-1.5",
          align === "start" ? "sm:items-start" : "sm:items-center",
          (oculto || eliminada) && "opacity-45",
          lista?.arrastrando === id && "opacity-40",
          destino === "antes" && "shadow-[inset_0_2px_0_rgba(96,165,250,0.8)]",
          destino === "despues" && "shadow-[inset_0_-2px_0_rgba(96,165,250,0.8)]"
        )}
      >
        <div className="flex w-full shrink-0 items-center gap-2 pr-0 text-[11px] font-medium text-white/65 sm:w-[165px] sm:gap-2.5 sm:pr-4 sm:text-[12px] sm:text-white/80">
          {lista && !eliminada ? (
            <span
              draggable
              title="Arrastrar para reordenar"
              onDragStart={(evento) => {
                evento.dataTransfer.effectAllowed = "move";
                evento.dataTransfer.setData("text/plain", id);
                if (fila.current) evento.dataTransfer.setDragImage(fila.current, 12, 12);
                lista.setArrastrando(id);
              }}
              onDragEnd={() => lista.setArrastrando(null)}
              className="relative flex h-5 w-5 shrink-0 cursor-grab items-center justify-center rounded text-white/70 hover:bg-white/[0.1] active:cursor-grabbing"
            >
              <span className="group-hover/property:opacity-0">{icon}</span>
              <GripVertical className="absolute h-3.5 w-3.5 text-white/60 opacity-0 group-hover/property:opacity-100" />
            </span>
          ) : (
            icon && <span className="shrink-0 text-white/70">{icon}</span>
          )}
          <span className={cn("min-w-0 flex-1 truncate", eliminada && "line-through")}>{label}</span>
          {conMenu && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Opciones de la propiedad"
                  aria-label={`Opciones de ${label}`}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/50 opacity-0 transition-colors hover:bg-white/[0.12] hover:text-white focus:opacity-100 group-hover/property:opacity-100 data-[state=open]:bg-white/[0.12] data-[state=open]:opacity-100"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent data-entity-sheet-portal align="start" className="z-[101] w-52 p-1">
                {eliminada ? (
                  <DropdownMenuItem onSelect={() => void cambiarEliminada(false)} className="gap-2 text-xs">
                    <RotateCcw className="h-3.5 w-3.5" /> Restaurar propiedad
                  </DropdownMenuItem>
                ) : (
                  <>
                    {acciones}
                    {lista && (
                      <DropdownMenuItem onSelect={() => lista.orden.alternarOculto(id)} className="gap-2 text-xs">
                        {oculto ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        {oculto ? "Mostrar en el panel" : "Ocultar en el panel"}
                      </DropdownMenuItem>
                    )}
                    {puedeEliminar && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => (onEliminar ? onEliminar() : setConfirmando(true))}
                          className="gap-2 text-xs text-red-300 focus:bg-red-500/15 focus:text-red-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Eliminar propiedad
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="min-w-0 w-full flex-1 text-[13px] text-white/90">
          {eliminada ? (
            <span className={cn("block py-1 text-[11px]", errorCambio ? "text-red-300" : "text-white/45")}>
              {errorCambio || "Eliminada · el dato se conserva"}
            </span>
          ) : children}
        </div>
      </div>
      {confirmando && lista?.entidadTipo && (
        <DialogoPanel titulo="Eliminar propiedad" onClose={() => { if (!procesando) { setConfirmando(false); setErrorCambio(""); } }}>
          <p className="flex items-start gap-2 text-xs text-red-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Se quitará <strong>«{label}»</strong> de la ficha y de la tabla de{" "}
              {ENTIDADES_PERSONALIZABLES[lista.entidadTipo].plural.toLocaleLowerCase("es-PE")}, para todos los usuarios.
              Los datos no se borran: puedes restaurarla cuando quieras.
            </span>
          </p>
          {errorCambio && <p className="mt-2 text-[11px] text-red-300">{errorCambio}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => { setConfirmando(false); setErrorCambio(""); }} disabled={procesando} className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.08] hover:text-white disabled:opacity-50">Cancelar</button>
            <button type="button" onClick={() => void cambiarEliminada(true)} disabled={procesando} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50">
              {procesando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Sí, eliminar
            </button>
          </div>
        </DialogoPanel>
      )}
    </>
  );
}

export function EntityPropertyValue({ children }: { children?: React.ReactNode }) {
  return <span className="block py-1 text-[13px] text-white/90">{children || "—"}</span>;
}

export function EntitySection({
  icon,
  title,
  description,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-start gap-2.5">
        {icon && <span className="mt-0.5 text-white/60">{icon}</span>}
        <div>
          <h3 className="text-[13px] font-semibold text-white/90">{title}</h3>
          {description && <p className="mt-0.5 text-[11px] leading-relaxed text-white/65">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

const ANCHO_DEFECTO = 680;
const ANCHO_MIN = 420;
const ANCHO_MAX = 980;
const STORAGE_ANCHO_PANEL = "cavala:entity-sheet:ancho";

/** Hay algo abierto encima del panel (los menús de Radix quedan un instante con `data-state="closed"` mientras se animan). */
function hayCapaEncima(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-entity-sheet-portal]")).some(
    (capa) => capa.dataset.state !== "closed"
  );
}

export function EntitySheet({ open, onClose, titulo, tituloEditor, subtitulo, children, historial }: EntitySheetProps) {
  const [ancho, setAncho] = useState(ANCHO_DEFECTO);
  const [montado, setMontado] = useState(false);
  const arrastrando = useRef(false);
  const frameArrastre = useRef<number | null>(null);
  const botonCerrar = useRef<HTMLButtonElement>(null);
  const ventana = useRef<HTMLElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const tituloId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    try {
      const guardado = Number(localStorage.getItem(STORAGE_ANCHO_PANEL));
      if (Number.isFinite(guardado) && guardado >= ANCHO_MIN) {
        setAncho(Math.min(guardado, ANCHO_MAX, window.innerWidth));
      }
    } catch {
      // El panel sigue funcionando con el ancho por defecto si el navegador bloquea el almacenamiento.
    }
    setMontado(true);
  }, []);

  useEffect(() => {
    if (!montado) return;
    try {
      localStorage.setItem(STORAGE_ANCHO_PANEL, String(Math.round(ancho)));
    } catch {
      // El redimensionado no debe fallar si el navegador bloquea el almacenamiento.
    }
  }, [ancho, montado]);

  useEffect(() => {
    if (!open) return;
    focoAnterior.current = document.activeElement as HTMLElement | null;
    const frameFoco = requestAnimationFrame(() => botonCerrar.current?.focus());
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Un menú, selector o diálogo abierto encima del panel (todos llevan
        // `data-entity-sheet-portal`) se cierra con su propio Escape. Antes el
        // mismo Escape cerraba también el panel entero: renombrar una
        // categoría o salir de un desplegable te sacaba de la ficha. Los
        // menús de Radix se cierran antes de que el evento llegue aquí (en
        // captura, y React ya los desmontó), pero marcan `defaultPrevented`.
        if (e.defaultPrevented || hayCapaEncima()) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !ventana.current) return;
      const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const internos = Array.from(ventana.current.querySelectorAll<HTMLElement>(selector));
      const portales = Array.from(document.querySelectorAll<HTMLElement>(`[data-entity-sheet-portal] ${selector}`));
      const enfocables = [...new Set([...internos, ...portales])]
        .filter((elemento) => elemento.getClientRects().length > 0);
      if (enfocables.length === 0) {
        e.preventDefault();
        return;
      }
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener("keydown", onEscape);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frameFoco);
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = overflowAnterior;
      focoAnterior.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!arrastrando.current) return;
      const max = Math.min(ANCHO_MAX, window.innerWidth - 64);
      const siguiente = Math.min(Math.max(window.innerWidth - e.clientX, ANCHO_MIN), max);
      if (frameArrastre.current !== null) cancelAnimationFrame(frameArrastre.current);
      frameArrastre.current = requestAnimationFrame(() => setAncho(siguiente));
    }
    function onUp() {
      if (!arrastrando.current) return;
      arrastrando.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (frameArrastre.current !== null) cancelAnimationFrame(frameArrastre.current);
    };
  }, []);

  function iniciarArrastre(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    arrastrando.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  const contenido = (
    <div
      className={`fixed inset-0 z-[80] transition-opacity duration-200 ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar panel"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={() => {
          // Al cerrarse el selector nativo de archivos, Chrome a veces dispara
          // un click fantasma sobre el fondo al devolver el foco — sin este
          // freno, cerraba el panel entero a mitad de una subida.
          if (selectorArchivoActivo()) return;
          onClose();
        }}
      />
      <section
        ref={ventana}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="absolute inset-y-0 right-0 flex max-w-full"
        style={{ width: `min(100vw, ${ancho}px)` }}
      >
        <div
          onPointerDown={iniciarArrastre}
          onKeyDown={(event) => {
            const maximo = Math.min(ANCHO_MAX, window.innerWidth - 64);
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setAncho((actual) => Math.min(maximo, actual + 24));
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              setAncho((actual) => Math.max(ANCHO_MIN, actual - 24));
            }
          }}
          role="separator"
          aria-label="Cambiar ancho del panel"
          aria-orientation="vertical"
          aria-valuemin={ANCHO_MIN}
          aria-valuemax={ANCHO_MAX}
          aria-valuenow={ancho}
          tabIndex={0}
          title="Arrastra para cambiar el ancho"
          className="group absolute -left-1.5 top-0 z-20 hidden h-full w-3 cursor-col-resize items-center justify-center sm:flex"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#11131c] text-white/35 opacity-0 shadow-glass-sm transition-all group-hover:border-brand-400/35 group-hover:text-brand-300 group-hover:opacity-100">
            <Columns2 className="h-3.5 w-3.5" />
          </div>
        </div>
        <div
          data-entity-sheet-window
          className={`relative flex w-full flex-col overflow-hidden border-l border-white/[0.09] bg-[#0b0d16]/90 text-white/90 shadow-[-24px_0_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl backdrop-saturate-150 transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <button
            ref={botonCerrar}
            type="button"
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar panel"
          className="absolute right-3 top-3 z-20 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-white/70 outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-1 focus-visible:ring-brand-400/60 sm:right-4 sm:top-4 sm:h-8 sm:w-8 sm:rounded-md sm:border-0 sm:bg-transparent"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="scrollbar-glass flex-1 overflow-y-auto">
            <div className="px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pb-12 sm:pt-9">
              <header className="mb-5 sm:mb-8">
                {historial && (
                  <div className="mb-3 -ml-2">
                    <HistorialPanel
                      tabla={historial.tabla}
                      registroId={historial.registroId}
                      titulo={historial.titulo}
                    />
                  </div>
                )}
                <div className="flex items-start gap-3.5 pr-10">
                  <div className="min-w-0 flex-1">
                    {tituloEditor ? (
                      <div id={tituloId} role="heading" aria-level={2}>{tituloEditor}</div>
                    ) : (
                      <h2 id={tituloId} className="break-words text-[22px] font-bold leading-[1.18] tracking-[-0.025em] text-white sm:text-[26px]">
                        {titulo}
                      </h2>
                    )}
                    {subtitulo && <p className="mt-2 text-[13px] leading-relaxed text-white/70">{subtitulo}</p>}
                  </div>
                </div>
              </header>

              <div className="entity-sheet-content space-y-7">{children}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  if (!montado) return null;
  return createPortal(contenido, document.body);
}
