"use client";

import { useRegistroActualizado } from "@/components/ui/use-registro-actualizado";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { CalendarDays, FileText, Loader2, Tag } from "lucide-react";
import SuggestiveSearch from "@/components/ui/suggestive-search";
import { PropertyPill, type OpcionPill } from "@/components/ui/property-pill";
import { EntityPropertyList, EntityPropertyRow, EntitySheet } from "@/components/ui/entity-sheet";
import { InlineEditableText } from "@/components/ui/inline-editable-text";
import { EditableText } from "@/components/ui/editable-text";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { AccionesRegistro, EliminarRegistro } from "@/components/ui/eliminar-registro";
import { columnasRelacion, columnasRelacionVacias } from "@/components/ui/columnas-relacion";
import { AttachmentCount, RecordsTable, type RecordColumn } from "@/components/ui/records-table";
import { BOTON_NUEVO_CLASE, CrearRegistro, NuevoEnGrupo } from "@/components/ui/crear-registro";
import { ExportMenu } from "@/components/ui/export-menu";
import { columnasDesdeTabla, descripcionFiltros } from "@/lib/export/tabla";
import { createClient } from "@/lib/supabase/client";
import { TIPOS } from "./tipos";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas, type PropiedadPersonalizada, type PropiedadesPersonalizadasCargadas } from "@/lib/propiedades/personalizadas";
import { cargarCategoriasEntidad, type CategoriaGrupo } from "@/lib/relaciones/agrupar";
import type { EntidadRelacion } from "@/lib/relaciones/contratos";

type Documento = {
  id: string;
  tipo: string;
  nombre: string;
  fecha: string | null;
  detalle: string | null;
};

const REVALIDAR = "/documentos";

function formatFecha(f: string | null) {
  return f ? new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : null;
}

export function DocumentosList({
  documentos,
  tiposDisponibles,
  // Modo server: busqueda + total + hasMore (filtros en backend, search actualiza URL)
  busqueda,
  total,
  hasMore: hasMoreInicial,
  nextOffset: nextOffsetInicial,
  // Modo local (retrocompat, p.ej. copias-literales): count sin busqueda
  count,
  adjuntosPorId = {},
  relacionesPorId = {},
  showType = true,
  storageKey = "documentos",
  tiposMap,
  tipoFijo,
  propiedadesIniciales,
}: {
  documentos: Documento[];
  tiposDisponibles: string[];
  busqueda?: string;
  total?: number;
  hasMore?: boolean;
  nextOffset?: number;
  count?: number;
  adjuntosPorId?: Record<string, number>;
  relacionesPorId?: Record<string, EntidadRelacion[]>;
  showType?: boolean;
  storageKey?: string;
  tiposMap?: Record<string, string>;
  tipoFijo?: string;
  propiedadesIniciales?: PropiedadesPersonalizadasCargadas;
}) {
  const isServerMode = busqueda !== undefined;
  const router = useRouter();
  const pathname = usePathname();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [abierto, setAbierto] = useState<string | null>(null);
  const [qLocal, setQLocal] = useState(busqueda ?? "");

  // Sincroniza el input con el valor del servidor cuando cambia por navegación
  // externa (p.ej. el usuario limpia el campo y el servidor devuelve "").
  useEffect(() => {
    if (isServerMode) setQLocal(busqueda);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  function handleBusqueda(valor: string) {
    setQLocal(valor);
    if (!isServerMode) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (valor.trim()) params.set("q", valor.trim());
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    }, 400);
  }

  // ── Infinity scroll ────────────────────────────────────────────────────────
  const [allRows, setAllRows] = useState<Documento[]>(documentos);
  const [allAdjuntos, setAllAdjuntos] = useState<Record<string, number>>(adjuntosPorId);
  const [allRelaciones, setAllRelaciones] = useState<Record<string, EntidadRelacion[]>>(relacionesPorId);
  const [hasMoreLocal, setHasMoreLocal] = useState(hasMoreInicial ?? false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Refs síncronos: evitan race conditions que surgen de leer estado de React
  // (async) dentro del callback del IntersectionObserver.
  const isLoadingRef = useRef(false);
  const offsetRef = useRef(nextOffsetInicial ?? documentos.length);
  const hasMoreRef = useRef(hasMoreInicial ?? false);

  // Cuando el servidor re-renderiza (edición inline revalida la caché),
  // actualiza las filas del servidor sin descartar las cargadas por scroll.
  const primeraVez = useRef(true);
  useEffect(() => {
    if (primeraVez.current) { primeraVez.current = false; return; }
    setAllRows((prev) => {
      const serverById = new Map(documentos.map((d) => [d.id, d]));
      return prev.map((row) => serverById.get(row.id) ?? row);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentos]);

  async function cargarMas() {
    if (isLoadingRef.current || !hasMoreRef.current) return;
    isLoadingRef.current = true; // mutex síncrono: bloquea llamadas concurrentes
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ offset: String(offsetRef.current) });
      if (busqueda) params.set("q", busqueda);
      if (tipoFijo) params.set("tipo", tipoFijo);
      const res = await fetch(`/api/documentos?${params}`);
      if (!res.ok) return;
      const datos = await res.json() as {
        rows: Documento[];
        adjuntosPorId: Record<string, number>;
        relacionesPorId: Record<string, EntidadRelacion[]>;
        nextOffset: number | null;
      };
      // Actualizar refs síncronamente antes del re-render.
      offsetRef.current = datos.nextOffset ?? offsetRef.current;
      hasMoreRef.current = datos.nextOffset !== null;
      setAllRows((prev) => [...prev, ...datos.rows]);
      setAllAdjuntos((prev) => ({ ...prev, ...datos.adjuntosPorId }));
      setAllRelaciones((prev) => ({ ...prev, ...datos.relacionesPorId }));
      setHasMoreLocal(datos.nextOffset !== null);
    } finally {
      isLoadingRef.current = false;
      setLoadingMore(false);
    }
  }
  const cargarMasRef = useRef(cargarMas);
  cargarMasRef.current = cargarMas;

  useEffect(() => {
    if (!isServerMode) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Usar el contenedor con scroll como root del observer: así la intersección
    // se calcula respecto al área visible del scroll interno, no el viewport.
    // Sin esto, con pocos rows el sentinel queda visible y carga toda la BD.
    let scrollParent: Element | null = sentinel.parentElement;
    while (scrollParent && scrollParent !== document.documentElement) {
      const { overflowY } = window.getComputedStyle(scrollParent);
      if (overflowY === "auto" || overflowY === "scroll") break;
      scrollParent = scrollParent.parentElement;
    }

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) cargarMasRef.current(); },
      { root: scrollParent, rootMargin: "0px 0px 120px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  // Se re-registra cuando loadingMore cambia a false para re-evaluar si el
  // sentinel sigue visible tras agregar filas (sin salida/entrada del viewport).
  }, [isServerMode, loadingMore]);
  // ──────────────────────────────────────────────────────────────────────────

  const tipos = tiposMap ?? TIPOS;
  const tipoOpciones: OpcionPill[] = tiposDisponibles.map((t) => ({
    value: t,
    label: tipos[t] ?? t,
    className: "bg-blue-500/15 text-blue-300",
  }));

  // En modo server el servidor ya filtró; allRows acumula páginas.
  // En modo local filtramos aquí sobre la lista completa recibida.
  const documentosFiltrados = useMemo(() => {
    if (isServerMode) return allRows;
    const query = qLocal.trim().toLocaleLowerCase("es-PE");
    return allRows.filter((d) => {
      if (query && !(d.nombre ?? "").toLocaleLowerCase("es-PE").includes(query)) return false;
      return true;
    });
  }, [allRows, qLocal, isServerMode]);

  // Indicador visual mientras el debounce no ha llegado al servidor todavía.
  const isPendingSearch = isServerMode && qLocal.trim() !== (busqueda ?? "").trim();

  const efectivoTotal = total ?? count ?? documentos.length;
  const hayBusqueda = isServerMode ? (busqueda ?? "").trim() !== "" : qLocal.trim() !== "";

  const slotBusqueda = (
    <div className="flex min-w-0 flex-1 max-w-[580px] items-center gap-2">
      <svg width="0" height="0" className="absolute">
        <filter id="blob-toolbar">
          <feGaussianBlur stdDeviation="10" in="SourceGraphic" />
          <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -9" result="blob" />
          <feBlend in="SourceGraphic" in2="blob" />
        </filter>
      </svg>
      <div
        className="flex flex-1 items-center [&>div]:rounded-full [&>div]:bg-[#eeeadf] [&>div]:backdrop-blur-xl"
        style={{ filter: "url(#blob-toolbar)" }}
      >
        <div className="relative z-10 min-w-[150px] flex-1 overflow-hidden rounded-full">
          <SuggestiveSearch
            value={qLocal}
            onChange={handleBusqueda}
            suggestions={["Buscar documento…", "Buscar por nombre…"]}
            effect="typewriter"
            typeDurationMs={600}
            pauseAfterTypeMs={2000}
            className="w-full"
          />
        </div>
      </div>
      {isPendingSearch && (
        <span className="text-[10px] text-white/40 shrink-0">Buscando…</span>
      )}
    </div>
  );

  const allColumns: RecordColumn<Documento>[] = [
    {
      id: "nombre",
      label: "Documento",
      render: (documento) => <InlineEditableText tabla="documentos" id={documento.id} campo="nombre" valorInicial={documento.nombre} revalidar={REVALIDAR} className="min-w-[260px] font-medium text-white/95" onOpen={() => setAbierto(documento.id)} />,
      sortValue: (documento) => documento.nombre,
      filterValue: (documento) => documento.nombre,
      stopRowClick: true,
    },
    {
      id: "tipo",
      tipo: "seleccion",
      label: "Tipo",
      render: (documento) => <PropertyPill tabla="documentos" id={documento.id} campo="tipo" valor={documento.tipo} opciones={tipoOpciones} revalidar={REVALIDAR} />,
      sortValue: (documento) => documento.tipo,
      filterValue: (documento) => tipos[documento.tipo] ?? documento.tipo,
      valorCreacionGrupo: (documento) => documento.tipo,
      preFillParaGrupo: (valor) => ({ tipo: valor }),
      stopRowClick: true,
      // El vocabulario de `documentos.tipo` ya es editable, pero desde su propia
      // pantalla: las categorías son también secciones del sidebar y rutas.
      editorOpcionesPersonalizado: (
        <Link
          href="/documentos/tipos"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] text-brand-200 transition-colors hover:bg-brand-500/10 hover:text-brand-100"
        >
          <Tag className="h-3 w-3" /> Administrar categorías
        </Link>
      ),
    },
    // A qué predio, propietario, contrato… pertenece cada documento: lo mismo
    // que "Documentos y relaciones" del panel lateral y de la ficha.

    ...columnasRelacion<Documento>({ entidadTipo: "documento", relacionesPorId: allRelaciones, idDe: (documento) => documento.id, excluir: ["documento"] }),
    {
      id: "fecha",
      label: "Fecha",
      tipo: "fecha",
      tipoFijo: true,
      render: (documento) => <InlineEditableText tabla="documentos" id={documento.id} campo="fecha" valorInicial={documento.fecha} revalidar={REVALIDAR} inputType="date" placeholder="—" className="whitespace-nowrap text-xs text-white/75" renderValor={(valor) => formatFecha(valor)} />,
      sortValue: (documento) => documento.fecha ? new Date(documento.fecha) : null,
      filterValue: (documento) => documento.fecha,
      stopRowClick: true,
    },
    {
      id: "detalle",
      label: "Detalle",
      render: (documento) => <InlineEditableText tabla="documentos" id={documento.id} campo="detalle" valorInicial={documento.detalle} revalidar={REVALIDAR} placeholder="—" className="min-w-[220px] max-w-[340px] line-clamp-2 text-xs leading-5 text-white/75" />,
      sortValue: (documento) => documento.detalle,
      filterValue: (documento) => documento.detalle,
      stopRowClick: true,
    },
    {
      id: "adjuntos",
      tipo: "adjuntos",
      tipoFijo: true,
      label: "Adjuntos",
      render: (documento) => <AttachmentCount count={allAdjuntos[documento.id] ?? 0} />,
      sortValue: (documento) => allAdjuntos[documento.id] ?? 0,
      filterValue: (documento) => allAdjuntos[documento.id] ?? 0,
    },
    {
      id: "acciones",
      tipo: "acciones",
      tipoFijo: true,
      label: "Acciones",
      menuLabel: "Acciones",
      render: (documento) => (
        <AccionesRegistro
          href={`/documentos/${documento.id}`}
          clave="documentos"
          id={documento.id}
          nombre={documento.nombre}
          onEliminado={() => setAbierto(null)}
        />
      ),
      className: "sticky right-0 z-[2] border-l border-white/[0.06] bg-[#10121a]/95 text-right backdrop-blur-sm",
      headerClassName: "sticky right-0 z-10 border-l border-white/[0.06] bg-[#151824]/95 text-right backdrop-blur-sm",
      hideable: false,
      reorderable: false,
      stopRowClick: true,
    },
  ];
  const columns = allColumns;

  return (
    <>
      <RecordsTable rows={documentosFiltrados} columns={columns} entidadTipo="documento" subtipoPropiedades={tipoFijo} subtipoPropiedadesLabel={tipoFijo ? (tipos[tipoFijo] ?? tipoFijo) : undefined} propiedadesIniciales={propiedadesIniciales}
        slotIzquierda={slotBusqueda}
        acciones={(filas) => (
          <div className="flex items-center gap-1.5">
            <CrearRegistro clave="documentos" className={BOTON_NUEVO_CLASE} valoresIniciales={tipoFijo ? { tipo: tipoFijo } : undefined} />
            <ExportMenu nombre="documentos" filtros={descripcionFiltros([["Búsqueda", qLocal], ["Tipo", tipoFijo]])} titulo="Documentos — Inversiones Cavala" columnas={columnasDesdeTabla(columns)} filas={filas} />
          </div>
        )} rowKey={(documento) => documento.id} onRowClick={(documento) => setAbierto(documento.id)} storageKey={storageKey}
        countLabel={(() => {
          const loaded = isServerMode ? allRows.length : documentosFiltrados.length;
          if (hasMoreLocal)
            return `${loaded} de ${efectivoTotal} documento${efectivoTotal !== 1 ? "s" : ""}${hayBusqueda ? ` · "${busqueda}"` : ""}`;
          if (hayBusqueda)
            return `${efectivoTotal} documento${efectivoTotal !== 1 ? "s" : ""} · "${isServerMode ? busqueda : qLocal.trim()}"`;
          return `${efectivoTotal} documento${efectivoTotal !== 1 ? "s" : ""}`;
        })()}
        defaultHidden={["detalle", ...columnasRelacionVacias(allRelaciones)]}
        nuevoEnGrupo={(grupo) => <NuevoEnGrupo clave="documentos" grupo={grupo} valoresBase={tipoFijo ? { tipo: tipoFijo } : undefined} />} />

      {isServerMode && (
        <div className="flex flex-col items-center">
          <div ref={sentinelRef} className="h-px w-full" />
          {loadingMore && <Loader2 className="my-4 h-4 w-4 animate-spin text-white/30" />}
        </div>
      )}

      <DocumentoSheet id={abierto} onClose={() => setAbierto(null)} tipoOpciones={tipoOpciones} tipos={tipos} />
    </>
  );
}

function DocumentoSheet({ id, onClose, tipoOpciones, tipos }: { id: string | null; onClose: () => void; tipoOpciones: OpcionPill[]; tipos: Record<string, string> }) {
  const [documento, setDocumento] = useState<Record<string, any> | null>(null);
  useRegistroActualizado("documentos", id, setDocumento);
  const [categorias, setCategorias] = useState<CategoriaGrupo[] | null>(null);
  const [propiedades, setPropiedades] = useState<PropiedadPersonalizada[]>([]);
  const [valoresPersonalizados, setValoresPersonalizados] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!id) {
      setDocumento(null);
      setCategorias(null);
      setPropiedades([]);
      setValoresPersonalizados({});
      return;
    }
    setDocumento(null);
    setCategorias(null);
    // Al cambiar de registro rápido, una respuesta del anterior puede llegar
    // después: sin esto el panel mostraba (y editaba) el registro equivocado.
    let vigente = true;
    const supabase = createClient();
    supabase.from("documentos").select("*").eq("id", id).single().then(({ data }) => { if (vigente) setDocumento(data); });
    cargarCategoriasEntidad(supabase, "documento", [id]).then((porId) => { if (vigente) setCategorias(porId[id] ?? []); });
    return () => {
      vigente = false;
    };
  }, [id]);

  // Las propiedades sólo se saben una vez cargado el documento: dependen de
  // su `tipo` (una de "Minutas" no debe verse en "Testimonios").
  useEffect(() => {
    if (!id || !documento) return;
    let vigente = true;
    cargarPropiedadesPersonalizadas(createClient(), "documento", [id], documento.tipo).then((c) => {
      if (!vigente) return;
      setPropiedades(c.definiciones);
      setValoresPersonalizados(c.valoresPorEntidad[id] ?? {});
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- documento?.tipo es la dependencia precisa; el objeto entero causaría re-ejecuciones innecesarias
  }, [id, documento?.tipo]);

  async function recargarPropiedades() {
    if (!id || !documento) return;
    const c = await cargarPropiedadesPersonalizadas(createClient(), "documento", [id], documento.tipo);
    setPropiedades(c.definiciones);
    setValoresPersonalizados(c.valoresPorEntidad[id] ?? {});
  }

  return (
    <EntitySheet
      open={id !== null}
      onClose={onClose}
      historial={id ? { tabla: "documentos", registroId: id, titulo: documento?.nombre ?? undefined } : undefined}
      titulo={documento?.nombre ?? "Cargando…"}
      tituloEditor={documento ? (
        <EditableText tabla="documentos" id={documento.id} campo="nombre" valorInicial={documento.nombre} revalidar={REVALIDAR} appearance="title" placeholder="Sin nombre" />
      ) : undefined}
      subtitulo={documento ? formatFecha(documento.fecha) ?? undefined : undefined}
      icono={
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/25 bg-blue-500/15">
          <FileText className="h-5 w-5 text-blue-300" />
        </div>
      }
    >
      {!documento ? (
        <p className="text-sm text-white/40">Cargando…</p>
      ) : (
        <>
          <EntityPropertyList ordenKey="documento" entidadTipo="documento">
            <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Tipo" campo="tipo">
              <PropertyPill tabla="documentos" id={documento.id} campo="tipo" valor={documento.tipo} opciones={tipoOpciones} revalidar={REVALIDAR} />
            </EntityPropertyRow>
            <EntityPropertyRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Fecha" campo="fecha">
              <EditableText tabla="documentos" id={documento.id} campo="fecha" valorInicial={documento.fecha} revalidar={REVALIDAR} inputType="date" placeholder="—" />
            </EntityPropertyRow>
            <FilasPropiedadesPersonalizadas
              entidadTipo="documento"
              subtipo={documento.tipo}
              subtipoLabel={tipos[documento.tipo] ?? documento.tipo}
              entidadId={documento.id}
              propiedades={propiedades}
              valores={valoresPersonalizados}
              onCreada={recargarPropiedades}
            />
          </EntityPropertyList>

          <DocumentosYRelaciones
            entidadTipo="documento"
            entidadId={documento.id}
            categorias={categorias}
            titulo="Documentos y relaciones"
            permitirCrearTipo
            vistaLateral
          />

          <NotionBlockEditor
            tabla="documentos"
            id={documento.id}
            campo="detalle"
            valorInicial={documento.detalle}
            revalidar={REVALIDAR}
            placeholder="Sin detalle"
          />

          <EliminarRegistro clave="documentos" id={documento.id} nombre={documento.nombre} onEliminado={onClose} />

          <Link href={`/documentos/${documento.id}`} className="inline-block text-xs text-brand-300 hover:text-brand-200">
            Ver ficha completa →
          </Link>
        </>
      )}
    </EntitySheet>
  );
}
