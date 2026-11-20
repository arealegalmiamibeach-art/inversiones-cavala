import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Gem, Hash, Link2, MapPin, Tag } from "lucide-react";
import { PropertyPill } from "@/components/ui/property-pill";
import { EditableText } from "@/components/ui/editable-text";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { HistorialPanel } from "@/components/ui/historial-panel";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { EliminarRegistro } from "@/components/ui/eliminar-registro";
import { cargarCategoriasEntidad } from "@/lib/relaciones/agrupar";
import { SUSTANCIA_OPCIONES, ESTADO_OPCIONES } from "../opciones";
import { EntityPropertyList, EntityPropertyRow } from "@/components/ui/entity-sheet";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { esUuid } from "@/lib/contratos/adendas";

export default async function ConcesionFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const supabase = await createClient();

  const [{ data: concesion, error: concesionError }, categoriasPorId, propiedadesPersonalizadas] = await Promise.all([
    supabase.from("concesiones_mineras").select("*").eq("id", id).single(),
    cargarCategoriasEntidad(supabase, "concesion", [id]),
    cargarPropiedadesPersonalizadas(supabase, "concesion", [id]),
  ]);

  if (concesionError && concesionError.code !== "PGRST116") throw new Error("No se pudo cargar la concesión minera");
  if (!concesion) notFound();
  const categorias = categoriasPorId[id] ?? [];

  return (
    <div className="flex flex-col h-full">
      <Header title={concesion.nombre} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1320px] px-6 py-8 sm:px-8 sm:py-10">

          <div className="mb-6 flex items-center justify-between gap-3">
            <Link href="/entidades/concesiones" className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Concesiones
            </Link>
            <HistorialPanel tabla="concesiones_mineras" registroId={concesion.id} titulo={concesion.nombre} />
          </div>

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <EntityPropertyList ordenKey="concesion" entidadTipo="concesion">
              <EntityPropertyRow icon={<Gem className="h-3.5 w-3.5" />} label="Nombre">
                <EditableText tabla="concesiones_mineras" id={concesion.id} campo="nombre" valorInicial={concesion.nombre} revalidar={`/entidades/concesiones/${id}`} placeholder="Sin nombre" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Sustancia" campo="sustancia">
                <PropertyPill tabla="concesiones_mineras" id={concesion.id} campo="sustancia" valor={concesion.sustancia} opciones={SUSTANCIA_OPCIONES} revalidar={`/entidades/concesiones/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Estado" campo="estado">
                <PropertyPill tabla="concesiones_mineras" id={concesion.id} campo="estado" valor={concesion.estado} opciones={ESTADO_OPCIONES} revalidar={`/entidades/concesiones/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Hash className="h-3.5 w-3.5" />} label="Código" campo="codigo">
                <EditableText tabla="concesiones_mineras" id={concesion.id} campo="codigo" valorInicial={concesion.codigo} revalidar={`/entidades/concesiones/${id}`} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Gem className="h-3.5 w-3.5" />} label="Hectáreas" campo="hectareas">
                <EditableText tabla="concesiones_mineras" id={concesion.id} campo="hectareas" valorInicial={concesion.hectareas?.toString()} revalidar={`/entidades/concesiones/${id}`} inputType="number" min={0} step="0.0001" placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<MapPin className="h-3.5 w-3.5" />} label="Ubicación" campo="ubicacion" align="start">
                <EditableText tabla="concesiones_mineras" id={concesion.id} campo="ubicacion" valorInicial={concesion.ubicacion} revalidar={`/entidades/concesiones/${id}`} placeholder="Sin ubicación" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Link2 className="h-3.5 w-3.5" />} label="Ubicación (mapa)" campo="url_ubicacion" align="start">
                <EditableText tabla="concesiones_mineras" id={concesion.id} campo="url_ubicacion" valorInicial={concesion.url_ubicacion} revalidar={`/entidades/concesiones/${id}`} placeholder="https://…" />
              </EntityPropertyRow>
              <FilasPropiedadesPersonalizadas
                entidadTipo="concesion"
                entidadId={concesion.id}
                propiedades={propiedadesPersonalizadas.definiciones}
                valores={propiedadesPersonalizadas.valoresPorEntidad[concesion.id] ?? {}}
              />
            </EntityPropertyList>

            <div>
              <DocumentosYRelaciones entidadTipo="concesion" entidadId={concesion.id} categorias={categorias} titulo="Documentos y relaciones" permitirCrearTipo />
            </div>
          </div>

          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Notas</h3>
            <NotionBlockEditor
              tabla="concesiones_mineras"
              id={concesion.id}
              campo="extra.notas"
              valorInicial={concesion.extra?.notas}
              revalidar={`/entidades/concesiones/${id}`}
              placeholder="Anota vigencias, pagos, observaciones de campo…"
            />
          </div>

          <div className="mt-8 border-t border-white/[0.06] pt-6">
            <EliminarRegistro clave="concesiones_mineras" id={concesion.id} nombre={concesion.nombre} />
          </div>

        </div>
      </div>
    </div>
  );
}
