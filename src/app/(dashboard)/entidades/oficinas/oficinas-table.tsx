"use client";

import { RelacionField } from "@/components/ui/relacion-field";

import { useEffect, useMemo, useState } from "react";
import SuggestiveSearch from "@/components/ui/suggestive-search";
import Link from "next/link";
import { Building2, Car, CheckCircle2, Hash, Landmark, MapPin, NotebookPen, Shapes } from "lucide-react";
import {
  EntityPropertyList,
  EntityPropertyRow,
  EntityPropertyValue,
  EntitySheet,
} from "@/components/ui/entity-sheet";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { EditableText } from "@/components/ui/editable-text";
import { InlineEditableText } from "@/components/ui/inline-editable-text";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { AccionesRegistro, EliminarRegistro } from "@/components/ui/eliminar-registro";
import { cargarCategoriasEntidad, type CategoriaGrupo } from "@/lib/relaciones/agrupar";
import { columnasRelacion, columnasRelacionVacias } from "@/components/ui/columnas-relacion";
import type { EntidadRelacion } from "@/lib/relaciones/contratos";
import { AttachmentCount, RecordsTable, type RecordColumn } from "@/components/ui/records-table";
import { BOTON_NUEVO_CLASE, CrearRegistro, NuevoEnGrupo } from "@/components/ui/crear-registro";
import { ExportMenu } from "@/components/ui/export-menu";
import { columnasDesdeTabla, descripcionFiltros } from "@/lib/export/tabla";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas, type PropiedadPersonalizada, type PropiedadesPersonalizadasCargadas } from "@/lib/propiedades/personalizadas";
import { createClient } from "@/lib/supabase/client";

const REVALIDAR = "/entidades/oficinas";

export type PredioOficina = {
  id: string;
  nombre: string;
  n_partida: string | null;
  tipo_predio: string | null;
  registrado: boolean | null;
  a_nombre_de: string | null;
  ubicacion: string | null;
};

export type VehiculoOficina = {
  id: string;
  placa: string;
  marca_modelo: string | null;
  categoria: string | null;
  responsable: string | null;
  n_partida: string | null;
};

export type OficinaRegistral = {
  id: string;
  nombre: string;
  predios: PredioOficina[];
  vehiculos: VehiculoOficina[];
};

/** Predios cuyo tipo no es urbano ni rural (tipos agregados desde "Editar propiedad"): no se pierden en el resumen. */
function contarOtrosTipos(predios: { tipo_predio: string | null }[]) {
  return predios.filter((predio) => predio.tipo_predio && predio.tipo_predio !== "urbano" && predio.tipo_predio !== "rural").length;
}

export function OficinasTable({ oficinas, adjuntosPorId = {}, relacionesPorId = {}, propiedadesIniciales }: { oficinas: OficinaRegistral[]; adjuntosPorId?: Record<string, number>; relacionesPorId?: Record<string, EntidadRelacion[]>; propiedadesIniciales?: PropiedadesPersonalizadasCargadas }) {
  const [abierta, setAbierta] = useState<OficinaRegistral | null>(null);
  const [q, setQ] = useState("");

  const oficinasFiltradas = useMemo(() => {
    const query = q.trim().toLocaleLowerCase("es-PE");
    if (!query) return oficinas;
    return oficinas.filter((oficina) => {
      const contenido = [
        oficina.nombre,
        ...oficina.predios.map((predio) => `${predio.nombre} ${predio.n_partida ?? ""}`),
        ...oficina.vehiculos.map((vehiculo) => `${vehiculo.placa} ${vehiculo.marca_modelo ?? ""}`),
      ].join(" ").toLocaleLowerCase("es-PE");
      return contenido.includes(query);
    });
  }, [oficinas, q]);

  const slotFiltros = (
    <div className="flex min-w-0 flex-1 max-w-[400px] items-center">
      <SuggestiveSearch
        value={q}
        onChange={setQ}
        suggestions={["Buscar oficina…", "Buscar predio, partida o placa…"]}
        effect="typewriter"
        typeDurationMs={600}
        pauseAfterTypeMs={2000}
        className="w-full"
      />
    </div>
  );

  const columns: RecordColumn<OficinaRegistral>[] = [
    {
      id: "oficina",
      label: "Oficina registral",
      render: (oficina) => (
        <div className="flex min-w-[190px] items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-400/25 bg-brand-500/15">
            <Landmark className="h-4 w-4 text-brand-300" />
          </div>
          <InlineEditableText tabla="oficinas_registrales" id={oficina.id} campo="nombre" valorInicial={oficina.nombre} revalidar={REVALIDAR} className="font-semibold text-white" onOpen={() => setAbierta(oficina)} />
        </div>
      ),
      sortValue: (oficina) => oficina.nombre,
      filterValue: (oficina) => oficina.nombre,
      stopRowClick: true,
    },
    {
      id: "predios",
      label: "Predios",
      render: (oficina) => <RelacionField entidadTipo="oficina_registral" entidadId={oficina.id} tipo="predio" relaciones={(relacionesPorId[oficina.id] ?? []).filter((r) => r.entidadTipo === "predio")} />,
      sortValue: (oficina) => oficina.predios.length,
      filterValue: (oficina) => oficina.predios.map((predio) => `${predio.nombre} ${predio.n_partida ?? ""}`).join(" "),
    },
    {
      id: "registral",
      label: "Información registral",
      render: (oficina) => {
        const registrados = oficina.predios.filter((predio) => predio.registrado === true).length;
        const conPartida = oficina.predios.filter((predio) => predio.n_partida).length;
        return (
          <div className="flex min-w-[180px] flex-wrap gap-1.5">
            <span className="badge bg-emerald-500/15 text-emerald-200">{registrados} registrados</span>
            <span className="badge bg-blue-500/15 text-blue-200">{conPartida} con partida</span>
          </div>
        );
      },
      sortValue: (oficina) => oficina.predios.filter((predio) => predio.registrado === true).length,
      filterValue: (oficina) => `${oficina.predios.filter((predio) => predio.registrado === true).length} registrados ${oficina.predios.filter((predio) => predio.n_partida).length} con partida`,
    },
    {
      id: "vehiculos",
      label: "Vehículos",
      render: (oficina) => <RelacionField entidadTipo="oficina_registral" entidadId={oficina.id} tipo="vehiculo" relaciones={(relacionesPorId[oficina.id] ?? []).filter((r) => r.entidadTipo === "vehiculo")} />,
      sortValue: (oficina) => oficina.vehiculos.length,
      filterValue: (oficina) => oficina.vehiculos.map((vehiculo) => `${vehiculo.placa} ${vehiculo.marca_modelo ?? ""}`).join(" "),
    },
    {
      id: "cobertura",
      label: "Cobertura",
      render: (oficina) => {
        const conPartida = oficina.predios.filter((predio) => predio.n_partida).length;
        const porcentaje = oficina.predios.length ? Math.round((conPartida / oficina.predios.length) * 100) : 0;
        return (
          <div className="flex min-w-[150px] items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
              <div className="h-full rounded-full bg-brand-400" style={{ width: `${porcentaje}%` }} />
            </div>
            <span className="w-9 text-right text-xs font-semibold text-white/75">{porcentaje}%</span>
          </div>
        );
      },
      sortValue: (oficina) => oficina.predios.length ? oficina.predios.filter((predio) => predio.n_partida).length / oficina.predios.length : 0,
      filterValue: (oficina) => oficina.predios.length ? Math.round((oficina.predios.filter((predio) => predio.n_partida).length / oficina.predios.length) * 100) : 0,
    },
    ...columnasRelacion<OficinaRegistral>({ entidadTipo: "oficina_registral", relacionesPorId: relacionesPorId, idDe: (oficina) => oficina.id, excluir: ["oficina_registral", "predio", "vehiculo"] }),
    {
      id: "adjuntos",
      tipo: "adjuntos",
      tipoFijo: true,
      label: "Adjuntos vinculados",
      render: (oficina) => <AttachmentCount count={adjuntosPorId[oficina.id] ?? 0} />,
      sortValue: (oficina) => adjuntosPorId[oficina.id] ?? 0,
      filterValue: (oficina) => adjuntosPorId[oficina.id] ?? 0,
    },
    {
      id: "acciones",
      tipo: "acciones",
      tipoFijo: true,
      label: "Acciones",
      menuLabel: "Acciones",
      render: (oficina) => (
        <AccionesRegistro
          href={`/entidades/oficinas/${oficina.id}`}
          clave="oficinas_registrales"
          id={oficina.id}
          nombre={oficina.nombre}
          onEliminado={() => setAbierta(null)}
        />
      ),
      className: "sticky right-0 z-[2] border-l border-white/[0.06] bg-[#10121a]/95 text-right backdrop-blur-sm",
      headerClassName: "sticky right-0 z-10 border-l border-white/[0.06] bg-[#151824]/95 text-right backdrop-blur-sm",
      hideable: false,
      reorderable: false,
      stopRowClick: true,
    },
  ];

  return (
    <>
      <RecordsTable
        rows={oficinasFiltradas}
        columns={columns}
        entidadTipo="oficina_registral"
        propiedadesIniciales={propiedadesIniciales}
        defaultHidden={columnasRelacionVacias(relacionesPorId)}
        slotIzquierda={slotFiltros}
        acciones={(filas) => (
          <div className="flex items-center gap-1.5">
            <CrearRegistro clave="oficinas_registrales" className={BOTON_NUEVO_CLASE} />
            <ExportMenu nombre="oficinas-registrales" filtros={descripcionFiltros([["Búsqueda", q]])} titulo="Oficinas registrales — Inversiones Cavala" columnas={columnasDesdeTabla(columns)} filas={filas} />
          </div>
        )}
        rowKey={(oficina) => oficina.id}
        onRowClick={setAbierta}
        storageKey="oficinas-registrales"
        countLabel={`${oficinasFiltradas.length} oficina${oficinasFiltradas.length !== 1 ? "s" : ""} registral${oficinasFiltradas.length !== 1 ? "es" : ""}${q.trim() ? ` · filtrado de ${oficinas.length}` : ""}`}
        nuevoEnGrupo={(grupo) => <NuevoEnGrupo clave="oficinas_registrales" grupo={grupo} valoresBase={{ predios: [], vehiculos: [] }} />}
      />
      <OficinaSheet oficina={oficinas.find((o) => o.id === abierta?.id) ?? null} onClose={() => setAbierta(null)} />
    </>
  );
}

function OficinaSheet({ oficina, onClose }: { oficina: OficinaRegistral | null; onClose: () => void }) {
  // La consulta de la página no trae `extra` (arma el árbol de predios y
  // vehículos), así que las notas se piden aparte al abrir el panel.
  const [notas, setNotas] = useState<string | null>(null);
  const [notasListas, setNotasListas] = useState(false);
  const [categorias, setCategorias] = useState<CategoriaGrupo[] | null>(null);
  const [propiedades, setPropiedades] = useState<PropiedadPersonalizada[]>([]);
  const [valoresPersonalizados, setValoresPersonalizados] = useState<Record<string, unknown>>({});
  const oficinaId = oficina?.id ?? null;

  useEffect(() => {
    setNotas(null);
    setNotasListas(false);
    setCategorias(null);
    setPropiedades([]);
    setValoresPersonalizados({});
    if (!oficinaId) return;
    // Al cambiar de registro rápido, una respuesta del anterior puede llegar
    // después: sin esto el panel mostraba (y editaba) el registro equivocado.
    let vigente = true;
    const supabase = createClient();
    supabase
      .from("oficinas_registrales")
      .select("extra")
      .eq("id", oficinaId)
      .single()
      .then(({ data }) => {
        if (!vigente) return;
        const extra = (data?.extra ?? {}) as Record<string, unknown>;
        setNotas(typeof extra.notas === "string" ? extra.notas : null);
        setNotasListas(true);
      });
    cargarCategoriasEntidad(supabase, "oficina_registral", [oficinaId]).then((porId) => { if (vigente) setCategorias(porId[oficinaId] ?? []); });
    cargarPropiedadesPersonalizadas(supabase, "oficina_registral", [oficinaId]).then((c) => {
      if (!vigente) return;
      setPropiedades(c.definiciones);
      setValoresPersonalizados(c.valoresPorEntidad[oficinaId] ?? {});
    });
    return () => {
      vigente = false;
    };
  }, [oficinaId]);

  async function recargarPropiedades() {
    if (!oficinaId) return;
    const c = await cargarPropiedadesPersonalizadas(createClient(), "oficina_registral", [oficinaId]);
    setPropiedades(c.definiciones);
    setValoresPersonalizados(c.valoresPorEntidad[oficinaId] ?? {});
  }

  const registrados = oficina?.predios.filter((predio) => predio.registrado === true).length ?? 0;
  const conPartida = oficina?.predios.filter((predio) => predio.n_partida).length ?? 0;
  const urbanos = oficina?.predios.filter((predio) => predio.tipo_predio === "urbano").length ?? 0;
  const rurales = oficina?.predios.filter((predio) => predio.tipo_predio === "rural").length ?? 0;
  const otrosTipos = oficina ? contarOtrosTipos(oficina.predios) : 0;

  return (
    <EntitySheet
      open={oficina !== null}
      onClose={onClose}
      historial={oficinaId ? { tabla: "oficinas_registrales", registroId: oficinaId, titulo: oficina?.nombre ?? undefined } : undefined}
      titulo={oficina?.nombre ?? "Oficina registral"}
      tituloEditor={oficina ? (
        <EditableText tabla="oficinas_registrales" id={oficina.id} campo="nombre" valorInicial={oficina.nombre} revalidar={REVALIDAR} appearance="title" placeholder="Sin nombre" />
      ) : undefined}
      subtitulo="Oficina registral · activos vinculados"
    >
      {oficina && (
        <>
          <EntityPropertyList ordenKey="oficina_registral" entidadTipo="oficina_registral">
            <EntityPropertyRow icon={<MapPin className="h-3.5 w-3.5" />} label="Predios vinculados" campo="predios">
              <EntityPropertyValue>{oficina.predios.length}</EntityPropertyValue>
            </EntityPropertyRow>
            <EntityPropertyRow icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Registrados" campo="registrados">
              <EntityPropertyValue>{registrados}</EntityPropertyValue>
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Hash className="h-3.5 w-3.5" />} label="Con N° de partida" campo="con_partida">
              <EntityPropertyValue>{conPartida}</EntityPropertyValue>
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Shapes className="h-3.5 w-3.5" />} label="Tipo de predio" campo="tipo_predio">
              <div className="flex flex-wrap gap-1.5 py-1">
                <span className="badge bg-blue-500/20 text-blue-300">{urbanos} urbanos</span>
                <span className="badge bg-emerald-500/20 text-emerald-300">{rurales} rurales</span>
                {otrosTipos > 0 && <span className="badge bg-white/10 text-white/70">{otrosTipos} otros</span>}
              </div>
            </EntityPropertyRow>
            <EntityPropertyRow icon={<Car className="h-3.5 w-3.5" />} label="Vehículos vinculados" campo="vehiculos">
              <EntityPropertyValue>{oficina.vehiculos.length}</EntityPropertyValue>
            </EntityPropertyRow>
            <FilasPropiedadesPersonalizadas
              entidadTipo="oficina_registral"
              entidadId={oficina.id}
              propiedades={propiedades}
              valores={valoresPersonalizados}
              onCreada={recargarPropiedades}
            />
          </EntityPropertyList>

          <div>
            <DocumentosYRelaciones
              entidadTipo="oficina_registral"
              entidadId={oficina.id}
              categorias={categorias}
              titulo="Documentos y relaciones"
              permitirCrearTipo
              vistaLateral
            />
          </div>

          {oficina.predios.length > 0 && (
            <SheetSection icon={<Building2 className="h-3.5 w-3.5" />} title={`Predios (${oficina.predios.length})`}>
              <div className="scrollbar-glass max-h-72 space-y-1 overflow-y-auto pr-1">
                {oficina.predios.map((predio) => (
                  <Link
                    key={predio.id}
                    href={`/entidades/predios/${predio.id}`}
                    className="flex items-center justify-between gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0 truncate text-xs text-white/70">{predio.nombre}</span>
                    <span className="shrink-0 font-mono text-[10px] text-white/30">{predio.n_partida ?? "Sin partida"}</span>
                  </Link>
                ))}
              </div>
            </SheetSection>
          )}

          {oficina.vehiculos.length > 0 && (
            <SheetSection icon={<Car className="h-3.5 w-3.5" />} title={`Vehículos (${oficina.vehiculos.length})`}>
              <div className="scrollbar-glass max-h-56 space-y-1 overflow-y-auto pr-1">
                {oficina.vehiculos.map((vehiculo) => (
                  <Link
                    key={vehiculo.id}
                    href={`/entidades/vehiculos/${vehiculo.id}`}
                    className="flex items-center justify-between gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
                  >
                    <span className="font-mono text-xs font-medium text-white/75">{vehiculo.placa}</span>
                    <span className="min-w-0 truncate text-[10px] text-white/30">{vehiculo.marca_modelo ?? "Sin modelo"}</span>
                  </Link>
                ))}
              </div>
            </SheetSection>
          )}

          <SheetSection icon={<NotebookPen className="h-3.5 w-3.5" />} title="Notas y particularidades">
            {notasListas ? (
              <NotionBlockEditor
                tabla="oficinas_registrales"
                id={oficina.id}
                campo="extra.notas"
                valorInicial={notas}
                revalidar={REVALIDAR}
                placeholder="Anota contactos, horarios o particularidades de esta oficina…"
              />
            ) : (
              <p className="text-xs text-white/40">Cargando notas…</p>
            )}
          </SheetSection>

          <EliminarRegistro clave="oficinas_registrales" id={oficina.id} nombre={oficina.nombre} onEliminado={onClose} />

          <Link
            href={`/entidades/oficinas/${oficina.id}`}
            className="inline-block text-xs text-brand-300 hover:text-brand-200"
          >
            Ver ficha completa →
          </Link>
        </>
      )}
    </EntitySheet>
  );
}

function SheetSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5 text-white/80">
        <span className="text-white/40">{icon}</span>
        <h3 className="text-[13px] font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}
