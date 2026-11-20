"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Plus, Trash2, X } from "lucide-react";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";
import { crearRegistro, type ResultadoCrear } from "@/lib/actions/registros";
import { actualizarCampo } from "@/lib/actions/entidades";
import { actualizarValorPropiedadPersonalizada } from "@/lib/actions/propiedades-personalizadas";
import { crearTipoPropietario, eliminarTipoPropietario, listarTiposPropietario } from "@/lib/actions/tipos-propietario";
import type { TipoColumna } from "@/components/ui/records-table";
import { useOpcionesColumna } from "@/components/ui/opciones-columna-cliente";
import { agrupadoPorTitulo, campoAgrupadoDe, tituloInicialEnGrupo } from "@/lib/registros/grupo-nuevo";
import { MATERIA_OPCIONES } from "@/app/(dashboard)/procesos/opciones";
import { TIPO_OPCIONES as TIPO_CONTRATO_OPCIONES } from "@/app/(dashboard)/contratos/opciones";
import { SUSTANCIA_OPCIONES } from "@/app/(dashboard)/entidades/concesiones/opciones";
import { MODALIDAD_OPCIONES } from "@/app/(dashboard)/entidades/personal/opciones";
import { TIPO_PREDIO_OPCIONES } from "@/app/(dashboard)/entidades/predios/opciones";
import { TIPO_PERSONA_OPCIONES } from "@/app/(dashboard)/entidades/propietarios/opciones";

type CampoUI =
  | { campo: string; label: string; tipo: "texto"; requerido?: boolean; max?: number; placeholder?: string }
  | { campo: string; label: string; tipo: "select"; requerido?: boolean; opciones: { value: string; label: string }[] }
  | { campo: string; label: string; tipo: "tipo-creable"; requerido?: boolean; max?: number; opciones: { value: string; label: string }[] };

type ConfigUI = {
  singular: string;
  articulo: "el" | "la" | "un" | "una";
  fichaHref: (id: string) => string;
  tabla: string;
  revalidar: string;
  campos: CampoUI[];
  /** Columnas de la tabla que pueden copiar su valor al registro recién creado. */
  camposAgrupacion: Record<string, string>;
  /** Campo que se muestra como input inline en NuevoEnGrupo (sin modal, sin redirect). */
  campoTitulo?: string;
  /** ID de la columna visual cuando no coincide con el campo de título persistido. */
  columnaTitulo?: string;
  /** Placeholder del input inline de NuevoEnGrupo. */
  placeholderTitulo?: string;
};

const OPC_VACIA = { value: "", label: "Sin especificar" };

/** Estilo crema compartido por el botón "+ Nuevo …", igual al de los botones de filtros. */
export const BOTON_NUEVO_CLASE =
  "view-btn inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-[#eeeadf] px-3.5 text-xs font-semibold text-neutral-800 transition-all duration-200 hover:bg-[#e5e0d4] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";

export const CONFIG_CREAR: Record<string, ConfigUI> = {
  propietarios: {
    singular: "propietario",
    articulo: "un",
    fichaHref: (id) => `/entidades/propietarios/${id}`,
    tabla: "propietarios",
    revalidar: "/entidades/propietarios",
    camposAgrupacion: { nombre: "nombre", es_propio: "es_propio", tipo_persona: "tipo_persona" },
    campoTitulo: "nombre",
    placeholderTitulo: "Nombre o razón social…",
    campos: [
      { campo: "nombre", label: "Nombre", tipo: "texto", requerido: true, max: 240, placeholder: "Nombre o razón social" },
      { campo: "es_propio", label: "TIPO", tipo: "tipo-creable", requerido: true, max: 80, opciones: [{ value: "true", label: "Propio" }, { value: "false", label: "Tercero" }] },
      // Mismas opciones de arranque que la tabla; `SelectCampo` las sustituye por el catálogo editable.
      { campo: "tipo_persona", label: "Tipo de persona", tipo: "select", opciones: [OPC_VACIA, ...TIPO_PERSONA_OPCIONES.map((o) => ({ value: o.value, label: o.label }))] },
    ],
  },
  predios: {
    singular: "predio",
    articulo: "un",
    fichaHref: (id) => `/entidades/predios/${id}`,
    tabla: "predios",
    revalidar: "/entidades/predios",
    camposAgrupacion: {
      nombre: "nombre", n_partida: "n_partida", tipo_predio: "tipo_predio", registrado: "registrado",
      a_nombre_de: "a_nombre_de", ubicacion: "ubicacion", coordenadas: "coordenadas",
      fecha_adquisicion: "fecha_adquisicion", monto_copia_literal: "monto_copia_literal",
      detalles: "detalles", archivador_drive: "archivador_drive", archivador_fisico: "archivador_fisico",
    },
    campoTitulo: "nombre",
    placeholderTitulo: "Nombre del predio…",
    campos: [
      { campo: "nombre", label: "Nombre", tipo: "texto", requerido: true, max: 240 },
      { campo: "tipo_predio", label: "Tipo", tipo: "select", opciones: [OPC_VACIA, ...TIPO_PREDIO_OPCIONES.map((o) => ({ value: o.value, label: o.label }))] },
      { campo: "n_partida", label: "N° de partida", tipo: "texto", max: 120 },
      { campo: "ubicacion", label: "Ubicación", tipo: "texto", max: 240 },
    ],
  },
  vehiculos: {
    singular: "vehículo",
    articulo: "un",
    fichaHref: (id) => `/entidades/vehiculos/${id}`,
    tabla: "vehiculos",
    revalidar: "/entidades/vehiculos",
    camposAgrupacion: {
      placa: "placa", marca_modelo: "marca_modelo", categoria: "categoria", responsable: "responsable",
      soat: "soat_vence", poliza: "poliza_vence", anio: "anio", n_serie: "n_serie",
      n_partida: "n_partida", revision_tecnica: "revision_tecnica", detalle: "detalle",
      archivador_drive: "archivador_drive", archivador_fisico: "archivador_fisico",
    },
    campoTitulo: "placa",
    placeholderTitulo: "Placa o N° de serie…",
    campos: [
      { campo: "placa", label: "Placa o N° de serie", tipo: "texto", requerido: true, max: 40 },
      { campo: "marca_modelo", label: "Marca / modelo", tipo: "texto", max: 120 },
      { campo: "categoria", label: "Categoría", tipo: "texto", max: 80, placeholder: "Línea amarilla, vehículo pesado…" },
    ],
  },
  concesiones_mineras: {
    singular: "concesión",
    articulo: "una",
    fichaHref: (id) => `/entidades/concesiones/${id}`,
    tabla: "concesiones_mineras",
    revalidar: "/entidades/concesiones",
    camposAgrupacion: {
      nombre: "nombre", codigo: "codigo", sustancia: "sustancia", hectareas: "hectareas",
      estado: "estado", ubicacion: "ubicacion", url_ubicacion: "url_ubicacion",
    },
    campoTitulo: "nombre",
    placeholderTitulo: "Nombre de la concesión…",
    campos: [
      { campo: "nombre", label: "Nombre", tipo: "texto", requerido: true, max: 240 },
      { campo: "codigo", label: "Código", tipo: "texto", max: 80 },
      // Mismas opciones de arranque que la tabla; `SelectCampo` las sustituye por el catálogo editable.
      { campo: "sustancia", label: "Sustancia", tipo: "select", opciones: [OPC_VACIA, ...SUSTANCIA_OPCIONES.map((o) => ({ value: o.value, label: o.label }))] },
    ],
  },
  personal: {
    singular: "registro de personal",
    articulo: "un",
    fichaHref: (id) => `/entidades/personal/${id}`,
    tabla: "personal",
    revalidar: "/entidades/personal",
    camposAgrupacion: {
      nombre: "nombre", cargo: "cargo", modalidad: "modalidad", activo: "activo",
      contrato_fin: "contrato_fin", correo: "correo", contrato_inicio: "contrato_inicio", firmado: "firmado",
    },
    campoTitulo: "nombre",
    placeholderTitulo: "Nombre del empleado…",
    campos: [
      { campo: "nombre", label: "Nombre", tipo: "texto", requerido: true, max: 240 },
      { campo: "cargo", label: "Cargo", tipo: "texto", max: 120 },
      { campo: "modalidad", label: "Modalidad", tipo: "select", opciones: [OPC_VACIA, ...MODALIDAD_OPCIONES.map((o) => ({ value: o.value, label: o.label }))] },
    ],
  },
  oficinas_registrales: {
    singular: "oficina registral",
    articulo: "una",
    fichaHref: (id) => `/entidades/oficinas/${id}`,
    tabla: "oficinas_registrales",
    revalidar: "/entidades/oficinas",
    camposAgrupacion: {},
    campoTitulo: "nombre",
    columnaTitulo: "oficina",
    placeholderTitulo: "Nombre de la oficina registral…",
    campos: [
      { campo: "nombre", label: "Nombre", tipo: "texto", requerido: true, max: 240 },
    ],
  },
  procesos: {
    singular: "proceso",
    articulo: "un",
    fichaHref: (id) => `/procesos/${id}`,
    tabla: "procesos",
    revalidar: "/procesos",
    camposAgrupacion: {
      expediente: "expediente", materia: "materia", estado: "estado", abogado: "abogado",
      estudio: "estudio", diligencia: "diligencia", descripcion: "descripcion",
    },
    campoTitulo: "expediente",
    placeholderTitulo: "N° de expediente…",
    campos: [
      { campo: "materia", label: "Materia", tipo: "select", requerido: true, opciones: MATERIA_OPCIONES.map((o) => ({ value: o.value, label: o.label })) },
      { campo: "expediente", label: "N° de expediente", tipo: "texto", max: 120, placeholder: "Opcional" },
      { campo: "asunto", label: "Asunto", tipo: "texto", max: 400 },
    ],
  },
  contratos: {
    singular: "contrato",
    articulo: "un",
    fichaHref: (id) => `/contratos/${id}`,
    tabla: "contratos",
    revalidar: "/contratos",
    camposAgrupacion: {
      nombre: "nombre", tipo: "tipo", estado: "estado", inicio: "fecha_inicio", plazo: "plazo",
      legalizado: "legalizado",
    },
    campoTitulo: "nombre",
    placeholderTitulo: "Nombre del contrato…",
    campos: [
      { campo: "tipo", label: "Tipo", tipo: "select", requerido: true, opciones: TIPO_CONTRATO_OPCIONES.map((o) => ({ value: o.value, label: o.label })) },
      { campo: "nombre", label: "Nombre", tipo: "texto", requerido: true, max: 240 },
      { campo: "moneda", label: "Moneda", tipo: "select", opciones: [{ value: "PEN", label: "S/ Soles" }, { value: "USD", label: "US$ Dólares" }] },
    ],
  },
  documentos: {
    singular: "documento",
    articulo: "un",
    fichaHref: (id) => `/documentos/${id}`,
    tabla: "documentos",
    revalidar: "/documentos",
    camposAgrupacion: { tipo: "tipo", fecha: "fecha", detalle: "detalle", resumen: "detalle" },
    campoTitulo: "nombre",
    placeholderTitulo: "Nombre del documento…",
    campos: [
      { campo: "nombre", label: "Nombre", tipo: "texto", requerido: true, max: 240 },
    ],
  },
};

function crearValoresIniciales(config: ConfigUI): Record<string, string> {
  const valores: Record<string, string> = {};

  for (const campo of config.campos) {
    if ((campo.tipo === "select" || campo.tipo === "tipo-creable") && campo.requerido && campo.opciones[0]) {
      valores[campo.campo] = campo.opciones[0].value;
    }
  }

  return valores;
}

function TipoCreableField({
  id,
  label,
  value,
  opciones,
  max,
  onChange,
  onCreateOption,
  onDeleteOption,
  cargandoOpciones,
}: {
  id: string;
  label: string;
  value: string;
  opciones: { value: string; label: string; personalizadoId?: string }[];
  max?: number;
  onChange: (value: string) => void;
  onCreateOption: (value: string) => Promise<{ ok: true; value: string } | { ok: false; error: string }>;
  onDeleteOption: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  cargandoOpciones?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [guardandoOpcion, setGuardandoOpcion] = useState(false);
  const [eliminandoOpcion, setEliminandoOpcion] = useState<string | null>(null);
  const [opcionAEliminar, setOpcionAEliminar] = useState<{ id: string; value: string; label: string } | null>(null);
  const [errorOpcion, setErrorOpcion] = useState<string | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const menuId = `${id}-opciones`;
  const opcionActual = opciones.find((opcion) => opcion.value === value);
  const esPersonalizado = Boolean(value) && !opcionActual;

  useEffect(() => {
    if (!abierto) return;

    function cerrarAlPulsarFuera(e: MouseEvent) {
      if (!contenedorRef.current?.contains(e.target as Node)) {
        setAbierto(false);
        setCreando(false);
        setBorrador("");
        setOpcionAEliminar(null);
      }
    }

    document.addEventListener("mousedown", cerrarAlPulsarFuera);
    return () => document.removeEventListener("mousedown", cerrarAlPulsarFuera);
  }, [abierto]);

  function elegir(siguiente: string) {
    onChange(siguiente);
    setAbierto(false);
    setCreando(false);
    setBorrador("");
    setOpcionAEliminar(null);
  }

  async function confirmarOtroTipo() {
    const nuevoTipo = borrador.trim().replace(/\s+/g, " ");
    if (!nuevoTipo) return;

    const existente = opciones.find(
      (opcion) => opcion.label.toLocaleLowerCase("es-PE") === nuevoTipo.toLocaleLowerCase("es-PE")
    );
    if (existente) {
      elegir(existente.value);
      return;
    }

    setGuardandoOpcion(true);
    setErrorOpcion(null);
    let resultado: Awaited<ReturnType<typeof onCreateOption>>;
    try {
      resultado = await onCreateOption(nuevoTipo);
    } catch {
      setGuardandoOpcion(false);
      setErrorOpcion("No se pudo conectar con el servidor");
      return;
    }
    setGuardandoOpcion(false);
    if (!resultado.ok) {
      setErrorOpcion(resultado.error);
      return;
    }
    elegir(resultado.value);
  }

  async function eliminarOpcion(id: string, valorOpcion: string) {
    setEliminandoOpcion(id);
    setErrorOpcion(null);
    let resultado: Awaited<ReturnType<typeof onDeleteOption>>;
    try {
      resultado = await onDeleteOption(id);
    } catch {
      setEliminandoOpcion(null);
      setErrorOpcion("No se pudo conectar con el servidor");
      return;
    }
    setEliminandoOpcion(null);
    if (!resultado.ok) {
      setErrorOpcion(resultado.error);
      return;
    }
    setOpcionAEliminar(null);
    if (value === valorOpcion) onChange("");
  }

  return (
    <div ref={contenedorRef} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? menuId : undefined}
        aria-label={label}
        onClick={() => {
          setAbierto((actual) => !actual);
          setCreando(false);
          setBorrador("");
          setOpcionAEliminar(null);
        }}
        className="view-control flex h-9 w-full items-center justify-between gap-2 text-left"
      >
        <span className={value ? "text-neutral-800" : "text-neutral-400"}>
          {(opcionActual?.label ?? value) || "Selecciona un tipo"}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div id={menuId} role="listbox" aria-label={`Opciones de ${label}`} className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-neutral-300 bg-[#f7f4eb] p-1 shadow-sm">
          {opciones.map((opcion) => {
            const seleccionada = opcion.value === value;
            return (
              <div key={opcion.value}>
                <div
                  className={`group flex w-full items-center rounded-lg transition-colors ${
                    seleccionada ? "bg-neutral-200 text-neutral-900" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  }`}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={seleccionada}
                    onClick={() => elegir(opcion.value)}
                    className="flex min-w-0 flex-1 items-center justify-between px-2.5 py-2 text-left text-xs"
                  >
                    <span className="truncate">{opcion.label}</span>
                    {seleccionada && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                  </button>
                  {opcion.personalizadoId && (
                    <button
                      type="button"
                      title={`Eliminar ${opcion.label}`}
                      aria-label={`Eliminar tipo ${opcion.label}`}
                      disabled={eliminandoOpcion === opcion.personalizadoId}
                      onClick={(e) => {
                        e.stopPropagation();
                        setErrorOpcion(null);
                        setOpcionAEliminar({ id: opcion.personalizadoId!, value: opcion.value, label: opcion.label });
                      }}
                      className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-red-500 opacity-0 transition-all hover:bg-red-100 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {opcionAEliminar && opcionAEliminar.id === opcion.personalizadoId && (
                  <div className="m-1 rounded-lg border border-red-300 bg-red-50 p-2.5">
                    <p className="text-xs font-medium text-red-700">¿Eliminar “{opcionAEliminar.label}”?</p>
                    <p className="mt-1 text-[10px] leading-4 text-red-600/80">
                      Ya no aparecerá en el desplegable. Los propietarios que lo usaron conservarán este tipo.
                    </p>
                    <div className="mt-2 flex justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={eliminandoOpcion === opcionAEliminar.id}
                        onClick={() => setOpcionAEliminar(null)}
                        className="rounded-md px-2 py-1 text-[10px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={eliminandoOpcion === opcionAEliminar.id}
                        onClick={() => void eliminarOpcion(opcionAEliminar.id, opcionAEliminar.value)}
                        className="flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-500/25 disabled:opacity-50"
                      >
                        {eliminandoOpcion === opcionAEliminar.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {cargandoOpciones && (
            <div className="flex items-center gap-2 px-2.5 py-2 text-[11px] text-neutral-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando tipos…
            </div>
          )}

          {esPersonalizado && (
            <button
              type="button"
              role="option"
              aria-selected="true"
              onClick={() => elegir(value)}
              className="flex w-full items-center justify-between rounded-lg bg-neutral-200 px-2.5 py-2 text-left text-xs text-neutral-900"
            >
              <span className="truncate">{value}</span>
              <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" />
            </button>
          )}

          {errorOpcion && !creando && (
            <p className="px-2.5 py-1.5 text-[11px] text-red-600">{errorOpcion}</p>
          )}

          <div className="my-1 border-t border-neutral-200" />
          {creando ? (
            <div className="flex flex-wrap items-center gap-1 p-1">
              <div className="relative min-w-0 flex-1">
                <Plus className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                <input
                  autoFocus
                  aria-label={`Nuevo valor para ${label}`}
                  maxLength={max}
                  placeholder="Escribe el nuevo tipo"
                  value={borrador}
                  onChange={(e) => setBorrador(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void confirmarOtroTipo();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setCreando(false);
                      setBorrador("");
                    }
                  }}
                  className="view-control h-8 pl-8"
                />
              </div>
              <button
                type="button"
                aria-label="Agregar nuevo tipo"
                disabled={!borrador.trim() || guardandoOpcion}
                onClick={() => void confirmarOtroTipo()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-700 hover:bg-brand-500/25 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {guardandoOpcion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                aria-label="Cancelar nuevo tipo"
                disabled={guardandoOpcion}
                onClick={() => {
                  setCreando(false);
                  setBorrador("");
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              {errorOpcion && <p className="basis-full px-1 pt-1 text-[11px] text-red-600">{errorOpcion}</p>}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setCreando(true);
                setErrorOpcion(null);
              }}
              className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-brand-700"
            >
              <Plus className="h-3.5 w-3.5" /> Otro tipo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CrearRegistro({
  clave,
  className,
  valoresIniciales,
  camposOcultos = [],
  trigger,
  onCreado,
  anclarA,
}: {
  clave: string;
  className?: string;
  /** Valores fijados por el contexto, por ejemplo el tipo de la familia abierta. */
  valoresIniciales?: Record<string, string>;
  camposOcultos?: string[];
  /** Reemplaza el botón por defecto por un disparador propio (fila de grupo, menú…). */
  trigger?: (abrir: () => void) => React.ReactNode;
  /** Cuando se pasa, no navega a la ficha nueva: se invoca con el id creado (p. ej. para vincularlo) y el formulario se cierra en su lugar. */
  onCreado?: (id: string) => void | Promise<void>;
  /** Elemento contra el que se posiciona el panel; por defecto, el propio contenedor del disparador. Útil cuando `trigger` no renderiza nada visible (p. ej. se invoca `abrir()` desde otro botón). */
  anclarA?: React.RefObject<HTMLElement | null>;
}) {
  const rol = useAcceso(clave);
  const router = useRouter();
  const config = CONFIG_CREAR[clave];
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [tiposPropietario, setTiposPropietario] = useState<{ id: string; nombre: string }[]>([]);
  const [cargandoTipos, setCargandoTipos] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posicion, setPosicion] = useState<{ top: number; right: number } | null>(null);
  const [montado, setMontado] = useState(false);
  const tituloModalId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!abierto || clave !== "propietarios") return;
    let vigente = true;
    setCargandoTipos(true);
    void listarTiposPropietario().then((resultado) => {
      if (!vigente) return;
      if (resultado.ok) setTiposPropietario(resultado.tipos);
      setCargandoTipos(false);
    });
    return () => {
      vigente = false;
    };
  }, [abierto, clave]);

  useEffect(() => {
    if (!abierto) return;
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && !guardando) cerrar();
    }
    function onOutside(event: PointerEvent) {
      const t = event.target as Node;
      if (!guardando && !rootRef.current?.contains(t) && !panelRef.current?.contains(t)) cerrar();
    }
    document.addEventListener("keydown", onEscape);
    document.addEventListener("pointerdown", onOutside);
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("pointerdown", onOutside);
    };
  }, [abierto, guardando]);

  // Anclado a un "+" cerca del borde inferior (p. ej. "Contratos de Personal"
  // al fondo de la ficha), el panel se salía de la pantalla y el botón
  // "Crear" quedaba inalcanzable: si no cabe debajo, se sube lo necesario.
  useLayoutEffect(() => {
    const panelActual = panelRef.current;
    if (!abierto || !posicion || !panelActual) return;
    const margen = 8;
    const alto = panelActual.getBoundingClientRect().height;
    const topMaximo = Math.max(margen, window.innerHeight - alto - margen);
    if (posicion.top > topMaximo) setPosicion({ ...posicion, top: topMaximo });
  }, [abierto, posicion]);

  if (!config || !puedeEscribir(rol)) return null;

  function cerrar() {
    setAbierto(false);
    setValores({});
    setError(null);
  }

  function abrir() {
    const ancla = anclarA?.current ?? rootRef.current;
    if (ancla) {
      const r = ancla.getBoundingClientRect();
      setPosicion({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setValores({ ...crearValoresIniciales(config), ...valoresIniciales });
    setError(null);
    setAbierto(true);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    let resultado: ResultadoCrear;
    try {
      resultado = await crearRegistro(clave, valores);
    } catch {
      setGuardando(false);
      setError("No se pudo conectar con el servidor");
      return;
    }
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    cerrar();
    if (onCreado) {
      await onCreado(resultado.id);
      router.refresh();
      return;
    }
    router.push(config.fichaHref(resultado.id));
    router.refresh();
  }

  const faltanRequeridos = config.campos.some(
    (c) => c.requerido && !(valores[c.campo] ?? "").trim()
  );

  const panel = abierto && posicion && (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={tituloModalId}
      data-entity-sheet-portal
      style={{ top: posicion.top, right: posicion.right }}
      className="light-panel fixed z-[101] max-h-[calc(100vh-16px)] w-[300px] overflow-y-auto rounded-xl border border-[#d9d4c8] bg-[#eeeadf] p-3.5 shadow-sm"
    >
      <form onSubmit={enviar}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={tituloModalId} className="text-[12px] font-semibold text-neutral-900">
            Nuevo {config.singular}
          </h2>
          <button
            type="button"
            onClick={cerrar}
            disabled={guardando}
            aria-label="Cerrar formulario"
            className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-200/70 hover:text-neutral-700 disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-2.5">
          {config.campos.filter((c) => !camposOcultos.includes(c.campo)).map((c) => {
            const controlId = `nuevo-${clave}-${c.campo}`;
            return (
              <div key={c.campo}>
              <label htmlFor={controlId} className="mb-1 block text-[11px] font-medium text-neutral-500">
                {c.label}
                {c.requerido && <span className="text-red-600"> *</span>}
              </label>
              {c.tipo === "select" ? (
                <SelectCampo
                  id={controlId}
                  tabla={config.tabla}
                  campo={c.campo}
                  opciones={c.opciones}
                  value={valores[c.campo] ?? ""}
                  onChange={(valor) => setValores((v) => ({ ...v, [c.campo]: valor }))}
                />
              ) : c.tipo === "tipo-creable" ? (
                <TipoCreableField
                  id={controlId}
                  label={c.label}
                  value={valores[c.campo] ?? ""}
                  opciones={[
                    ...c.opciones,
                    ...tiposPropietario
                      .filter((tipo) => !c.opciones.some((opcion) => opcion.label.toLocaleLowerCase("es-PE") === tipo.nombre.toLocaleLowerCase("es-PE")))
                      .map((tipo) => ({ value: tipo.nombre, label: tipo.nombre, personalizadoId: tipo.id })),
                  ]}
                  max={c.max}
                  onChange={(value) => setValores((actual) => ({ ...actual, [c.campo]: value }))}
                  cargandoOpciones={cargandoTipos}
                  onCreateOption={async (nuevoTipo) => {
                    const resultado = await crearTipoPropietario(nuevoTipo);
                    if (!resultado.ok) return resultado;
                    setTiposPropietario((actuales) =>
                      actuales.some((tipo) => tipo.id === resultado.tipo.id)
                        ? actuales
                        : [...actuales, resultado.tipo].sort((a, b) => a.nombre.localeCompare(b.nombre, "es-PE"))
                    );
                    router.refresh();
                    return { ok: true, value: resultado.tipo.nombre };
                  }}
                  onDeleteOption={async (id) => {
                    const resultado = await eliminarTipoPropietario(id);
                    if (!resultado.ok) return resultado;
                    setTiposPropietario((actuales) => actuales.filter((tipo) => tipo.id !== id));
                    router.refresh();
                    return { ok: true };
                  }}
                />
              ) : (
                <input
                  id={controlId}
                  autoFocus={c === config.campos[0]}
                  className="view-control h-9"
                  maxLength={c.max}
                  placeholder={c.placeholder}
                  value={valores[c.campo] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [c.campo]: e.target.value }))}
                />
              )}
              </div>
            );
          })}
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 px-2.5 py-2 text-[11px] text-red-700">
            {error}
          </p>
        )}

        <div className="mt-3.5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={cerrar}
            disabled={guardando}
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-800 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando || faltanRequeridos}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-[11px] font-semibold text-[#eeeadf] transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Crear {config.singular}
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div ref={rootRef} className="relative inline-block">
      {trigger ? (
        trigger(abrir)
      ) : (
        <button
          type="button"
          onClick={abrir}
          className={className ?? BOTON_NUEVO_CLASE}
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo {config.singular}
        </button>
      )}
      {montado && panel && createPortal(panel, document.body)}
    </div>
  );
}

/**
 * Desplegable del alta. Si la columna tiene catálogo editable
 * (`opciones_columna`: materia de procesos, tipo y moneda de contratos), sus
 * opciones salen de ahí —con los nombres que se les hayan puesto y las que se
 * hayan agregado—, igual que la pastilla de la tabla. Si no, las del código.
 */
function SelectCampo({
  id,
  tabla,
  campo,
  opciones,
  value,
  onChange,
}: {
  id: string;
  tabla: string;
  campo: string;
  opciones: { value: string; label: string }[];
  value: string;
  onChange: (valor: string) => void;
}) {
  const base = useMemo(() => opciones.map((opcion) => ({ ...opcion, className: "" })), [opciones]);
  const efectivas = useOpcionesColumna(tabla, campo, base);
  // Una opción vacía ("Sin especificar") no vive en el catálogo: se conserva al frente.
  const vacia = opciones.find((opcion) => opcion.value === "");
  const lista = vacia && !efectivas.some((opcion) => opcion.value === "") ? [vacia, ...efectivas] : efectivas;
  return (
    <select id={id} className="view-control h-9" value={value} onChange={(e) => onChange(e.target.value)}>
      {lista.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export type GrupoNuevo = {
  /** Columna por la que está agrupada la tabla; null en grupos personalizados. */
  columnId: string | null;
  /** Valor crudo del grupo (vacío en "Sin valor"). */
  valor: string;
  /** Valor real del registro de referencia (booleano, fecha ISO, número, etc.). */
  valorCreacion?: unknown;
  tipo?: TipoColumna;
  etiqueta: string;
  /** Pares campo→valor calculados por preFillParaGrupo de la columna. */
  preFill?: Record<string, unknown>;
  propiedadPersonalizada?: { id: string; valor: unknown };
  /** Permite colocar la fila nueva en un grupo manual una vez conocido su ID. */
  onCreando?: (idTemporal: string, valores: Record<string, unknown>, asignadoAlGrupo?: boolean) => void;
  onCreado?: (id: string, valores: Record<string, unknown>, asignadoAlGrupo?: boolean, idTemporal?: string) => void;
  onCancelarCreacion?: (idTemporal: string) => void;
};

/**
 * Fila "+ Nuevo …" al pie de cada grupo, estilo Notion:
 * muestra un input inline, crea el registro en el grupo y refresca sin navegar.
 */
export function NuevoEnGrupo({
  clave,
  grupo,
  valoresBase,
}: {
  clave: string;
  grupo: GrupoNuevo;
  valoresBase?: Record<string, unknown>;
}) {
  const acceso = useAcceso(clave);
  const config = CONFIG_CREAR[clave];
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const guardandoRef = useRef(false);

  // Al abrir el input se selecciona lo que traiga: si viene con el nombre del
  // grupo (agrupado por título), escribir encima lo reemplaza.
  useEffect(() => {
    if (!editando) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editando]);

  // El botón vive bajo cada grupo sin excepción — ni siquiera al agrupar por
  // la columna de título — y también cuando la columna agrupada no tiene forma
  // de precargarse en el registro nuevo (p. ej. una relación como
  // "Propietarios" en Vehículos, sin campo propio en la tabla): el registro
  // simplemente se crea sin asignar ese valor, en vez de esconder el botón.
  // Las reglas viven en `lib/registros/grupo-nuevo.ts`, con sus pruebas.
  if (!config || !puedeEscribir(acceso)) return null;

  const porTitulo = agrupadoPorTitulo(config, grupo.columnId);

  function abrirInput() {
    setError(null);
    setTexto(tituloInicialEnGrupo(config!, grupo));
    setEditando(true);
  }

  function construirValores(): Record<string, unknown> {
    const base = crearValoresIniciales(config!);
    const resultado: Record<string, unknown> = { ...base, ...(valoresBase ?? {}) };
    // preFill de la columna tiene prioridad sobre la heurística campo→valor
    if (grupo.preFill) {
      Object.assign(resultado, grupo.preFill);
    } else if (!porTitulo) {
      const campoGrupo = config!.campos.find((d) => d.campo === grupo.columnId);
      if (campoGrupo && grupo.valor.trim()) {
        resultado[campoGrupo.campo] = normalizarValorGrupo(grupo.valorCreacion ?? grupo.valor, grupo.tipo);
      }
    }
    // Al agrupar por título el nombre del grupo llega precargado en el input:
    // lo que la persona deje escrito es el título, igual o distinto al grupo.
    if (config!.campoTitulo && texto.trim()) {
      resultado[config!.campoTitulo] = texto.trim();
    }
    return resultado;
  }

  async function guardar() {
    if (guardandoRef.current) return;
    if (!texto.trim()) { cancelar(); return; }
    guardandoRef.current = true;
    setGuardando(true);
    setError(null);
    const valores = construirValores();
    const campoAgrupado = campoAgrupadoDe(config!, grupo.columnId);
    const valorAgrupado = campoAgrupado && grupo.valor
      ? normalizarValorGrupo(grupo.valorCreacion ?? grupo.valor, grupo.tipo)
      : undefined;
    const valoresOptimistas = { ...valores };
    if (campoAgrupado && grupo.valor) valoresOptimistas[campoAgrupado] = valorAgrupado;
    const idTemporal = `temporal-${crypto.randomUUID()}`;
    // Al agrupar por título la fila no se fuerza al grupo donde se pulsó "+":
    // cae en el grupo de su propio nombre, que es el mismo si no lo cambiaron.
    grupo.onCreando?.(idTemporal, valoresOptimistas, !porTitulo);
    setTexto("");
    setEditando(false);
    let resultado: ResultadoCrear | null = null;
    let valoresCreados: Record<string, unknown> = valoresOptimistas;
    try {
      resultado = await crearRegistro(clave, valores);
      if (resultado.ok) {
        valoresCreados = { ...valoresOptimistas, ...resultado.registro };
        if (campoAgrupado && grupo.valor && !Object.prototype.hasOwnProperty.call(valores, campoAgrupado)) {
          const actualizacion = await actualizarCampo(
            config!.tabla,
            resultado.id,
            campoAgrupado,
            valorAgrupado,
            config!.revalidar
          );
          if ("error" in actualizacion) {
            throw new Error(actualizacion.error);
          }
          valoresCreados[campoAgrupado] = valorAgrupado;
        }
        if (grupo.propiedadPersonalizada && grupo.valor) {
          const actualizacion = await actualizarValorPropiedadPersonalizada(
            grupo.propiedadPersonalizada.id,
            resultado.id,
            grupo.propiedadPersonalizada.valor
          );
          if (!actualizacion.ok) throw new Error(actualizacion.error);
        }
      }
    } catch {
      setError(resultado?.ok ? "El registro se creó, pero no se pudo asignar al grupo" : "No se pudo conectar");
      setGuardando(false);
      guardandoRef.current = false;
      if (resultado?.ok) {
        grupo.onCreado?.(resultado.id, valoresCreados, false, idTemporal);
        router.refresh();
      } else {
        grupo.onCancelarCreacion?.(idTemporal);
      }
      return;
    }
    guardandoRef.current = false;
    setGuardando(false);
    if (!resultado || !resultado.ok) {
      // El servidor la rechazó: la fila optimista no debe quedarse en la tabla.
      grupo.onCancelarCreacion?.(idTemporal);
      setError(resultado?.error ?? "No se pudo crear el registro");
      return;
    }
    grupo.onCreado?.(resultado.id, valoresCreados, !porTitulo, idTemporal);
    setError(null);
    router.refresh();
  }

  function cancelar() {
    if (guardandoRef.current) return;
    setTexto("");
    setEditando(false);
    setError(null);
  }

  if (!editando) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={guardando}
          onClick={abrirInput}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-white/35 transition-colors hover:bg-white/[0.045] hover:text-white/80 disabled:cursor-wait disabled:opacity-60"
        >
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {guardando ? "Guardando…" : `Nuevo ${config.singular}`}
        </button>
        {error && <span className="text-[10px] text-red-300">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-0.5 pl-1">
      <input
        ref={inputRef}
        aria-label={config.placeholderTitulo ?? `Nombre del ${config.singular}`}
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setError(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); guardar(); }
          if (e.key === "Escape") cancelar();
        }}
        onBlur={() => { if (!guardandoRef.current) cancelar(); }}
        placeholder={config.placeholderTitulo ?? `Nombre del ${config.singular}…`}
        disabled={guardando}
        maxLength={240}
        className="h-7 flex-1 rounded-md border border-white/15 bg-white/[0.05] px-2.5 text-[12px] text-white placeholder-white/35 outline-none focus:border-brand-400/50 focus:ring-1 focus:ring-brand-400/25 disabled:opacity-50"
      />
      {guardando
        ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/40" />
        : <span className="text-[10px] text-white/30">↵ crear · Esc cancelar</span>}
      {error && <span className="text-[10px] text-red-300">{error}</span>}
    </div>
  );
}

function normalizarValorGrupo(valor: unknown, tipo?: GrupoNuevo["tipo"]): unknown {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (tipo === "booleano" && typeof valor === "string") {
    if (valor === "Sí") return true;
    if (valor === "No") return false;
  }
  return valor;
}
