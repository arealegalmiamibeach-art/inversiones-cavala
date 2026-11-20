import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Tag } from "lucide-react";
import { PropertyPill, type OpcionPill } from "@/components/ui/property-pill";
import { EditableText } from "@/components/ui/editable-text";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { HistorialPanel } from "@/components/ui/historial-panel";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { EliminarRegistro } from "@/components/ui/eliminar-registro";
import { getTiposCompletos } from "../tipos-custom";
import { EntityPropertyList, EntityPropertyRow } from "@/components/ui/entity-sheet";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { cargarCategoriasEntidad } from "@/lib/relaciones/agrupar";
import { esUuid } from "@/lib/contratos/adendas";

export default async function DocumentoFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const supabase = await createClient();

  const [TIPOS, { data: documento, error: documentoError }] = await Promise.all([
    getTiposCompletos(),
    supabase.from("documentos").select("*").eq("id", id).single(),
  ]);

  if (documentoError && documentoError.code !== "PGRST116") throw new Error("No se pudo cargar el documento");
  if (!documento) notFound();

  const [categoriasPorId, propiedadesPersonalizadas] = await Promise.all([
    cargarCategoriasEntidad(supabase, "documento", [id]),
    cargarPropiedadesPersonalizadas(supabase, "documento", [id], documento.tipo),
  ]);

  const categorias = categoriasPorId[id] ?? [];

  // El editor ofrece el enum completo (no solo los tipos ya usados) — al
  // reclasificar un documento tiene sentido ver todas las opciones válidas.
  const tipoOpciones: OpcionPill[] = Object.keys(TIPOS).map((t) => ({
    value: t,
    label: TIPOS[t],
    className: "bg-blue-500/15 text-blue-300",
  }));

  return (
    <div className="flex flex-col h-full">
      <Header title={documento.nombre} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1320px] px-6 py-8 sm:px-8 sm:py-10">

          <div className="mb-6 flex items-center justify-between gap-3">
            <Link href="/documentos" className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Documentos
            </Link>
            <HistorialPanel tabla="documentos" registroId={documento.id} titulo={documento.nombre} />
          </div>

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <EntityPropertyList ordenKey="documento" entidadTipo="documento">
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Nombre">
                <EditableText tabla="documentos" id={documento.id} campo="nombre" valorInicial={documento.nombre} revalidar={`/documentos/${id}`} placeholder="Sin nombre" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Tipo" campo="tipo">
                <PropertyPill tabla="documentos" id={documento.id} campo="tipo" valor={documento.tipo} opciones={tipoOpciones} revalidar={`/documentos/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Fecha" campo="fecha">
                <EditableText tabla="documentos" id={documento.id} campo="fecha" valorInicial={documento.fecha} revalidar={`/documentos/${id}`} inputType="date" placeholder="—" />
              </EntityPropertyRow>
              <FilasPropiedadesPersonalizadas
                entidadTipo="documento"
                subtipo={documento.tipo}
                subtipoLabel={TIPOS[documento.tipo] ?? documento.tipo}
                entidadId={documento.id}
                propiedades={propiedadesPersonalizadas.definiciones}
                valores={propiedadesPersonalizadas.valoresPorEntidad[documento.id] ?? {}}
              />
            </EntityPropertyList>

            <div>
              <DocumentosYRelaciones entidadTipo="documento" entidadId={documento.id} categorias={categorias} titulo="Documentos y relaciones" permitirCrearTipo />
            </div>
          </div>

          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Detalle</h3>
            <NotionBlockEditor tabla="documentos" id={documento.id} campo="detalle" valorInicial={documento.detalle} revalidar={`/documentos/${id}`} placeholder="Sin detalle" />
          </div>

          <div className="mt-8 border-t border-white/[0.06] pt-6">
            <EliminarRegistro clave="documentos" id={documento.id} nombre={documento.nombre} />
          </div>

        </div>
      </div>
    </div>
  );
}
