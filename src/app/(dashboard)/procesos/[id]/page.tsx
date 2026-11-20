import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Gavel, Scale, Tag, UserRound, Users } from "lucide-react";
import { PropertyPill } from "@/components/ui/property-pill";
import { EditableText } from "@/components/ui/editable-text";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { EliminarRegistro } from "@/components/ui/eliminar-registro";
import { DiligenciasPanel } from "@/components/ui/diligencias-panel";
import { cargarEventosDeProceso, proximaDiligenciaRegistrada } from "@/lib/procesos/eventos";
import { FechaProximaDiligencia } from "@/components/ui/fecha-proxima-diligencia";
import { cargarFeriados } from "@/lib/feriados-server";
import { HistorialPanel } from "@/components/ui/historial-panel";
import { diligenciasDeProceso, hoyISO } from "@/lib/procesos/diligencias";
import { materiaInfo } from "@/lib/procesos/materias";
import { partesDeProceso } from "@/lib/procesos/partes";
import { cargarOpcionesColumna } from "@/lib/opciones-columna";
import { MATERIA_OPCIONES, MATERIAS as MATERIA_LABEL } from "../opciones";
import { cargarEstadosProcesos, opcionesEstadoPill } from "@/lib/procesos/estados";
import { ProcesoRelacionesPanel } from "@/components/ui/proceso-relaciones";
import { cargarRelacionesEntidad } from "@/lib/relaciones/contratos";
import { cargarCategoriasEntidad } from "@/lib/relaciones/agrupar";
import { EntityPropertyList, EntityPropertyRow } from "@/components/ui/entity-sheet";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { esUuid } from "@/lib/contratos/adendas";

export default async function ProcesoFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const supabase = await createClient();

  const { data: proceso, error: procesoError } = await supabase.from("procesos").select("*").eq("id", id).single();
  if (procesoError && procesoError.code !== "PGRST116") throw new Error("No se pudo cargar el proceso");
  if (!proceso) notFound();

  const [relacionesPorProceso, propiedadesPersonalizadas, categoriasPorProceso, estadosProcesos, opcionesMateria] = await Promise.all([
    cargarRelacionesEntidad(supabase, "proceso", [id]),
    cargarPropiedadesPersonalizadas(supabase, "proceso", [id], proceso.materia),
    cargarCategoriasEntidad(supabase, "proceso", [id]),
    cargarEstadosProcesos(supabase),
    cargarOpcionesColumna(supabase, "procesos"),
  ]);
  const relaciones = relacionesPorProceso[id] ?? [];
  const categoriasArchivos = categoriasPorProceso[id] ?? [];
  const opcionesEstado = opcionesEstadoPill(estadosProcesos, proceso.materia);
  const etiquetasMateria = Object.fromEntries((opcionesMateria.materia ?? []).map((opcion) => [opcion.valor, opcion.etiqueta]));

  const titulo = proceso.expediente ?? etiquetasMateria[proceso.materia] ?? MATERIA_LABEL[proceso.materia] ?? proceso.materia;
  const info = materiaInfo(proceso.materia, etiquetasMateria);
  const hoy = hoyISO();
  const diligencias = diligenciasDeProceso(proceso);
  const [eventosProceso, feriados, { data: perfiles }] = await Promise.all([
    cargarEventosDeProceso(supabase, proceso.id, hoy),
    cargarFeriados(supabase),
    supabase.from("perfiles").select("id, nombre, correo").eq("activo", true).order("nombre"),
  ]);
  const responsables = (perfiles ?? []).map((p) => ({
    id: p.id as string,
    nombre: (p.nombre as string | null) || (p.correo as string | null) || "Sin nombre",
  }));
  const proxima = proximaDiligenciaRegistrada(proceso, eventosProceso, hoy);

  return (
    <div className="flex flex-col h-full">
      <Header title={titulo} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1320px] px-6 py-8 sm:px-8 sm:py-10">

          <div className="mb-6 flex items-center justify-between gap-3">
            <Link href={`/procesos/materia/${encodeURIComponent(info.slug)}`} className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/80">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver a {info.etiqueta}
            </Link>
            <HistorialPanel tabla="procesos" registroId={proceso.id} titulo={titulo} />
          </div>

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <EntityPropertyList ordenKey="proceso" entidadTipo="proceso">
              <EntityPropertyRow icon={<CalendarClock className="h-3.5 w-3.5" />} label="Próxima diligencia" campo="proxima_diligencia">
                <FechaProximaDiligencia procesoId={id} fecha={proxima?.fechaISO} eventoId={proxima?.eventoId} hora={proxima?.hora} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Gavel className="h-3.5 w-3.5" />} label="Expediente">
                <EditableText tabla="procesos" id={proceso.id} campo="expediente" valorInicial={proceso.expediente} revalidar={`/procesos/${id}`} placeholder="Sin número de expediente" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Materia" campo="materia">
                <PropertyPill tabla="procesos" id={proceso.id} campo="materia" valor={proceso.materia} opciones={MATERIA_OPCIONES} revalidar={`/procesos/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Estado" campo="estado">
                <PropertyPill tabla="procesos" id={proceso.id} campo="estado" valor={proceso.estado} opciones={opcionesEstado} gestion={{ tipo: "estado-proceso", materia: proceso.materia }} revalidar={`/procesos/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Scale className="h-3.5 w-3.5" />} label="Asunto" campo="asunto" align="start">
                <EditableText tabla="procesos" id={proceso.id} campo="asunto" valorInicial={proceso.asunto} revalidar={`/procesos/${id}`} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Scale className="h-3.5 w-3.5" />} label="Juzgado" campo="juzgado" align="start">
                <EditableText tabla="procesos" id={proceso.id} campo="juzgado" valorInicial={proceso.juzgado} revalidar={`/procesos/${id}`} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<UserRound className="h-3.5 w-3.5" />} label="Abogado" campo="abogado">
                <EditableText tabla="procesos" id={proceso.id} campo="abogado" valorInicial={proceso.abogado} revalidar={`/procesos/${id}`} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<UserRound className="h-3.5 w-3.5" />} label="Estudio" campo="estudio">
                <EditableText tabla="procesos" id={proceso.id} campo="estudio" valorInicial={proceso.estudio} revalidar={`/procesos/${id}`} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Scale className="h-3.5 w-3.5" />} label="Diligencia" campo="diligencia" align="start">
                <EditableText tabla="procesos" id={proceso.id} campo="diligencia" valorInicial={proceso.diligencia} revalidar={`/procesos/${id}`} placeholder="—" />
              </EntityPropertyRow>
              {partesDeProceso(proceso.materia, proceso.extra).map((parte) => (
                <EntityPropertyRow key={parte.clave} icon={<Users className="h-3.5 w-3.5" />} label={parte.label} campo={`extra:${parte.clave}`} align="start">
                  <EditableText tabla="procesos" id={proceso.id} campo={`extra.${parte.clave}`} valorInicial={parte.valor} revalidar={`/procesos/${id}`} multiline placeholder="—" />
                </EntityPropertyRow>
              ))}
              <FilasPropiedadesPersonalizadas
                entidadTipo="proceso"
                subtipo={proceso.materia}
                subtipoLabel={info.etiqueta}
                entidadId={proceso.id}
                propiedades={propiedadesPersonalizadas.definiciones}
                valores={propiedadesPersonalizadas.valoresPorEntidad[proceso.id] ?? {}}
              />
            </EntityPropertyList>

            <div>
              <DocumentosYRelaciones entidadTipo="proceso" entidadId={proceso.id} categorias={categoriasArchivos} titulo="Archivos del expediente" permitirCrearTipo />
            </div>
          </div>

          {/* Diligencias y audiencias (tabla `eventos` + fechas detectadas en el texto) */}
          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              Diligencias y audiencias{eventosProceso.length ? ` (${eventosProceso.length})` : ""}
            </h3>
            <DiligenciasPanel
              procesoId={proceso.id}
              eventos={eventosProceso}
              detectadas={diligencias}
              hoy={hoy}
              responsables={responsables}
              feriados={Array.from(feriados.keys())}
            />
          </div>

          {/* Propiedades de relación: visibles y editables incluso cuando aún están vacías. */}
          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Relaciones patrimoniales</h3>
            <ProcesoRelacionesPanel procesoId={proceso.id} relaciones={relaciones} />
          </div>

          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Descripción / Historial</h3>
            <NotionBlockEditor
              tabla="procesos"
              id={proceso.id}
              campo="descripcion"
              valorInicial={proceso.descripcion}
              revalidar={`/procesos/${id}`}
              placeholder="Sin descripción registrada"
            />
          </div>

          <div className="mt-8 border-t border-white/[0.06] pt-6">
            <EliminarRegistro clave="procesos" id={proceso.id} nombre={proceso.expediente ?? titulo} />
          </div>

        </div>
      </div>
    </div>
  );
}
