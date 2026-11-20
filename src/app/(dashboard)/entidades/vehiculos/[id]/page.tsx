import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Calendar, Car, FileSignature, FolderOpen, HardDrive, Hash, ShieldCheck, Tag, Wrench } from "lucide-react";
import { PropertyPill, type OpcionPill } from "@/components/ui/property-pill";
import { EditableText } from "@/components/ui/editable-text";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { HistorialPanel } from "@/components/ui/historial-panel";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { EliminarRegistro } from "@/components/ui/eliminar-registro";
import { cargarCategoriasEntidad } from "@/lib/relaciones/agrupar";
import { cargarArrendamientosVehiculos } from "@/lib/vehiculos/arrendamientos";
import { ArrendamientosSection } from "../arrendamientos-section";
import { EntityPropertyList, EntityPropertyRow, EntityPropertyValue } from "@/components/ui/entity-sheet";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { diasHastaFechaISO } from "@/lib/utils";
import { esUuid } from "@/lib/contratos/adendas";

const CATEGORIA_OPCIONES: OpcionPill[] = [
  { value: "Línea amarilla",  label: "Línea amarilla",  className: "bg-amber-500/15 text-amber-300" },
  { value: "Vehículo pesado", label: "Vehículo pesado", className: "bg-indigo-500/15 text-indigo-300" },
];
const RESPONSABLE_OPCIONES: OpcionPill[] = [
  { value: "cava",   label: "CAVA",   className: "bg-blue-500/15 text-blue-300" },
  { value: "dipier", label: "DIPIER", className: "bg-violet-500/15 text-violet-300" },
  { value: "lcv",    label: "LCV",    className: "bg-emerald-500/15 text-emerald-300" },
];
const SI_NO_OPCIONES: OpcionPill[] = [
  { value: "true",  label: "Sí", className: "bg-emerald-500/15 text-emerald-300" },
  { value: "false", label: "No", className: "bg-white/10 text-white/50" },
];

function diasRestantes(fecha: string | null): number | null {
  if (!fecha) return null;
  return diasHastaFechaISO(fecha);
}

function VencimientoAviso({ fecha }: { fecha: string | null }) {
  if (!fecha) return null;
  const dias = diasRestantes(fecha);
  if (dias === null || dias > 30) return null;
  const textColor = dias <= 15 ? "text-red-300" : "text-amber-300";
  return (
    <p className={`mt-1 flex items-center gap-1 text-xs ${textColor}`}>
      <AlertTriangle className="h-3 w-3" />
      {dias <= 0 ? "Vencido" : `Vence en ${dias} días`}
    </p>
  );
}

export default async function VehiculoFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const supabase = await createClient();

  const [{ data: vehiculo, error: vehiculoError }, categoriasPorId, arrendamientosPorId, propiedadesPersonalizadas] = await Promise.all([
    supabase.from("vehiculos").select("*").eq("id", id).single(),
    cargarCategoriasEntidad(supabase, "vehiculo", [id]),
    cargarArrendamientosVehiculos(supabase, [id]),
    cargarPropiedadesPersonalizadas(supabase, "vehiculo", [id]),
  ]);
  const categorias = categoriasPorId[id] ?? [];
  const arrendamientos = arrendamientosPorId[id] ?? [];

  if (vehiculoError && vehiculoError.code !== "PGRST116") throw new Error("No se pudo cargar el vehículo");
  if (!vehiculo) notFound();

  return (
    <div className="flex flex-col h-full">
      <Header title={vehiculo.placa} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1320px] px-6 py-8 sm:px-8 sm:py-10">

          <div className="mb-6 flex items-center justify-between gap-3">
            <Link href="/entidades/vehiculos" className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Vehículos
            </Link>
            <HistorialPanel tabla="vehiculos" registroId={vehiculo.id} titulo={vehiculo.placa} />
          </div>

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <EntityPropertyList ordenKey="vehiculo" entidadTipo="vehiculo">
              <EntityPropertyRow icon={<Car className="h-3.5 w-3.5" />} label="Placa">
                <EditableText tabla="vehiculos" id={vehiculo.id} campo="placa" valorInicial={vehiculo.placa} revalidar={`/entidades/vehiculos/${id}`} placeholder="Sin placa" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Car className="h-3.5 w-3.5" />} label="Marca / Modelo" campo="marca_modelo">
                <EditableText tabla="vehiculos" id={vehiculo.id} campo="marca_modelo" valorInicial={vehiculo.marca_modelo} revalidar={`/entidades/vehiculos/${id}`} placeholder="Sin marca o modelo" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Categoría" campo="categoria">
                <PropertyPill tabla="vehiculos" id={vehiculo.id} campo="categoria" valor={vehiculo.categoria} opciones={CATEGORIA_OPCIONES} revalidar={`/entidades/vehiculos/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Responsable" campo="responsable">
                <PropertyPill tabla="vehiculos" id={vehiculo.id} campo="responsable" valor={vehiculo.responsable} opciones={RESPONSABLE_OPCIONES} revalidar={`/entidades/vehiculos/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="SOAT vence" campo="soat" align="start">
                <EditableText tabla="vehiculos" id={vehiculo.id} campo="soat_vence" valorInicial={vehiculo.soat_vence} revalidar={`/entidades/vehiculos/${id}`} inputType="date" placeholder="—" />
                <VencimientoAviso fecha={vehiculo.soat_vence} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Póliza vence" campo="poliza" align="start">
                <EditableText tabla="vehiculos" id={vehiculo.id} campo="poliza_vence" valorInicial={vehiculo.poliza_vence} revalidar={`/entidades/vehiculos/${id}`} inputType="date" placeholder="—" />
                <VencimientoAviso fecha={vehiculo.poliza_vence} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Wrench className="h-3.5 w-3.5" />} label="Revisión técnica vence" campo="revision_tecnica" align="start">
                <EditableText tabla="vehiculos" id={vehiculo.id} campo="revision_tecnica" valorInicial={vehiculo.revision_tecnica} revalidar={`/entidades/vehiculos/${id}`} inputType="date" placeholder="—" />
                <VencimientoAviso fecha={vehiculo.revision_tecnica} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<FileSignature className="h-3.5 w-3.5" />} label="Arrendamiento" campo="arrendamiento">
                <EntityPropertyValue>
                  {arrendamientos.length > 0
                    ? `Sí · ${arrendamientos.length} contrato${arrendamientos.length !== 1 ? "s" : ""}`
                    : "—"}
                </EntityPropertyValue>
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Calendar className="h-3.5 w-3.5" />} label="Año" campo="anio">
                <EditableText tabla="vehiculos" id={vehiculo.id} campo="anio" valorInicial={vehiculo.anio?.toString()} revalidar={`/entidades/vehiculos/${id}`} inputType="number" min={1800} max={2200} step={1} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Hash className="h-3.5 w-3.5" />} label="N° de serie" campo="n_serie">
                <EditableText tabla="vehiculos" id={vehiculo.id} campo="n_serie" valorInicial={vehiculo.n_serie} revalidar={`/entidades/vehiculos/${id}`} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Hash className="h-3.5 w-3.5" />} label="N° de partida" campo="n_partida">
                <EditableText tabla="vehiculos" id={vehiculo.id} campo="n_partida" valorInicial={vehiculo.n_partida} revalidar={`/entidades/vehiculos/${id}`} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<HardDrive className="h-3.5 w-3.5" />} label="Archivador Drive" campo="archivador_drive">
                <PropertyPill tabla="vehiculos" id={vehiculo.id} campo="archivador_drive" valor={vehiculo.archivador_drive} opciones={SI_NO_OPCIONES} revalidar={`/entidades/vehiculos/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<FolderOpen className="h-3.5 w-3.5" />} label="Archivador físico" campo="archivador_fisico">
                <PropertyPill tabla="vehiculos" id={vehiculo.id} campo="archivador_fisico" valor={vehiculo.archivador_fisico} opciones={SI_NO_OPCIONES} revalidar={`/entidades/vehiculos/${id}`} />
              </EntityPropertyRow>
              <FilasPropiedadesPersonalizadas
                entidadTipo="vehiculo"
                entidadId={vehiculo.id}
                propiedades={propiedadesPersonalizadas.definiciones}
                valores={propiedadesPersonalizadas.valoresPorEntidad[vehiculo.id] ?? {}}
              />
            </EntityPropertyList>

            <div>
              <DocumentosYRelaciones entidadTipo="vehiculo" entidadId={vehiculo.id} categorias={categorias} titulo="Documentos y relaciones" permitirCrearTipo />
            </div>
          </div>

          {/* Arrendamientos */}
          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              Arrendamientos{arrendamientos.length > 0 ? ` (${arrendamientos.length})` : ""}
            </h3>
            <ArrendamientosSection arrendamientos={arrendamientos} />
          </div>

          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Detalle</h3>
            <NotionBlockEditor tabla="vehiculos" id={vehiculo.id} campo="detalle" valorInicial={vehiculo.detalle} revalidar={`/entidades/vehiculos/${id}`} placeholder="Sin detalle" />
          </div>

          <div className="mt-8 border-t border-white/[0.06] pt-6">
            <EliminarRegistro clave="vehiculos" id={vehiculo.id} nombre={vehiculo.placa} />
          </div>

        </div>
      </div>
    </div>
  );
}
