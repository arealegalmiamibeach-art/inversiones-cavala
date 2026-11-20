"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { marcarNavegando } from "@/components/layout/route-transition-overlay";
import {
  AlertTriangle, Archive, ArrowLeft, Banknote, Briefcase, Building, Building2, Car, ChevronRight,
  CreditCard, Download, Eye, EyeOff, FileBox, FileKey2, FileSignature, FileText, FolderPlus, Gavel, Gem, GripVertical,
  HandCoins, Handshake, Landmark, LayoutGrid, Link2, Loader2, Map, MapPin, Maximize2, MoreHorizontal, Paperclip, Pencil, Plus, ScrollText, Search, ShieldCheck,
  Trash2, Unlink, UploadCloud, User, UserCheck, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";
import {
  canPreview,
  DeleteFileButton,
  EntityFileBlocks,
  evitarCierrePorSelectorDeArchivo,
  FilePreviewDesnuda,
  SubirArchivos,
  SubirConCarpeta,
  WindowAction,
  type Archivo,
  type EntityFileBlocksHandle,
} from "@/components/ui/file-preview";
import { useSubidas } from "@/components/ui/subidas-globales";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRowsIn } from "@/lib/supabase/fetch-all";
import { crearDocumentoEnCategoria, eliminarDocumento } from "@/lib/actions/documentos";
import { crearCarpetaDocumento, eliminarCarpetaVacia } from "@/lib/actions/carpetas";
import { desvincularRelacion, vincularRelacion } from "@/lib/actions/vinculos";
import { crearTipoDocumento, eliminarTipoDocumento, renombrarTipoDocumento } from "@/app/(dashboard)/documentos/tipos-custom";
import { CrearRegistro } from "@/components/ui/crear-registro";
import { DialogoPanel, SelectorValorRelacion, type FiltroRelacion } from "@/components/ui/propiedades-personalizadas";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useOpcionesColumna } from "@/components/ui/opciones-columna-cliente";
import { TrianguloDesplegable } from "@/components/ui/triangulo-desplegable";
import type { OpcionPill } from "@/components/ui/property-pill";
import { MATERIA_OPCIONES } from "@/app/(dashboard)/procesos/opciones";
import { materiaInfo } from "@/lib/procesos/materias";
import { useArrastreOrden, useOrdenLocal, type ArrastreOrden } from "@/lib/orden-local";
import {
  ENTIDADES_PERSONALIZABLES,
  esTipoEntidadPersonalizable,
  type TipoEntidadPersonalizable,
} from "@/lib/propiedades/personalizadas";
import {
  cargarCategoriasEntidad,
  CONTRATO_FALLBACK,
  CONTRATO_MUTUO_GENERICO,
  CONTRATO_TIPOS,
  DOCUMENTO_FALLBACK,
  DOCUMENTO_TIPOS,
  type CategoriaGrupo,
  type ColumnaCategoria,
  type FilaCategoria,
} from "@/lib/relaciones/agrupar";

/** Clave de alta rápida (`CrearRegistro`) por tipo de entidad relacionable — difiere del singular en algunos casos (concesión, oficina registral). */
const CLAVE_CREAR_POR_RELACION: Partial<Record<TipoEntidadPersonalizable, string>> = {
  propietario: "propietarios",
  predio: "predios",
  vehiculo: "vehiculos",
  concesion: "concesiones_mineras",
  personal: "personal",
  oficina_registral: "oficinas_registrales",
  proceso: "procesos",
  contrato: "contratos",
};

const ICONOS: Record<string, LucideIcon> = {
  User, Car, MapPin, Gem, UserCheck, Gavel, FileText, ScrollText, FileKey2, Users,
  FileSignature, AlertTriangle, Building2, Archive, Landmark, Map, FileBox,
  CreditCard, ShieldCheck, Briefcase, Handshake, Building, HandCoins, Wallet, Banknote, Paperclip,
};

// ─── Catálogo de "Relacionar con" ───────────────────────────────────────────
// El selector no se limita a lo que la ficha ya tiene: ofrece TODO lo
// relacionable (entidades, contratos y cada carpeta de documentos), agrupado
// en desplegables porque la lista completa es larga.

/** Una hoja del catálogo: qué se eligió y qué hacer después. */
type OpcionRelacion = {
  clave: string;
  titulo: string;
  /** Nombre de ícono de `ICONOS`, o el componente directo (las materias traen el suyo del catálogo). */
  icono: string | LucideIcon;
  /** Título del paso siguiente y del selector cuando difiere del de la opción (p. ej. "Procesos judiciales · Civil"). */
  tituloSelector?: string;
  /**
   * Secciones de la ficha que corresponden a esta opción: de ahí sale el
   * total que se ve al lado y lo que ya está vinculado (para no ofrecerlo de
   * nuevo). Un contrato mutuo, por ejemplo, vive repartido en tres secciones.
   */
  categorias: string[];
  /** Acota la opción a una familia del destino: filtra el selector y el conteo (por `FilaCategoria.clasificacion`). */
  filtro?: FiltroRelacion;
  destino:
    | {
        tipo: "registro";
        relacionTipo: TipoEntidadPersonalizable;
        /** Valores fijos del alta rápida (la materia o el tipo de la opción elegida). */
        valoresCrear?: Record<string, string>;
      }
    | { tipo: "documento"; tipoDocumento: string };
};

type GrupoRelacion = { id: string; titulo: string; icono: string; opciones: OpcionRelacion[] };

/**
 * Entidades vinculables, en el orden del sidebar. Los procesos no van aquí:
 * como en el sidebar, tienen su propio grupo ("Procesos judiciales"),
 * desglosado por materia.
 */
const ENTIDADES_RELACIONABLES: TipoEntidadPersonalizable[] = [
  "propietario", "predio", "vehiculo", "concesion", "personal", "oficina_registral",
];

const ICONO_ENTIDAD: Record<TipoEntidadPersonalizable, string> = {
  propietario: "User", predio: "MapPin", vehiculo: "Car", concesion: "Gem",
  personal: "UserCheck", proceso: "Gavel", oficina_registral: "Landmark",
  documento: "FileText", contrato: "ScrollText",
};

const TITULO_PROCESOS = "Procesos judiciales";

type TipoDocumentoCustom = { slug: string; nombre: string };

function cumpleFiltroRelacion(valor: string | null | undefined, filtro: FiltroRelacion): boolean {
  if (filtro.valores) return valor != null && filtro.valores.includes(valor);
  if (filtro.excluir) return valor == null || !filtro.excluir.includes(valor);
  return true;
}

/**
 * Arma los grupos del selector, en el orden del sidebar: entidades, procesos
 * judiciales (todos y por materia), contratos y documentos. Los tipos de
 * documento personalizados no están en las constantes: se leen de las
 * categorías que ya trae la ficha, que es donde `cargarCategoriasEntidad`
 * los resuelve. Las materias vienen de su catálogo editable, así que una
 * materia nueva aparece sola.
 */
function construirCatalogoRelacion(
  categorias: CategoriaGrupo[],
  materias: OpcionPill[],
  tiposCustom: TipoDocumentoCustom[]
): GrupoRelacion[] {
  const documentosCustom = categorias
    .filter((c) => c.tipo === "documento" && c.tipoDocumentoCustomId && c.tipoDocumento)
    .map((c) => ({ tipo: c.tipoDocumento!, clave: c.clave, titulo: c.titulo, icono: c.icono }));
  // Las categorías propias creadas en OTRA ficha también se ofrecen: antes sólo
  // salían las que esta ficha ya tenía (salvo en Propietarios), y como
  // "Documento con carpeta" rechaza un nombre repetido, no había forma de
  // traerlas aquí. Misma clave que arma `cargarCategoriasEntidad`.
  const predefinidos = new Set([...DOCUMENTO_TIPOS.map((d) => d.tipo), DOCUMENTO_FALLBACK.tipo]);
  for (const tipo of tiposCustom) {
    if (predefinidos.has(tipo.slug) || documentosCustom.some((d) => d.tipo === tipo.slug)) continue;
    documentosCustom.push({ tipo: tipo.slug, clave: `doc_custom_${tipo.slug}`, titulo: tipo.nombre, icono: "FileText" });
  }
  documentosCustom.sort((a, b) => a.titulo.localeCompare(b.titulo, "es-PE"));
  const clavesContrato = categorias.filter((c) => c.tipo === "contrato").map((c) => c.clave);
  const tiposContratoConocidos = [...CONTRATO_TIPOS.map((contrato) => contrato.tipo), "mutuo"];
  const opcionContrato = (
    contrato: { clave: string; titulo: string; icono: string },
    filtro: FiltroRelacion,
    tipo?: string
  ): OpcionRelacion => ({
    clave: contrato.clave,
    titulo: contrato.titulo,
    icono: contrato.icono,
    categorias: clavesContrato,
    filtro,
    destino: { tipo: "registro", relacionTipo: "contrato", valoresCrear: tipo ? { tipo } : undefined },
  });

  return [
    {
      id: "entidades",
      titulo: "Entidades",
      icono: "Users",
      opciones: ENTIDADES_RELACIONABLES.map((tipo) => ({
        clave: tipo,
        titulo: ENTIDADES_PERSONALIZABLES[tipo].plural,
        icono: ICONO_ENTIDAD[tipo],
        categorias: [tipo],
        destino: { tipo: "registro" as const, relacionTipo: tipo },
      })),
    },
    {
      id: "procesos",
      titulo: TITULO_PROCESOS,
      icono: "Gavel",
      opciones: [
        {
          clave: "proceso",
          titulo: "Todos los procesos",
          icono: LayoutGrid,
          tituloSelector: TITULO_PROCESOS,
          categorias: ["proceso"],
          destino: { tipo: "registro" as const, relacionTipo: "proceso" as const },
        },
        ...materias.map((materia) => ({
          clave: `proceso:${materia.value}`,
          titulo: materia.label,
          icono: materiaInfo(materia.value).icono,
          tituloSelector: `${TITULO_PROCESOS} · ${materia.label}`,
          categorias: ["proceso"],
          filtro: { campo: "materia", valores: [materia.value] },
          destino: { tipo: "registro" as const, relacionTipo: "proceso" as const, valoresCrear: { materia: materia.value } },
        })),
      ],
    },
    {
      id: "contratos",
      titulo: "Contratos",
      icono: "ScrollText",
      opciones: [
        ...CONTRATO_TIPOS.map((contrato) => opcionContrato(contrato, { campo: "tipo", valores: [contrato.tipo] }, contrato.tipo)),
        opcionContrato(CONTRATO_MUTUO_GENERICO, { campo: "tipo", valores: ["mutuo"] }, "mutuo"),
        // "Otros" es todo lo que no cae en una familia conocida, vacíos incluidos.
        opcionContrato(CONTRATO_FALLBACK, { campo: "tipo", excluir: tiposContratoConocidos }),
      ],
    },
    {
      id: "documentos",
      titulo: "Documentos",
      icono: "FileText",
      opciones: [...DOCUMENTO_TIPOS, ...documentosCustom, DOCUMENTO_FALLBACK].map((documento) => ({
        clave: documento.clave,
        titulo: documento.titulo,
        icono: documento.icono,
        categorias: [documento.clave],
        destino: { tipo: "documento" as const, tipoDocumento: documento.tipo },
      })),
    },
  ];
}

/**
 * Panel unificado "Documentos y relaciones": desplegables por categoría
 * (nivel 1) → tabla de filas (nivel 2) → vista previa embebida de archivos
 * en las filas que son documentos o adjuntos directos (nivel 3). Reemplaza
 * tanto los antiguos desplegables de sólo-lectura como la sección aparte
 * "Archivos adjuntos": ambos vivían de la misma data.
 */
export function DocumentosYRelaciones({
  entidadTipo,
  entidadId,
  categorias,
  titulo,
  permitirCrearTipo = false,
  vistaLateral = false,
}: {
  entidadTipo: string;
  entidadId: string;
  categorias: CategoriaGrupo[] | null;
  /** Permite integrar el encabezado con sus acciones dentro del panel. */
  titulo?: string;
  /** Muestra el alta de tipos personalizados desde las vistas laterales. */
  permitirCrearTipo?: boolean;
  /** Panel angosto (sheet lateral): en la categoría "Archivos", fuerza 2 carpetas por fila. */
  vistaLateral?: boolean;
}) {
  const rol = useAcceso("documento");
  const [estado, setEstado] = useState<CategoriaGrupo[] | null>(categorias);
  const [mostrarOcultas, setMostrarOcultas] = useState(false);
  const orden = useOrdenLocal(`relaciones:${entidadTipo}`);
  const ordenadas = useMemo(() => (estado ? orden.ordenar(estado, (c) => c.clave) : []), [estado, orden]);
  const visibles = ordenadas.filter((c) => mostrarOcultas || !orden.oculto(c.clave));
  const totalOcultas = ordenadas.length - ordenadas.filter((c) => !orden.oculto(c.clave)).length;
  const arrastre = useArrastreOrden(orden, visibles.map((c) => c.clave));

  const turnoRecarga = useRef(0);
  const router = useRouter();
  const refrescoPendiente = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setEstado(categorias), [categorias]);
  useEffect(() => {
    let vigente = true;
    let turno = 0;
    function actualizar() {
      const solicitud = ++turno;
      void cargarCategoriasEntidad(createClient(), entidadTipo, [entidadId]).then((porId) => {
        if (vigente && solicitud === turno) setEstado(porId[entidadId] ?? []);
      }).catch(() => { /* Conserva la última lectura si falla la conexión. */ });
    }
    window.addEventListener("registros-actualizados", actualizar);
    return () => { vigente = false; window.removeEventListener("registros-actualizados", actualizar); };
  }, [entidadTipo, entidadId]);

  async function recargar() {
    // La tabla detrás del panel lateral pinta relaciones y adjuntos con datos
    // del servidor: sin esto quedaban viejos hasta recargar la página. Una
    // subida de varios archivos llama aquí una vez por archivo, así que se
    // agrupa en un solo refresco. No se cancela al cerrar el panel: el
    // refresco igual tiene que llegar a la tabla.
    if (refrescoPendiente.current) clearTimeout(refrescoPendiente.current);
    refrescoPendiente.current = setTimeout(() => router.refresh(), 600);
    // Varias recargas seguidas (una por archivo que termina de subir) pueden
    // responder en otro orden: sólo la última pedida pinta el panel.
    const turno = ++turnoRecarga.current;
    const supabase = createClient();
    const porId = await cargarCategoriasEntidad(supabase, entidadTipo, [entidadId]);
    if (turno !== turnoRecarga.current) return;
    setEstado(porId[entidadId] ?? []);
  }

  let contenido: React.ReactNode;
  if (estado === null) {
    contenido = <EsqueletoCarga />;
  } else if (estado.length === 0) {
    contenido = <EmptyDocumentos />;
  } else {
    contenido = (
      <div className="space-y-2">
        {visibles.map((categoria, index) => (
          <div
            key={categoria.clave}
            {...arrastre.destino(categoria.clave)}
            className={cn("rounded-xl", orden.oculto(categoria.clave) && "opacity-50", arrastre.clase(categoria.clave))}
          >
            <CategoriaDesplegable
              categoria={categoria}
              defaultOpen={index === 0}
              entidadTipo={entidadTipo}
              entidadId={entidadId}
              onGuardado={recargar}
              vistaLateral={vistaLateral}
              asa={arrastre.asa(categoria.clave)}
              oculta={orden.oculto(categoria.clave)}
              onAlternarOculta={() => orden.alternarOculto(categoria.clave)}
            />
          </div>
        ))}
        {totalOcultas > 0 && (
          <button
            type="button"
            onClick={() => setMostrarOcultas((m) => !m)}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/80"
          >
            {mostrarOcultas ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {mostrarOcultas ? "Esconder las secciones ocultas" : `${totalOcultas} sección${totalOcultas === 1 ? "" : "es"} oculta${totalOcultas === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {titulo && (
        <div className="mb-2 flex items-center gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">{titulo}</h3>
          {permitirCrearTipo && puedeEscribir(rol) && (
            <EncabezadoAgregar
              entidadTipo={entidadTipo}
              entidadId={entidadId}
              categorias={estado ?? []}
              onGuardado={recargar}
            />
          )}
        </div>
      )}
      {contenido}
    </>
  );
}

/** @deprecated usa `DocumentosYRelaciones` — se mantiene como alias por compatibilidad mientras se actualizan imports. */
export const CategoriasDesplegables = DocumentosYRelaciones;

/**
 * "+" del encabezado "Documentos y relaciones": ofrece dos formas de agregar
 * una categoría nueva a la ficha — "Documento con carpeta" (el alta de
 * siempre: nombre → categoría nueva) o "A partir de una selección" (elegir
 * primero a qué entidad relacionar, igual al selector "Relacionar con" de
 * propiedades personalizadas, y de ahí vincular un registro existente o
 * crear uno nuevo). El primer paso vive en el `DropdownMenu` de siempre; en
 * cuanto se elige "a partir de una selección" se cierra ese menú y se abre un
 * portal manual (`RelacionarConSelector`), por la misma razón que
 * `AgregarRelacionEntidad`: sus pasos siguientes abren sus propios portales
 * a `document.body` (selector de vínculo, alta rápida) y el cierre
 * automático por "click afuera" de `DropdownMenu` los desmontaría a mitad de uso.
 */
function EncabezadoAgregar({
  entidadTipo,
  entidadId,
  categorias,
  onGuardado,
}: {
  entidadTipo: string;
  entidadId: string;
  /** Todas las categorías que la ficha ya tiene: sólo sirven para marcar lo ya vinculado y descubrir carpetas personalizadas. */
  categorias: CategoriaGrupo[];
  onGuardado: () => void;
}) {
  const router = useRouter();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [paso, setPaso] = useState<"menu" | "carpeta">("menu");
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [posicion, setPosicion] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function abrirSelector() {
    setMenuAbierto(false);
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPosicion({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setSelectorAbierto(true);
  }

  return (
    <>
      <DropdownMenu
        open={menuAbierto}
        onOpenChange={(open) => {
          setMenuAbierto(open);
          if (!open) setPaso("menu");
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            title="Agregar a documentos y relaciones"
            aria-label="Agregar a documentos y relaciones"
            aria-expanded={menuAbierto}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white data-[state=open]:bg-white/[0.08] data-[state=open]:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-entity-sheet-portal align="start" className="z-[101] w-80 p-2.5">
          {paso === "menu" ? (
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => setPaso("carpeta")}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.08]"
              >
                <FolderPlus className="h-4 w-4 shrink-0 text-white/45" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-medium text-white/85">Documento con carpeta</span>
                  <span className="block text-[10px] text-white/40">Crea una categoría nueva para agrupar documentos</span>
                </span>
              </button>
              <button
                type="button"
                onClick={abrirSelector}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.08]"
              >
                <Link2 className="h-4 w-4 shrink-0 text-white/45" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-medium text-white/85">A partir de una selección</span>
                  <span className="block text-[10px] text-white/40">Entidades, procesos judiciales, contratos y documentos</span>
                </span>
              </button>
            </div>
          ) : (
            <NuevoTipoDocumentoForm
              entidadTipo={entidadTipo}
              entidadId={entidadId}
              onCancelar={() => setPaso("menu")}
              onCreado={async () => {
                onGuardado();
                // Refresca el árbol de Server Components para que la carpeta
                // recién creada se vea de inmediato en el panel de esta ficha.
                router.refresh();
                setMenuAbierto(false);
              }}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {selectorAbierto && posicion && (
        <RelacionarConSelector
          entidadTipo={entidadTipo}
          entidadId={entidadId}
          categorias={categorias}
          posicion={posicion}
          onCerrar={() => setSelectorAbierto(false)}
          onVinculado={() => {
            setSelectorAbierto(false);
            onGuardado();
          }}
        />
      )}
    </>
  );
}

/**
 * Portal manual con dos pasos. El primero ya no lista sólo lo que la ficha
 * tiene: muestra el catálogo completo de lo relacionable —entidades,
 * procesos judiciales por materia, contratos por tipo y todas las carpetas
 * de documentos— repartido en desplegables, con buscador porque la lista es
 * larga. El segundo depende de lo elegido: un registro se vincula o se crea
 * (`AccionesRelacion`, acotado a la materia/tipo elegido) y una carpeta de
 * documentos se agrega a la ficha.
 */
function RelacionarConSelector({
  entidadTipo,
  entidadId,
  categorias,
  posicion,
  onCerrar,
  onVinculado,
}: {
  entidadTipo: string;
  entidadId: string;
  categorias: CategoriaGrupo[];
  posicion: { top: number; right: number };
  onCerrar: () => void;
  onVinculado: () => void;
}) {
  // Materias con el nombre del catálogo editable (y las que se hayan agregado ahí).
  const materias = useOpcionesColumna("procesos", "materia", MATERIA_OPCIONES);
  const [tiposCustom, setTiposCustom] = useState<TipoDocumentoCustom[]>([]);
  useEffect(() => {
    let cancelado = false;
    createClient()
      .from("tipos_documento_custom")
      .select("slug, nombre")
      .order("nombre")
      .then(({ data }) => {
        if (!cancelado) setTiposCustom((data ?? []) as TipoDocumentoCustom[]);
      });
    return () => { cancelado = true; };
  }, []);
  const grupos = useMemo(
    () => construirCatalogoRelacion(categorias, materias, tiposCustom),
    [categorias, materias, tiposCustom]
  );
  const [elegida, setElegida] = useState<OpcionRelacion | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [gruposAbiertos, setGruposAbiertos] = useState<Set<string>>(() => new Set(["entidades"]));

  const consulta = busqueda.trim().toLocaleLowerCase("es-PE");
  const visibles = useMemo(() => {
    if (!consulta) return grupos;
    return grupos
      .map((grupo) => ({
        ...grupo,
        // Buscar el nombre del grupo ("procesos", "contratos") trae el grupo entero.
        opciones: grupo.titulo.toLocaleLowerCase("es-PE").includes(consulta)
          ? grupo.opciones
          : grupo.opciones.filter((opcion) => opcion.titulo.toLocaleLowerCase("es-PE").includes(consulta)),
      }))
      .filter((grupo) => grupo.opciones.length > 0);
  }, [grupos, consulta]);

  function alternarGrupo(id: string) {
    setGruposAbiertos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  /** Todo lo que la ficha ya tiene en las secciones de la opción, para no ofrecerlo dos veces. */
  function vinculadosDe(opcion: OpcionRelacion): FilaCategoria[] {
    return categorias.filter((categoria) => opcion.categorias.includes(categoria.clave)).flatMap((categoria) => categoria.filas);
  }

  /** Cuántos de esos vínculos caen en la materia/tipo de la opción. */
  function totalDe(opcion: OpcionRelacion): number {
    const filas = vinculadosDe(opcion);
    return opcion.filtro ? filas.filter((fila) => cumpleFiltroRelacion(fila.clasificacion, opcion.filtro!)).length : filas.length;
  }

  return createPortal(
    <>
      <button type="button" tabIndex={-1} aria-label="Cerrar menú" className="fixed inset-0 z-[100] cursor-default" onClick={onCerrar} />
      <div
        role="menu"
        data-entity-sheet-portal
        style={{ top: posicion.top, right: posicion.right }}
        className="light-panel fixed z-[101] w-[19rem] rounded-xl border border-[#d9d4c8] bg-[#eeeadf] p-1 shadow-sm"
      >
        <div className="flex items-center gap-1 border-b border-[#d9d4c8] px-1 pb-1">
          <button
            type="button"
            onClick={() => (elegida ? setElegida(null) : onCerrar())}
            aria-label="Volver"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-[#e5e0d4] hover:text-neutral-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <span className="truncate px-1 text-[11px] font-semibold text-neutral-800">
            {elegida ? elegida.tituloSelector ?? elegida.titulo : "Relacionar con"}
          </span>
        </div>

        {!elegida && (
          <div className="relative px-1 pt-1.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={busqueda}
              autoFocus
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Buscar categoría…"
              aria-label="Buscar categoría"
              className="view-control h-7 w-full !pl-7 text-[11px]"
            />
          </div>
        )}

        <div className="max-h-[22rem] space-y-0.5 overflow-y-auto p-1">
          {elegida ? (
            elegida.destino.tipo === "documento" ? (
              <AccionesCarpetaDocumento
                entidadTipo={entidadTipo}
                entidadId={entidadId}
                titulo={elegida.titulo}
                tipoDocumento={elegida.destino.tipoDocumento}
                vinculados={vinculadosDe(elegida)}
                onListo={onVinculado}
              />
            ) : (
              <AccionesRelacion
                entidadTipo={entidadTipo}
                entidadId={entidadId}
                relacionTipo={elegida.destino.relacionTipo}
                filtro={elegida.filtro}
                valoresCrear={elegida.destino.valoresCrear}
                tituloCategoria={elegida.tituloSelector ?? (elegida.filtro ? elegida.titulo : undefined)}
                vinculados={vinculadosDe(elegida)}
                onVinculado={onVinculado}
              />
            )
          ) : visibles.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-[11px] text-neutral-400">Nada coincide con «{busqueda.trim()}».</p>
          ) : (
            visibles.map((grupo) => {
              // Buscando, los grupos se abren solos: esconder los resultados
              // detrás de un desplegable cerrado haría inútil el buscador.
              const abierto = consulta ? true : gruposAbiertos.has(grupo.id);
              const IconoGrupo = ICONOS[grupo.icono] ?? FileText;
              return (
                <div key={grupo.id}>
                  <button
                    type="button"
                    onClick={() => alternarGrupo(grupo.id)}
                    disabled={Boolean(consulta)}
                    aria-expanded={abierto}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-neutral-500 transition-colors hover:bg-[#e5e0d4] disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <IconoGrupo className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    <span className="flex-1 truncate">{grupo.titulo}</span>
                    <span className="shrink-0 rounded-full bg-[#e5e0d4] px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-neutral-500">
                      {grupo.opciones.length}
                    </span>
                    {!consulta && <TrianguloDesplegable abierto={abierto} />}
                  </button>
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
                      abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="space-y-0.5 pb-1 pl-2.5">
                        {grupo.opciones.map((opcion) => {
                          const Icono = typeof opcion.icono === "string" ? ICONOS[opcion.icono] ?? FileText : opcion.icono;
                          const total = totalDe(opcion);
                          return (
                            <button
                              key={opcion.clave}
                              type="button"
                              onClick={() => setElegida(opcion)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 transition-colors hover:bg-[#e5e0d4]"
                            >
                              <Icono className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                              <span className="min-w-0 flex-1 truncate">{opcion.titulo}</span>
                              {total > 0 && (
                                <span className="shrink-0 text-[10px] font-medium tabular-nums text-neutral-400">{total}</span>
                              )}
                              <ChevronRight className="h-3 w-3 shrink-0 text-neutral-400" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

/**
 * Paso final de una carpeta de documentos: agregarla a la ficha (aunque esté
 * vacía, vía `carpetas_vacias`) o vincular un documento que ya existe. Crear
 * el documento en sí se sigue haciendo con el "+" de la propia carpeta, que
 * es donde está el formulario completo con subida de archivos.
 */
function AccionesCarpetaDocumento({
  entidadTipo,
  entidadId,
  titulo,
  tipoDocumento,
  vinculados,
  onListo,
}: {
  entidadTipo: string;
  entidadId: string;
  titulo: string;
  tipoDocumento: string;
  vinculados: FilaCategoria[];
  onListo: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claseBoton = "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-neutral-700 hover:bg-[#e5e0d4] disabled:cursor-not-allowed disabled:opacity-60";

  async function agregarCarpeta() {
    setError(null);
    setGuardando(true);
    const resultado = await crearCarpetaDocumento(entidadTipo, entidadId, tipoDocumento);
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    onListo();
  }

  return (
    <div className="space-y-0.5">
      <button type="button" role="menuitem" onClick={agregarCarpeta} disabled={guardando} className={claseBoton}>
        {guardando ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-neutral-500" /> : <FolderPlus className="h-3.5 w-3.5 shrink-0 text-neutral-500" />}
        Agregar «{titulo}» a la ficha
      </button>
      <AccionesRelacion
        entidadTipo={entidadTipo}
        entidadId={entidadId}
        relacionTipo="documento"
        tipoDocumento={tipoDocumento}
        tituloCategoria={titulo}
        vinculados={vinculados}
        onVinculado={onListo}
      />
      {error && (
        <p role="alert" className="mt-1 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-[10px] leading-4 text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Convierte el scroll vertical de la rueda del mouse en scroll horizontal
 * cuando el contenedor desborda: sin trackpad ni Shift, un mouse común no
 * tiene forma de mover una tabla ancha hacia los lados.
 */
function useScrollHorizontalConRueda<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function onWheel(evento: WheelEvent) {
      if (el!.scrollWidth <= el!.clientWidth) return;
      if (Math.abs(evento.deltaY) <= Math.abs(evento.deltaX)) return;
      el!.scrollLeft += evento.deltaY;
      evento.preventDefault();
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  return ref;
}

function EsqueletoCarga() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-11 animate-pulse rounded-xl bg-white/[0.04]" />
      ))}
    </div>
  );
}

function NuevoTipoDocumentoForm({
  entidadTipo,
  entidadId,
  onCancelar,
  onCreado,
}: {
  entidadTipo: string;
  entidadId: string;
  onCancelar: () => void;
  onCreado: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio || guardando) return;

    setGuardando(true);
    setError(null);
    // Creado desde la ficha (no desde "Tipos documentales"): es una carpeta
    // de ESTA entidad, no un tipo que deba anexarse al sidebar global de
    // "Documentos".
    const resultado = await crearTipoDocumento(nombreLimpio, { visibleSidebar: false });
    if (!resultado.ok) {
      // Las categorías son globales: si el nombre ya existe (propia o
      // predefinida), se agrega la misma desde el catálogo, no se crea otra.
      const yaExiste = resultado.error?.startsWith("Ese tipo ya existe");
      setError(
        yaExiste
          ? "Esa categoría ya existe: agrégala desde «A partir de una selección» → Documentos."
          : resultado.error ?? "No se pudo crear el tipo de documento"
      );
      setGuardando(false);
      return;
    }
    // El tipo ya existe en el catálogo (global para poder agrupar
    // `documentos.tipo` en cualquier ficha, pero oculto del sidebar); falta
    // revelarlo en ESTA ficha para que aparezca de inmediato en el panel sin
    // esperar a su primer documento.
    if (resultado.slug) await crearCarpetaDocumento(entidadTipo, entidadId, resultado.slug);
    await onCreado();
  }

  return (
    <form onSubmit={crear} className="rounded-xl border border-brand-400/20 bg-brand-500/[0.06] p-3">
      <label htmlFor="nuevo-tipo-documento" className="mb-1 block text-[11px] font-medium text-white/75">
        Nuevo tipo de documento
      </label>
      <div className="flex items-center gap-2">
        <input
          id="nuevo-tipo-documento"
          autoFocus
          value={nombre}
          maxLength={120}
          onChange={(evento) => setNombre(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === "Escape") onCancelar();
          }}
          placeholder="Ej: Actas de directorio"
          className="view-control h-9 min-w-0 flex-1"
        />
        <button
          type="submit"
          disabled={guardando || !nombre.trim()}
          className="glass-btn-primary h-9 px-3 text-[11px] disabled:opacity-50"
        >
          {guardando && <Loader2 className="h-3 w-3 animate-spin" />}
          Crear
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          aria-label="Cancelar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-red-300">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
        </p>
      )}
    </form>
  );
}

function EmptyDocumentos() {
  return <p className="py-1 text-xs font-medium text-white/45">Sin datos</p>;
}

function CategoriaDesplegable({
  categoria,
  defaultOpen,
  entidadTipo,
  entidadId,
  onGuardado,
  vistaLateral = false,
  asa,
  oculta,
  onAlternarOculta,
}: {
  categoria: CategoriaGrupo;
  defaultOpen: boolean;
  entidadTipo: string;
  entidadId: string;
  onGuardado: () => void;
  vistaLateral?: boolean;
  /** Props del agarre para arrastrar la sección (`useArrastreOrden().asa`). */
  asa: ReturnType<ArrastreOrden["asa"]>;
  oculta: boolean;
  onAlternarOculta: () => void;
}) {
  const rol = useAcceso("documento");
  const [abierto, setAbierto] = useState(defaultOpen);
  const [renombrando, setRenombrando] = useState(false);
  const ordenFilas = useOrdenLocal(`relaciones:${entidadTipo}:${entidadId}:${categoria.clave}`);
  const filas = useMemo(() => ordenFilas.ordenar(categoria.filas, (fila) => fila.id), [categoria.filas, ordenFilas]);
  const arrastreFilas = useArrastreOrden(ordenFilas, filas.map((fila) => fila.id));
  const [formAbierto, setFormAbierto] = useState(false);
  // Paso del popover "+" de una categoría de documento: primero elegir entre
  // vincular uno que ya existe o crear uno nuevo — mismo patrón que ya tiene
  // el "+" de una categoría de entidad (`AgregarRelacionEntidad`). Antes este
  // "+" saltaba directo al formulario de alta, sin dar forma de vincular un
  // documento existente desde la propia fila de la categoría.
  const [pasoDoc, setPasoDoc] = useState<"menu" | "crear">("menu");
  const [vincularAbierto, setVincularAbierto] = useState(false);
  const [errorVincular, setErrorVincular] = useState<string | null>(null);
  const [revisionArchivos, setRevisionArchivos] = useState(0);
  const entityFileRef = useRef<EntityFileBlocksHandle>(null);
  // Conteo en vivo de la categoría "Archivos": arranca con el del servidor y
  // se corrige solo al subir/borrar desde el bloque embebido.
  const [conteoArchivos, setConteoArchivos] = useState<number | null>(null);
  const totalMostrado = categoria.tipo === "archivo" && conteoArchivos !== null ? conteoArchivos : categoria.total;
  const [archivosPorFila, setArchivosPorFila] = useState<Record<string, Archivo[]> | null>(null);
  const scrollRef = useScrollHorizontalConRueda<HTMLDivElement>();
  const Icono = ICONOS[categoria.icono] ?? FileText;
  const puedeAgregar = categoria.tipo === "documento" && puedeEscribir(rol);
  // Una categoría de documentos vacía que se ve por un marcador de esta ficha
  // (`carpetas_vacias`); las predefinidas vacías sólo aparecen así. En
  // Propietarios las propias se muestran siempre, así que ahí no se "quitan".
  const quitableDeFicha = categoria.tipo === "documento" && categoria.total === 0 && Boolean(categoria.tipoDocumento) && !categoria.fija
    && (!categoria.tipoDocumentoCustomId || (Boolean(categoria.vacioRevelado) && entidadTipo !== "propietario"));
  // Tanto las categorías de documentos como "Archivos" abren su formulario
  // en un popover anclado al botón "+".
  const puedeAgregarArchivo = categoria.tipo === "archivo" && puedeEscribir(rol);
  const tipoContrato = categoria.tipo === "contrato" ? CONTRATO_TIPOS.find((contrato) => contrato.clave === categoria.clave)?.tipo : undefined;

  // Precarga en lote (una sola consulta) de los archivos de todas las filas
  // de documento/archivo de esta categoría, para poder mostrar sus íconos de
  // acción a la altura de la fila sin esperar a que cada una se expanda
  // individualmente. Se dispara al abrir la categoría y cada vez que cambia
  // el conjunto de filas con archivos (p. ej. se agregó un documento nuevo).
  // La categoría "archivo" (Archivos) ya no pasa por esta precarga: se
  // renderiza directo sin fila propia — ver más abajo.
  const idsConArchivos = useMemo(
    () => categoria.tipo === "archivo" ? [] : categoria.filas.filter((fila) => fila.archivosDe).map((fila) => fila.archivosDe!.entidadId),
    [categoria.filas, categoria.tipo]
  );
  const idsConArchivosClave = idsConArchivos.join(",");

  useEffect(() => {
    if (!abierto || idsConArchivos.length === 0) return;
    const tipoOrigen = categoria.filas.find((fila) => fila.archivosDe)?.archivosDe?.entidadTipo;
    if (!tipoOrigen) return;

    let cancelado = false;
    const supabase = createClient();
    // En lotes: con cientos de filas un solo `.in()` no entra en la URL.
    fetchAllRowsIn(idsConArchivos, (lote, desde, hasta) => supabase
      .from("archivos")
      .select("id, nombre_original, mime, tamano_bytes, entidad_id")
      .eq("entidad_tipo", tipoOrigen)
      .in("entidad_id", lote)
      .order("id")
      .range(desde, hasta))
      .then(({ data }) => {
        if (cancelado) return;
        // Sembrar `[]` para cada id: una fila sin archivos tiene que quedar como
        // "cargada y vacía", no como "aún cargando" (si no, su vista previa se
        // queda en el esqueleto para siempre y no sabemos que está vacía).
        const mapa: Record<string, Archivo[]> = {};
        for (const id of idsConArchivos) mapa[id] = [];
        for (const archivo of (data ?? []) as (Archivo & { entidad_id: string })[]) {
          (mapa[archivo.entidad_id] ??= []).push(archivo);
        }
        setArchivosPorFila(mapa);
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsConArchivosClave resume idsConArchivos
  }, [abierto, idsConArchivosClave, revisionArchivos]);

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/10">
      <div className="group/categoria flex w-full items-center gap-1 px-3 py-2.5">
        <span
          {...asa}
          className="relative -ml-0.5 mr-1 flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white active:cursor-grabbing"
        >
          <Icono className="h-4 w-4 group-hover/categoria:opacity-0" />
          <GripVertical className="absolute h-3.5 w-3.5 opacity-0 group-hover/categoria:opacity-100" />
        </span>
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          className="group/titulo flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="flex-1 truncate text-[12.5px] font-semibold text-white/85 transition-colors group-hover/titulo:text-white">{categoria.titulo}</span>
          <span className="shrink-0 rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-white/55">{totalMostrado}</span>
        </button>
        {puedeAgregar && (
          <DropdownMenu
            modal={false}
            open={formAbierto}
            onOpenChange={(open) => {
              setFormAbierto(open);
              if (open) { setAbierto(true); setPasoDoc("menu"); }
              else if (pasoDoc === "crear") onGuardado();
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Agregar documento"
                aria-label={`Agregar documento en ${categoria.titulo}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white data-[state=open]:bg-white/[0.08] data-[state=open]:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              data-entity-sheet-portal
              align="end"
              className="z-[101] w-80 p-2.5"
              onPointerDownOutside={evitarCierrePorSelectorDeArchivo}
              onFocusOutside={evitarCierrePorSelectorDeArchivo}
            >
              {pasoDoc === "menu" ? (
                <div className="space-y-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setFormAbierto(false);
                      setErrorVincular(null);
                      setVincularAbierto(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-white/85 hover:bg-white/[0.08]"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-white/45" /> Vincular documento existente
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setPasoDoc("crear")}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-white/85 hover:bg-white/[0.08]"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-white/45" /> Documento nuevo
                  </button>
                </div>
              ) : (
                <NuevoDocumentoDirecto
                  entidadTipo={entidadTipo}
                  entidadId={entidadId}
                  tipoFijo={categoria.tipoDocumento ? { tipo: categoria.tipoDocumento, titulo: categoria.titulo } : undefined}
                  onArchivoSubido={() => {
                    setRevisionArchivos((revision) => revision + 1);
                    onGuardado();
                  }}
                  onCerrar={() => {
                    setFormAbierto(false);
                    onGuardado();
                  }}
                />
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {vincularAbierto && (
          <SelectorValorRelacion
            entidadId={entidadId}
            entidadTipoOrigen={esTipoEntidadPersonalizable(entidadTipo) ? entidadTipo : undefined}
            tipoDestino="documento"
            tipoDocumento={categoria.tipoDocumento}
            tituloCategoria={categoria.titulo}
            vinculados={categoria.filas.map((fila) => ({
              id: fila.id,
              nombre: Object.values(fila.celdas).find((valor) => valor) ?? categoria.titulo,
              href: fila.href ?? `/documentos/${fila.id}`,
            }))}
            onClose={() => setVincularAbierto(false)}
            onSelect={async (opcion) => {
              setVincularAbierto(false);
              const resultado = await vincularRelacion(entidadTipo, entidadId, "documento", opcion.id);
              if (!resultado.ok) { setErrorVincular(resultado.error); return; }
              onGuardado();
            }}
          />
        )}
        {puedeAgregarArchivo && (
          <DropdownMenu modal={false} onOpenChange={(open) => open && setAbierto(true)}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Agregar archivo o carpeta"
                aria-label={`Agregar archivo o carpeta en ${categoria.titulo}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white data-[state=open]:bg-white/[0.08] data-[state=open]:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              data-entity-sheet-portal
              align="end"
              className="z-[101] w-60 p-2.5"
              onPointerDownOutside={evitarCierrePorSelectorDeArchivo}
              onFocusOutside={evitarCierrePorSelectorDeArchivo}
            >
              <SubirConCarpeta
                entidadTipo={entidadTipo}
                entidadId={entidadId}
                onSubido={(archivo) => {
                  entityFileRef.current?.agregar(archivo);
                  onGuardado();
                }}
                onCarpetaCreada={(ruta) => {
                  entityFileRef.current?.agregarCarpeta(ruta);
                  onGuardado();
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {categoria.tipo === "entidad" && esTipoEntidadPersonalizable(categoria.clave) && (
          <AgregarRelacionEntidad
            entidadTipo={entidadTipo}
            entidadId={entidadId}
            relacionTipo={categoria.clave}
            vinculados={categoria.filas}
            onVinculado={() => { setAbierto(true); onGuardado(); }}
          />
        )}
        {/* Contratos por tipo (Personal, Profesionales…): vincular uno existente
            de ese tipo o crearlo ya con el tipo fijo. Mutuos no: ahí la
            relación lleva rol (acreedor/deudor) y se edita desde el contrato. */}
        {tipoContrato && (
          <AgregarRelacionEntidad
            entidadTipo={entidadTipo}
            entidadId={entidadId}
            relacionTipo="contrato"
            filtro={{ campo: "tipo", valores: [tipoContrato] }}
            valoresCrear={{ tipo: tipoContrato }}
            tituloCategoria={categoria.titulo}
            vinculados={categoria.filas}
            onVinculado={() => { setAbierto(true); onGuardado(); }}
          />
        )}
        {/* Vacía y agregada a mano en ESTA ficha (propia o predefinida): el
            tacho la quita sólo de aquí. Antes, en una propia, el tacho borraba
            la categoría de todas las fichas (o fallaba si otra ficha tenía
            documentos), sin forma de sacarla sólo de ésta. */}
        {categoria.tipoDocumentoCustomId && !quitableDeFicha && puedeEscribir(rol) && (
          <DeleteCategoryButton
            tipoId={categoria.tipoDocumentoCustomId}
            titulo={categoria.titulo}
            onEliminada={onGuardado}
          />
        )}
        {quitableDeFicha && puedeEscribir(rol) && (
          <EliminarCarpetaDocumentoButton
            entidadTipo={entidadTipo}
            entidadId={entidadId}
            tipoDocumento={categoria.tipoDocumento!}
            titulo={categoria.titulo}
            onEliminada={onGuardado}
          />
        )}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Opciones de la sección"
              aria-label={`Opciones de ${categoria.titulo}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white data-[state=open]:bg-white/[0.08] data-[state=open]:text-white"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent data-entity-sheet-portal align="end" className="z-[101] w-52 p-1">
            {categoria.tipoDocumentoCustomId && puedeEscribir(rol) && (
              <DropdownMenuItem onSelect={() => setRenombrando(true)} className="gap-2 text-xs">
                <Pencil className="h-3.5 w-3.5" /> Renombrar categoría
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onAlternarOculta} className="gap-2 text-xs">
              {oculta ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {oculta ? "Mostrar en el panel" : "Ocultar en el panel"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {renombrando && categoria.tipoDocumentoCustomId && (
          <DialogoRenombrarCategoria
            tipoId={categoria.tipoDocumentoCustomId}
            titulo={categoria.titulo}
            onClose={() => setRenombrando(false)}
            onGuardado={onGuardado}
          />
        )}
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-label={abierto ? "Contraer categoría" : "Expandir categoría"}
          className="flex h-6 w-6 shrink-0 items-center justify-center text-white/40 transition-colors hover:text-white"
        >
          <TrianguloDesplegable abierto={abierto} />
        </button>
      </div>
      {errorVincular && (
        <p role="alert" className="border-t border-red-400/15 bg-red-500/[0.08] px-3 py-1.5 text-[10px] leading-4 text-red-200">
          {errorVincular}
        </p>
      )}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {categoria.tipo === "archivo" && categoria.filas[0]?.archivosDe ? (
            <div className="border-t border-white/[0.06] p-3">
              <EntityFileBlocks
                ref={entityFileRef}
                entidadTipo={categoria.filas[0].archivosDe.entidadTipo}
                entidadId={categoria.filas[0].archivosDe.entidadId}
                incluirDocumentosVinculados={!categoria.filas[0].archivosDe.soloDirecto}
                vacioMensaje="Sin archivos adjuntos todavía"
                ocultarEncabezado
                permitirCarpetas
                vistaLateral={vistaLateral}
                ocultarAccionesVacio
                onConteo={setConteoArchivos}
              />
            </div>
          ) : (
            <div ref={scrollRef} className="scrollbar-glass overflow-x-auto border-t border-white/[0.06]">
              <table className="w-full min-w-[420px] text-left text-[11.5px]">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                    {categoria.columnas.map((columna) => (
                      <th key={columna.id} className="px-3 py-2 font-semibold">{columna.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {categoria.filas.length === 0 ? (
                    <tr>
                      <td colSpan={categoria.columnas.length} className="px-3 py-4 text-center text-[11px] text-white/35">
                        {categoria.tipo === "entidad" ? "Aún no hay nada vinculado aquí" : categoria.tipo === "contrato" ? "Aún no hay contratos de este tipo" : "Aún no hay documentos de este tipo"}
                      </td>
                    </tr>
                  ) : (
                    filas.map((fila) => (
                      <FilaCategoriaRow
                        key={fila.id}
                        arrastre={arrastreFilas}
                        fila={fila}
                        columnas={categoria.columnas}
                        archivosPrecargados={fila.archivosDe ? archivosPorFila?.[fila.archivosDe.entidadId] : undefined}
                        onCambio={onGuardado}
                        categoriaTipo={categoria.tipo}
                        relacionTipo={categoria.tipo === "contrato" ? "contrato" : categoria.clave}
                        entidadTipo={entidadTipo}
                        entidadId={entidadId}
                        vistaLateral={vistaLateral}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Paso final de "A partir de una selección" en el encabezado: una vez
 * elegido el tipo de entidad, ofrece "Vincular existente" (busca en la tabla
 * destino) o "Crear nuevo" (alta rápida de `CrearRegistro`, sin navegar — al
 * terminar se vincula el registro recién creado). Mantiene su propio estado
 * (selector, alta rápida) porque vive dentro de `RelacionarConSelector`, que
 * no se desmonta mientras el usuario navega estos pasos.
 */
function AccionesRelacion({
  entidadTipo,
  entidadId,
  relacionTipo,
  tipoDocumento,
  filtro,
  valoresCrear,
  tituloCategoria,
  vinculados,
  onVinculado,
}: {
  entidadTipo: string;
  entidadId: string;
  relacionTipo: TipoEntidadPersonalizable;
  /** Sólo cuando `relacionTipo === "documento"`: acota "Vincular existente" a esta categoría en vez de listar todos los documentos. */
  tipoDocumento?: string;
  /** Acota "Vincular existente" a la materia/tipo elegido en el catálogo. */
  filtro?: FiltroRelacion;
  /** Valores fijos de "Crear nuevo" (la materia o el tipo elegido): van ocultos en el formulario. */
  valoresCrear?: Record<string, string>;
  tituloCategoria?: string;
  vinculados: FilaCategoria[];
  onVinculado: () => void;
}) {
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abrirCrearRef = useRef<(() => void) | null>(null);
  const crearBtnRef = useRef<HTMLButtonElement>(null);

  const config = ENTIDADES_PERSONALIZABLES[relacionTipo];
  // Sin permiso de escritura en el destino, `CrearRegistro` no se monta y el
  // botón "Crear … nuevo" quedaba visible pero sin hacer nada.
  const puedeCrearDestino = puedeEscribir(useAcceso(relacionTipo));
  const claveCrear = puedeCrearDestino ? CLAVE_CREAR_POR_RELACION[relacionTipo] : undefined;
  const singularMinuscula = config.singular.toLocaleLowerCase("es-PE");
  const claseBoton = "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-neutral-700 hover:bg-[#e5e0d4]";
  const claseIcono = "h-3.5 w-3.5 shrink-0 text-neutral-500";

  async function vincular(id: string) {
    setError(null);
    const resultado = await vincularRelacion(entidadTipo, entidadId, relacionTipo, id);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    onVinculado();
  }

  return (
    <div className="space-y-0.5">
      <button type="button" role="menuitem" onClick={() => setSelectorAbierto(true)} className={claseBoton}>
        <Link2 className={claseIcono} /> Vincular {singularMinuscula} existente
      </button>
      {claveCrear && (
        <button ref={crearBtnRef} type="button" role="menuitem" onClick={() => abrirCrearRef.current?.()} className={claseBoton}>
          <Plus className={claseIcono} /> Crear {singularMinuscula} nuevo
        </button>
      )}
      {/* Montado siempre (no sólo mientras se ve el menú): si se desmontara al
          elegir "Crear nuevo", su formulario nunca llegaría a mostrarse. */}
      {claveCrear && (
        <div className="hidden">
          <CrearRegistro
            clave={claveCrear}
            valoresIniciales={valoresCrear}
            camposOcultos={valoresCrear ? Object.keys(valoresCrear) : []}
            onCreado={vincular}
            anclarA={crearBtnRef}
            trigger={(abrir) => {
              abrirCrearRef.current = abrir;
              return null;
            }}
          />
        </div>
      )}
      {selectorAbierto && (
        <SelectorValorRelacion
          entidadId={entidadId}
          entidadTipoOrigen={esTipoEntidadPersonalizable(entidadTipo) ? entidadTipo : undefined}
          tipoDestino={relacionTipo}
          tipoDocumento={tipoDocumento}
          filtro={filtro}
          tituloCategoria={tituloCategoria}
          vinculados={vinculados.map((fila) => ({
            id: fila.id,
            nombre: Object.values(fila.celdas).find((valor) => valor) ?? config.singular,
            href: fila.href ?? `${config.href}/${fila.id}`,
          }))}
          onClose={() => setSelectorAbierto(false)}
          onSelect={async (opcion) => {
            setSelectorAbierto(false);
            await vincular(opcion.id);
          }}
        />
      )}
      {error && (
        <p role="alert" className="mt-1 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-[10px] leading-4 text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Botón "+" de una categoría "entidad" (vehículo, predio, proceso…): igual
 * que "+ Agregar documento", pero para relaciones — abre un menú con
 * "Vincular existente" (busca en la tabla destino) y "Crear nuevo" (reutiliza
 * el alta rápida de `CrearRegistro`, sin navegar: al terminar, se vincula el
 * registro recién creado y el panel se queda en esta ficha).
 */
function AgregarRelacionEntidad({
  entidadTipo,
  entidadId,
  relacionTipo,
  filtro,
  valoresCrear,
  tituloCategoria,
  vinculados,
  onVinculado,
}: {
  entidadTipo: string;
  entidadId: string;
  relacionTipo: TipoEntidadPersonalizable;
  /** Acota "Vincular existente" (p. ej. contratos de un solo tipo). */
  filtro?: FiltroRelacion;
  /** Valores fijos de "Crear nuevo" (p. ej. `{ tipo: "personal" }`): van ocultos en el formulario. */
  valoresCrear?: Record<string, string>;
  tituloCategoria?: string;
  vinculados: FilaCategoria[];
  onVinculado: () => void;
}) {
  const rolEntidad = useAcceso(entidadTipo);
  const rolDestino = useAcceso(relacionTipo);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posicion, setPosicion] = useState<{ top: number; right: number } | null>(null);
  const [montado, setMontado] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // `CrearRegistro` se mantiene montado siempre (ver más abajo) para que su
  // formulario no se desmonte al cerrar este menú; este ref guarda su `abrir`
  // para poder invocarlo desde el ítem del menú sin usar su trigger visual.
  const abrirCrearRef = useRef<(() => void) | null>(null);

  useEffect(() => setMontado(true), []);

  if (!puedeEscribir(rolEntidad)) return null;

  const config = ENTIDADES_PERSONALIZABLES[relacionTipo];
  // Sin permiso de escritura en el destino, `CrearRegistro` no se monta y
  // "Crear … nuevo" quedaba en el menú sin hacer nada al pulsarlo.
  const claveCrear = puedeEscribir(rolDestino) ? CLAVE_CREAR_POR_RELACION[relacionTipo] : undefined;
  const singularMinuscula = config.singular.toLocaleLowerCase("es-PE");

  async function vincular(id: string) {
    setError(null);
    const resultado = await vincularRelacion(entidadTipo, entidadId, relacionTipo, id);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    onVinculado();
  }

  function alternarMenu() {
    if (!menuAbierto && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPosicion({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setMenuAbierto((a) => !a);
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={alternarMenu}
        title={`Agregar ${singularMinuscula}`}
        aria-label={`Agregar ${config.singular} en esta ficha`}
        aria-haspopup="menu"
        aria-expanded={menuAbierto}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {/* Portal con posición fija: si se renderizara dentro de la tarjeta de la
          categoría, el `overflow-hidden` que anima su colapso lo recortaría
          (sobre todo con la categoría contraída, donde casi no hay alto
          debajo del encabezado). */}
      {montado && menuAbierto && posicion && createPortal(
        <>
          <button type="button" tabIndex={-1} aria-label="Cerrar menú" className="fixed inset-0 z-[100] cursor-default" onClick={() => setMenuAbierto(false)} />
          <div
            role="menu"
            data-entity-sheet-portal
            style={{ top: posicion.top, right: posicion.right }}
            className="light-panel fixed z-[101] w-60 rounded-xl border border-[#d9d4c8] bg-[#eeeadf] p-1 shadow-sm"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuAbierto(false); setSelectorAbierto(true); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-neutral-700 hover:bg-[#e5e0d4]"
            >
              <Link2 className="h-3.5 w-3.5 text-neutral-500" /> Vincular {singularMinuscula} existente
            </button>
            {claveCrear && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuAbierto(false); abrirCrearRef.current?.(); }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-neutral-700 hover:bg-[#e5e0d4]"
              >
                <Plus className="h-3.5 w-3.5 text-neutral-500" /> Crear {singularMinuscula} nuevo
              </button>
            )}
          </div>
        </>,
        document.body
      )}
      {/* Montado fuera del menú (no dentro de `menuAbierto &&`): si viviera ahí,
          cerrar el menú al elegir "Crear nuevo" lo desmontaría en el mismo
          render y su formulario nunca llegaría a mostrarse. `hidden` para que
          su contenedor vacío no participe del flujo inline junto al botón
          "+" (nada que ver con `trigger`, que ya no renderiza nada visible):
          sin esto, empuja la alineación vertical del botón. */}
      {claveCrear && (
        <div className="hidden">
          <CrearRegistro
            clave={claveCrear}
            valoresIniciales={valoresCrear}
            camposOcultos={valoresCrear ? Object.keys(valoresCrear) : []}
            onCreado={vincular}
            anclarA={triggerRef}
            trigger={(abrir) => {
              abrirCrearRef.current = abrir;
              return null;
            }}
          />
        </div>
      )}
      {selectorAbierto && (
        <SelectorValorRelacion
          entidadId={entidadId}
          entidadTipoOrigen={esTipoEntidadPersonalizable(entidadTipo) ? entidadTipo : undefined}
          tipoDestino={relacionTipo}
          filtro={filtro}
          tituloCategoria={tituloCategoria}
          vinculados={vinculados.map((fila) => ({
            id: fila.id,
            nombre: Object.values(fila.celdas).find((valor) => valor) ?? config.singular,
            href: fila.href ?? `${config.href}/${fila.id}`,
          }))}
          onClose={() => setSelectorAbierto(false)}
          onSelect={async (opcion) => {
            setSelectorAbierto(false);
            await vincular(opcion.id);
          }}
        />
      )}
      {montado && error && posicion && createPortal(
        <p
          role="alert"
          style={{ top: posicion.top, right: posicion.right }}
          className="fixed z-[101] w-52 rounded-lg border border-red-400/20 bg-[#24151b] px-2.5 py-1.5 text-[10px] leading-4 text-red-200 shadow-xl"
        >
          {error}
        </p>,
        document.body
      )}
    </div>
  );
}

/** Elimina del catálogo global únicamente una categoría creada por el administrador. */
function DeleteCategoryButton({
  tipoId,
  titulo,
  onEliminada,
}: {
  tipoId: string;
  titulo: string;
  onEliminada: () => void;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<"idle" | "confirmando" | "eliminando" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setEstado("eliminando");
    setError(null);
    const resultado = await eliminarTipoDocumento(tipoId);
    if (resultado.ok) {
      onEliminada();
      // La categoría también deja de listarse en "Documentos" del sidebar.
      router.refresh();
      return;
    }
    setError(resultado.error ?? "No se pudo eliminar la categoría");
    setEstado("error");
  }

  if (estado !== "idle") {
    return (
      <div
        className="flex shrink-0 items-center gap-0.5 rounded-md bg-red-500/10 pl-2"
        role="group"
        aria-label={`Confirmar eliminación de la categoría ${titulo}`}
      >
        {/* El error nombra los documentos que bloquean la baja: si se corta con
            "…", el usuario no ve cuáles son ni qué hacer. */}
        <span
          className={cn(
            "text-[10px] font-medium text-red-200",
            estado === "error" ? "max-w-[280px] py-1.5 leading-4" : "max-w-[190px] truncate"
          )}
          title={error ?? undefined}
        >
          {estado === "error" ? error : "¿Eliminarla de todas las fichas?"}
        </span>
        {estado !== "error" && (
          <button
            type="button"
            onClick={confirmar}
            disabled={estado === "eliminando"}
            title="Confirmar eliminación"
            aria-label={`Confirmar eliminación de ${titulo}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {estado === "eliminando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Sí"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setEstado("idle")}
          title={estado === "error" ? "Cerrar" : "Cancelar"}
          aria-label={estado === "error" ? "Cerrar mensaje" : "Cancelar eliminación"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEstado("confirmando")}
      title={`Eliminar categoría ${titulo}`}
      aria-label={`Eliminar categoría ${titulo}`}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-red-500/10 hover:text-red-300"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Quita de esta ficha una categoría de documento PREDEFINIDA (p. ej.
 * "Planos") revelada vacía desde "A partir de una selección" — a diferencia
 * de `DeleteCategoryButton`, que borra el TIPO custom completo, esto sólo
 * limpia el marcador de `carpetas_vacias` de esta entidad (reaparece si se
 * vuelve a elegir el mismo tipo). Sólo se ofrece con `categoria.total === 0`,
 * así que nunca hay documentos de por medio; aun así pide confirmación en un
 * modal (no la píldora en línea de las demás bajas de este panel) porque
 * borrar una categoría entera es un paso más deliberado que quitar una fila.
 */
function EliminarCarpetaDocumentoButton({
  entidadTipo,
  entidadId,
  tipoDocumento,
  titulo,
  onEliminada,
}: {
  entidadTipo: string;
  entidadId: string;
  tipoDocumento: string;
  titulo: string;
  onEliminada: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  async function confirmar() {
    setBorrando(true);
    setError(null);
    const resultado = await eliminarCarpetaVacia(entidadTipo, entidadId, "documento", tipoDocumento);
    if (!resultado.ok) {
      setBorrando(false);
      setError(resultado.error);
      return;
    }
    setBorrando(false);
    setConfirmando(false);
    onEliminada();
  }

  return (
    <>
      <button
        type="button"
        onClick={(evento) => {
          evento.stopPropagation();
          setError(null);
          setConfirmando(true);
        }}
        title={`Eliminar categoría ${titulo}`}
        aria-label={`Eliminar categoría ${titulo}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-red-500/10 hover:text-red-300"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {montado && confirmando && createPortal(
        <div data-entity-sheet-portal className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Cancelar eliminación"
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => !borrando && setConfirmando(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={`Confirmar eliminación de la categoría ${titulo}`}
            className="relative w-full max-w-sm rounded-xl bg-[#0d0f18] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
          >
            <p className="flex items-start gap-2 text-xs text-red-100">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Se quitará la categoría <strong>«{titulo}»</strong> de esta ficha. Está vacía, así que no
                se pierde ningún documento — para volver a verla hay que agregarla de nuevo desde
                &ldquo;A partir de una selección&rdquo;.
              </span>
            </p>
            {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void confirmar()}
                disabled={borrando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {borrando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Sí, eliminar
              </button>
              <button
                type="button"
                onClick={() => { setConfirmando(false); setError(null); }}
                disabled={borrando}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function FilaCategoriaRow({
  fila,
  columnas,
  archivosPrecargados,
  onCambio,
  categoriaTipo,
  relacionTipo,
  entidadTipo,
  entidadId,
  vistaLateral = false,
  arrastre,
}: {
  arrastre: ArrastreOrden;
  fila: FilaCategoria;
  columnas: ColumnaCategoria[];
  /** Archivos de esta fila, precargados en lote por `CategoriaDesplegable`. `undefined` mientras carga. */
  archivosPrecargados?: Archivo[];
  /** Refresca el panel tras un cambio que altera qué filas existen (p. ej. mandar un documento a la papelera). */
  onCambio: () => void;
  vistaLateral?: boolean;
  /** Tipo de la categoría de la fila (sólo "entidad" admite desvincular). */
  categoriaTipo: CategoriaGrupo["tipo"];
  /** Tipo de entidad al otro lado del vínculo (p. ej. "propietario" en la fila del propietario). */
  relacionTipo: string;
  /** Entidad dueña de la ficha donde vive este panel (p. ej. el vehículo). */
  entidadTipo: string;
  entidadId: string;
}) {
  const router = useRouter();
  const rol = useAcceso("documento");
  const rolEntidad = useAcceso(entidadTipo);
  const [abierto, setAbierto] = useState(false);
  const [maximizado, setMaximizado] = useState(false);
  const [archivos, setArchivos] = useState<Archivo[] | undefined>(archivosPrecargados);

  useEffect(() => {
    if (archivosPrecargados !== undefined) setArchivos(archivosPrecargados);
  }, [archivosPrecargados]);

  function agregarLocal(archivo: Archivo) {
    setArchivos((current) => {
      const base = current ?? [];
      return base.some((existente) => existente.id === archivo.id) ? base : [...base, archivo];
    });
  }

  function quitarLocal(id: string) {
    setArchivos((current) => (current ?? []).filter((archivo) => archivo.id !== id));
    setMaximizado((m) => (m ? false : m));
  }

  // Nivel 3: filas de documento o de archivos directos tienen su propio
  // control de despliegue para la vista previa embebida. Cuando la fila
  // tiene exactamente un archivo, los íconos de acción (ampliar, descargar,
  // eliminar) se muestran a la altura de la fila misma, en vez de anidados
  // dentro de una tarjeta con su propia barra de título.
  if (fila.archivosDe) {
    const { entidadTipo: archivoEntidadTipo, entidadId: archivoEntidadId, soloDirecto } = fila.archivosDe;
    const unSoloArchivo = archivos && archivos.length === 1 ? archivos[0] : null;
    const puedeBorrar = puedeEscribir(rol);
    // Los documentos creados desde la app se pueden mandar a la papelera (es
    // reversible: sus archivos y vínculos se conservan). Los migrados de Notion
    // no exponen este botón.
    const mostrarBorrarDoc = archivoEntidadTipo === "documento" && puedeBorrar && fila.origenApp === true;
    // Desvincular (quitar de esta ficha, sin borrar el documento) sí aplica a
    // cualquier documento o contrato, migrado o no — a diferencia de mandarlo
    // a la papelera, no toca el registro en sí.
    const mostrarDesvincularDoc =
      (archivoEntidadTipo === "documento" || archivoEntidadTipo === "contrato") && puedeEscribir(rolEntidad);

    return (
      <>
        <tr {...arrastre.destino(fila.id)} className={cn("glass-row group/fila", arrastre.clase(fila.id))}>
          {columnas.map((columna, index) => {
            const valor = fila.celdas[columna.id] ?? "—";
            const esUltimaColumna = index === columnas.length - 1;
            const iconosAccion = esUltimaColumna && (unSoloArchivo || mostrarBorrarDoc || mostrarDesvincularDoc) ? (
              <div className="flex shrink-0 items-center gap-0.5">
                {unSoloArchivo && (
                  <>
                    {canPreview(unSoloArchivo) && (
                      <WindowAction label="Ampliar dentro del panel" onClick={() => { setAbierto(true); setMaximizado(true); }}>
                        <Maximize2 className="h-3.5 w-3.5" />
                      </WindowAction>
                    )}
                    <a
                      href={`/api/archivos/${unSoloArchivo.id}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Descargar archivo"
                      aria-label="Descargar archivo"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    {puedeBorrar && (
                      <DeleteFileButton archivoId={unSoloArchivo.id} onEliminado={() => quitarLocal(unSoloArchivo.id)} />
                    )}
                  </>
                )}
                {mostrarBorrarDoc && (
                  <DeleteDocumentButton documentoId={archivoEntidadId} onEnviado={onCambio} />
                )}
                {mostrarDesvincularDoc && (
                  <DesvincularButton
                    entidadTipo={entidadTipo}
                    entidadId={entidadId}
                    relacionTipo={archivoEntidadTipo}
                    relacionId={archivoEntidadId}
                    nombre={fila.celdas[columnas[0].id] ?? "este documento"}
                    onQuitado={onCambio}
                  />
                )}
              </div>
            ) : null;

            if (index !== 0) {
              return (
                <td key={columna.id} className="px-3 py-2 text-white/80">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{valor}</span>
                    {iconosAccion}
                  </div>
                </td>
              );
            }
            return (
              <td key={columna.id} className="px-3 py-2 text-white/80">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <AsaFila props={arrastre.asa(fila.id)} />
                    <button
                      type="button"
                      onClick={() => setAbierto((a) => !a)}
                      aria-expanded={abierto}
                      aria-label={abierto ? "Ocultar vista previa" : "Mostrar vista previa"}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
                    >
                      <TrianguloDesplegable abierto={abierto} />
                    </button>
                    {fila.href ? (
                      <Link href={fila.href} className="min-w-0 truncate font-medium text-brand-300 hover:text-brand-200 hover:underline">
                        {valor}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate font-medium text-white/90">{valor}</span>
                    )}
                  </span>
                  {iconosAccion}
                </div>
              </td>
            );
          })}
        </tr>
        {abierto && (
          <tr>
            <td colSpan={columnas.length} className="border-t border-white/[0.05] bg-black/20 px-3 py-3">
              <div className="pl-6">
                {archivos === undefined ? (
                  <div className="h-16 animate-pulse rounded-lg bg-white/[0.04]" />
                ) : unSoloArchivo ? (
                  <div className="space-y-3">
                    <FilePreviewDesnuda
                      archivo={unSoloArchivo}
                      maximizado={maximizado}
                      onCerrarMaximizado={() => setMaximizado(false)}
                    />
                    {archivoEntidadTipo === "vehiculo" ? (
                      <SubirConCarpeta
                        entidadTipo={archivoEntidadTipo}
                        entidadId={archivoEntidadId}
                        onSubido={agregarLocal}
                        carpetasSugeridas={unSoloArchivo.carpeta ? [unSoloArchivo.carpeta] : undefined}
                      />
                    ) : (
                      <SubirArchivos entidadTipo={archivoEntidadTipo} entidadId={archivoEntidadId} onSubido={agregarLocal} />
                    )}
                  </div>
                ) : (
                  <EntityFileBlocks
                    entidadTipo={archivoEntidadTipo}
                    entidadId={archivoEntidadId}
                    incluirDocumentosVinculados={!soloDirecto}
                    vacioMensaje="Sin archivos adjuntos todavía"
                    ocultarEncabezado
                    permitirCarpetas
                    vistaLateral={vistaLateral}
                  />
                )}
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }

  // Filas normales: entidades relacionadas (predio, vehículo, contrato…) —
  // el clic navega a su ficha, sin vista previa (no son archivos).
  if (!fila.href) {
    return (
      <tr {...arrastre.destino(fila.id)} className={cn("group/fila", arrastre.clase(fila.id))}>
        {columnas.map((columna, index) => (
          <td key={columna.id} className="px-3 py-2 text-white/80">
            {index === 0 ? (
              <span className="flex items-center gap-1.5"><AsaFila props={arrastre.asa(fila.id)} />{fila.celdas[columna.id] ?? "—"}</span>
            ) : fila.celdas[columna.id] ?? "—"}
          </td>
        ))}
      </tr>
    );
  }

  const href = fila.href;
  const puedeDesvincular = (categoriaTipo === "entidad" || categoriaTipo === "contrato") && puedeEscribir(rolEntidad);
  return (
    <tr
      {...arrastre.destino(fila.id)}
      className={cn("glass-row group/fila cursor-pointer", arrastre.clase(fila.id))}
      onClick={() => { marcarNavegando(); router.push(href); }}
    >
      {columnas.map((columna, index) => {
        const valor = fila.celdas[columna.id] ?? "—";
        const esUltimaColumna = index === columnas.length - 1;
        const contenido = index === 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <AsaFila props={arrastre.asa(fila.id)} />
            <Link href={href} onClick={(e) => e.stopPropagation()} className="font-medium text-brand-300 hover:text-brand-200 hover:underline">
              {valor}
            </Link>
          </span>
        ) : (
          valor
        );

        if (!esUltimaColumna || !puedeDesvincular) {
          return <td key={columna.id} className="px-3 py-2 text-white/80">{contenido}</td>;
        }
        return (
          <td key={columna.id} className="px-3 py-2 text-white/80">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{contenido}</span>
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <DesvincularButton
                  entidadTipo={entidadTipo}
                  entidadId={entidadId}
                  relacionTipo={relacionTipo}
                  relacionId={fila.id}
                  nombre={fila.celdas[columnas[0].id] ?? "este registro"}
                  onQuitado={onCambio}
                />
              </div>
            </div>
          </td>
        );
      })}
    </tr>
  );
}

function AsaFila({ props }: { props: ReturnType<ArrastreOrden["asa"]> }) {
  return (
    <span
      {...props}
      onClick={(evento) => evento.stopPropagation()}
      className="-ml-1 flex h-5 w-4 shrink-0 cursor-grab items-center justify-center rounded text-white/35 opacity-0 transition-opacity hover:bg-white/[0.08] hover:text-white group-hover/fila:opacity-100 active:cursor-grabbing"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </span>
  );
}

function DialogoRenombrarCategoria({
  tipoId,
  titulo,
  onClose,
  onGuardado,
}: {
  tipoId: string;
  titulo: string;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(titulo);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    const resultado = await renombrarTipoDocumento(tipoId, nombre);
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error ?? "No se pudo renombrar la categoría");
      return;
    }
    onGuardado();
    router.refresh();
    onClose();
  }

  return (
    <DialogoPanel titulo="Renombrar categoría" onClose={onClose}>
      <form onSubmit={guardar} className="space-y-3">
        <input autoFocus required maxLength={120} value={nombre} onChange={(evento) => setNombre(evento.target.value)} className="view-control h-9 w-full" />
        <p className="text-[10px] text-white/40">El nombre cambia en todas las fichas donde aparece esta categoría.</p>
        {error && <p className="text-[11px] text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={guardando} className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.08] hover:text-white">Cancelar</button>
          <button type="submit" disabled={guardando || !nombre.trim()} className="glass-btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
          </button>
        </div>
      </form>
    </DialogoPanel>
  );
}

/**
 * Quita el vínculo entre la entidad dueña de la ficha y una fila de una
 * categoría "entidad" (propietario, predio, vehículo…), sin borrar ningún
 * registro — sólo el par en `vinculos`. Mismo patrón de confirmación en línea
 * que `DeleteDocumentButton`.
 */
function DesvincularButton({
  entidadTipo,
  entidadId,
  relacionTipo,
  relacionId,
  nombre,
  onQuitado,
}: {
  entidadTipo: string;
  entidadId: string;
  relacionTipo: string;
  relacionId: string;
  nombre: string;
  onQuitado: () => void;
}) {
  const [estado, setEstado] = useState<"idle" | "confirmando" | "quitando" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setEstado("quitando");
    setError(null);
    const resultado = await desvincularRelacion(entidadTipo, entidadId, relacionTipo, relacionId);
    if (resultado.ok) {
      onQuitado();
      return;
    }
    setError(resultado.error);
    setEstado("error");
  }

  if (estado !== "idle") {
    return (
      <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-red-500/10 pl-2" role="group" aria-label={`Confirmar desvincular ${nombre}`}>
        <span className="max-w-[150px] truncate text-[10px] font-medium text-red-200" title={error ?? undefined}>
          {estado === "error" ? error ?? "No se pudo quitar" : "¿Quitar vínculo?"}
        </span>
        {estado !== "error" && (
          <button
            type="button"
            onClick={confirmar}
            disabled={estado === "quitando"}
            title="Confirmar"
            aria-label="Confirmar desvincular"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {estado === "quitando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Sí"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setEstado("idle")}
          title={estado === "error" ? "Cerrar" : "Cancelar"}
          aria-label={estado === "error" ? "Cerrar mensaje" : "Cancelar"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <WindowAction label={`Quitar ${nombre}`} onClick={() => setEstado("confirmando")}>
      <Unlink className="h-3.5 w-3.5" />
    </WindowAction>
  );
}

/**
 * Manda un documento a la papelera desde su fila del panel. Reversible (los
 * archivos y vínculos se conservan), así que la confirmación es ligera. Sólo
 * se monta para documentos creados desde la app — ver `mostrarBorrarDoc`.
 */
function DeleteDocumentButton({ documentoId, onEnviado }: { documentoId: string; onEnviado: () => void }) {
  const [estado, setEstado] = useState<"idle" | "confirmando" | "enviando" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setEstado("enviando");
    setError(null);
    const resultado = await eliminarDocumento(documentoId);
    if (resultado.ok) {
      onEnviado();
      return;
    }
    setError(resultado.error);
    setEstado("error");
  }

  if (estado !== "idle") {
    return (
      <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-red-500/10 pl-2" role="group" aria-label="Confirmar envío del documento a la papelera">
        <span className="max-w-[150px] truncate text-[10px] font-medium text-red-200" title={error ?? undefined}>
          {estado === "error" ? error ?? "No se pudo enviar" : "¿A la papelera?"}
        </span>
        {estado !== "error" && (
          <button
            type="button"
            onClick={confirmar}
            disabled={estado === "enviando"}
            title="Confirmar"
            aria-label="Confirmar envío a la papelera"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {estado === "enviando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Sí"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setEstado("idle")}
          title={estado === "error" ? "Cerrar" : "Cancelar"}
          aria-label={estado === "error" ? "Cerrar mensaje" : "Cancelar"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <WindowAction label="Enviar documento a la papelera" onClick={() => setEstado("confirmando")}>
      <Trash2 className="h-3.5 w-3.5" />
    </WindowAction>
  );
}

type TipoFijo = { tipo: string; titulo: string };

/**
 * Alta de documento "+ Documento nuevo": sin paso de Nombre/Fecha — se
 * arrastra o elige el archivo directo, igual que "Archivos", y recién ahí se
 * crea el documento (nombre = nombre del archivo, sin extensión) y se sube
 * contra él. Evita el viejo formulario de dos pasos, que pedía datos antes
 * de saber siquiera qué archivo se iba a subir.
 */
function NuevoDocumentoDirecto({
  entidadTipo,
  entidadId,
  tipoFijo,
  onArchivoSubido,
  onCerrar,
}: {
  entidadTipo: string;
  entidadId: string;
  tipoFijo?: TipoFijo;
  /**
   * Cada archivo que termina de subir: la fila del documento nuevo tiene que
   * volver a leer sus archivos, o se queda mostrando "sin archivos" hasta
   * recargar la página. Se llama aunque este formulario ya se haya cerrado.
   */
  onArchivoSubido?: () => void;
  /** Cierra el formulario y refresca la lista (recarga la nueva fila y sus archivos). */
  onCerrar: () => void;
}) {
  const subidas = useSubidas();
  const [arrastrando, setArrastrando] = useState(false);
  const [documentoId, setDocumentoId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [subidos, setSubidos] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (!tipoFijo) return null;

  async function resolverDocumentoId(nombreArchivo: string): Promise<string | null> {
    if (documentoId) return documentoId;
    setCreando(true);
    setError(null);
    const nombre = nombreArchivo.replace(/\.[^./]+$/, "").trim().slice(0, 240) || tipoFijo!.titulo;
    const resultado = await crearDocumentoEnCategoria({ entidadTipo, entidadId, tipoDocumento: tipoFijo!.tipo, nombre, fecha: null });
    setCreando(false);
    if (!resultado.ok) { setError(resultado.error); return null; }
    setDocumentoId(resultado.documentoId);
    return resultado.documentoId;
  }

  async function manejarArchivos(archivos: FileList | File[]) {
    const lista = Array.from(archivos);
    if (lista.length === 0) return;
    const id = await resolverDocumentoId(lista[0].name);
    if (!id) return;
    subidas.subir(lista, {
      entidadTipo: "documento",
      entidadId: id,
      onSubido: () => {
        setSubidos((n) => n + 1);
        onArchivoSubido?.();
      },
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand-400/20 bg-brand-500/[0.06] p-3">
      <p className="text-[11px] font-medium text-white/75">Sube el archivo de &ldquo;{tipoFijo.titulo}&rdquo;</p>
      <div
        onDragOver={(evento) => { evento.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(evento) => {
          evento.preventDefault();
          setArrastrando(false);
          if (evento.dataTransfer.files?.length) void manejarArchivos(evento.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-4 text-center transition-colors",
          arrastrando ? "border-brand-400/60 bg-brand-500/[0.06]" : "border-white/[0.14] hover:border-white/25"
        )}
      >
        <UploadCloud className="h-5 w-5 text-white/45" />
        <p className="text-[11px] text-white/60">Arrastra archivos aquí o</p>
        {/* El selector es el global (`SubidasProvider`), no un <input> dentro
            de este menú: con uno propio, el "click fantasma" de Chrome al
            cerrar el diálogo del sistema podía cerrar el panel lateral y
            llevarse el archivo elegido sin subirlo. */}
        <button
          type="button"
          disabled={creando}
          onClick={() => subidas.elegirArchivos((archivos) => void manejarArchivos(archivos))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/[0.1] disabled:opacity-50"
        >
          {creando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Subir archivos
        </button>
      </div>
      {subidos > 0 && (
        <p className="text-[11px] text-emerald-300">
          {subidos} archivo{subidos === 1 ? "" : "s"} subido{subidos === 1 ? "" : "s"}.
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-[11px] text-red-300">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
        </p>
      )}
      <button type="button" onClick={onCerrar} className="glass-btn-primary px-3 py-1.5 text-[11px]">
        {documentoId ? "Listo, cerrar" : "Cerrar"}
      </button>
    </div>
  );
}
