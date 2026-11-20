import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Banknote, Calendar, ChevronRight, FolderOpen, HardDrive,
  Hash, MapPin, Tag,
} from "lucide-react";
import { PropertyPill } from "@/components/ui/property-pill";
import { EditableText } from "@/components/ui/editable-text";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { HistorialPanel } from "@/components/ui/historial-panel";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { EliminarRegistro } from "@/components/ui/eliminar-registro";
import { cargarCategoriasEntidad } from "@/lib/relaciones/agrupar";
import { TIPO_PREDIO_OPCIONES, REGISTRADO_OPCIONES, A_NOMBRE_DE_OPCIONES, SI_NO_OPCIONES } from "../opciones";
import { EntityPropertyList, EntityPropertyRow } from "@/components/ui/entity-sheet";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { esUuid } from "@/lib/contratos/adendas";
import { JerarquiaPredio } from "../jerarquia-predio";

export default async function PredioFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const supabase = await createClient();

  const [
    { data: predio, error: predioError },
    categoriasPorId,
    propiedadesPersonalizadas,
  ] = await Promise.all([
    supabase
      .from("predios")
      .select("*")
      .eq("id", id)
      .single(),
    cargarCategoriasEntidad(supabase, "predio", [id]),
    cargarPropiedadesPersonalizadas(supabase, "predio", [id]),
  ]);

  if (predioError && predioError.code !== "PGRST116") throw new Error("No se pudo cargar el predio");
  if (!predio) notFound();
  const categorias = categoriasPorId[id] ?? [];

  // Si tiene padre, lo cargamos
  let padre: { id: string; nombre: string } | null = null;
  if (predio.predio_padre_id) {
    const { data } = await supabase
      .from("predios")
      .select("id, nombre")
      .eq("id", predio.predio_padre_id)
      .single();
    padre = data;
  }


  return (
    <div className="flex flex-col h-full">
      <Header title={predio.nombre} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1320px] px-6 py-8 sm:px-8 sm:py-10">

          <div className="mb-6 flex items-center justify-between gap-3">
            <Link
              href="/entidades/predios"
              className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Predios
            </Link>
            <HistorialPanel tabla="predios" registroId={predio.id} titulo={predio.nombre} />
          </div>

          {/* Breadcrumb de jerarquía */}
          {padre && (
            <div className="mb-6 flex items-center gap-1.5 text-xs text-white/45">
              <MapPin className="h-3.5 w-3.5 text-white/30" />
              <Link
                href={`/entidades/predios/${padre.id}`}
                className="hover:text-brand-300 font-medium"
              >
                {padre.nombre}
              </Link>
              <ChevronRight className="h-3 w-3 text-white/20" />
              <span className="text-white/85 font-medium">{predio.nombre}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <EntityPropertyList ordenKey="predio" entidadTipo="predio">
              <EntityPropertyRow icon={<MapPin className="h-3.5 w-3.5" />} label="Nombre">
                <EditableText tabla="predios" id={predio.id} campo="nombre" valorInicial={predio.nombre} revalidar={`/entidades/predios/${id}`} placeholder="Sin nombre" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Tipo" campo="tipo_predio">
                <PropertyPill tabla="predios" id={predio.id} campo="tipo_predio" valor={predio.tipo_predio} opciones={TIPO_PREDIO_OPCIONES} revalidar={`/entidades/predios/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Estado" campo="registrado">
                <PropertyPill tabla="predios" id={predio.id} campo="registrado" valor={predio.registrado} opciones={REGISTRADO_OPCIONES} revalidar={`/entidades/predios/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="A nombre de" campo="a_nombre_de">
                <PropertyPill tabla="predios" id={predio.id} campo="a_nombre_de" valor={predio.a_nombre_de} opciones={A_NOMBRE_DE_OPCIONES} revalidar={`/entidades/predios/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Hash className="h-3.5 w-3.5" />} label="N° de partida" campo="n_partida">
                <EditableText tabla="predios" id={predio.id} campo="n_partida" valorInicial={predio.n_partida} revalidar={`/entidades/predios/${id}`} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<MapPin className="h-3.5 w-3.5" />} label="Ubicación" campo="ubicacion" align="start">
                <EditableText tabla="predios" id={predio.id} campo="ubicacion" valorInicial={predio.ubicacion} revalidar={`/entidades/predios/${id}`} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<MapPin className="h-3.5 w-3.5" />} label="Coordenadas" campo="coordenadas">
                <EditableText tabla="predios" id={predio.id} campo="coordenadas" valorInicial={predio.coordenadas} revalidar={`/entidades/predios/${id}`} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Calendar className="h-3.5 w-3.5" />} label="Fecha de adquisición" campo="fecha_adquisicion">
                <EditableText tabla="predios" id={predio.id} campo="fecha_adquisicion" valorInicial={predio.fecha_adquisicion} revalidar={`/entidades/predios/${id}`} inputType="date" placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Banknote className="h-3.5 w-3.5" />} label="Monto copia literal" campo="monto_copia_literal">
                <EditableText tabla="predios" id={predio.id} campo="monto_copia_literal" valorInicial={predio.monto_copia_literal?.toString()} revalidar={`/entidades/predios/${id}`} inputType="number" min={0} step="0.01" placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<HardDrive className="h-3.5 w-3.5" />} label="Archivador Drive" campo="archivador_drive">
                <PropertyPill tabla="predios" id={predio.id} campo="archivador_drive" valor={predio.archivador_drive} opciones={SI_NO_OPCIONES} revalidar={`/entidades/predios/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<FolderOpen className="h-3.5 w-3.5" />} label="Archivador físico" campo="archivador_fisico">
                <PropertyPill tabla="predios" id={predio.id} campo="archivador_fisico" valor={predio.archivador_fisico} opciones={SI_NO_OPCIONES} revalidar={`/entidades/predios/${id}`} />
              </EntityPropertyRow>
              <FilasPropiedadesPersonalizadas
                entidadTipo="predio"
                entidadId={predio.id}
                propiedades={propiedadesPersonalizadas.definiciones}
                valores={propiedadesPersonalizadas.valoresPorEntidad[predio.id] ?? {}}
              />
            </EntityPropertyList>

            <div>
              <DocumentosYRelaciones entidadTipo="predio" entidadId={predio.id} categorias={categorias} titulo="Documentos y relaciones" permitirCrearTipo />
            </div>
          </div>

          <div className="mt-8">
            <JerarquiaPredio predioId={predio.id} />
          </div>

          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Detalles</h3>
            <NotionBlockEditor tabla="predios" id={predio.id} campo="detalles" valorInicial={predio.detalles} revalidar={`/entidades/predios/${id}`} placeholder="Sin detalles" />
          </div>

          <div className="mt-8 border-t border-white/[0.06] pt-6">
            <EliminarRegistro clave="predios" id={predio.id} nombre={predio.nombre} />
          </div>

        </div>
      </div>
    </div>
  );
}
