import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, BadgeCheck, Calendar, Contact, Lock, Mail, UserCheck, Wallet } from "lucide-react";
import { PropertyPill, type OpcionPill } from "@/components/ui/property-pill";
import { EditableText } from "@/components/ui/editable-text";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { HistorialPanel } from "@/components/ui/historial-panel";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { EliminarRegistro } from "@/components/ui/eliminar-registro";
import { cargarCategoriasEntidad } from "@/lib/relaciones/agrupar";
import { EntityPropertyList, EntityPropertyRow } from "@/components/ui/entity-sheet";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { diasHastaFechaISO } from "@/lib/utils";
import { esUuid } from "@/lib/contratos/adendas";
import { MODALIDAD_OPCIONES } from "../opciones";

const ACTIVO_OPCIONES: OpcionPill[] = [
  { value: "true",  label: "Activo", className: "bg-emerald-500/15 text-emerald-300" },
  { value: "false", label: "Cesado", className: "bg-white/10 text-white/50" },
];
const FIRMADO_OPCIONES: OpcionPill[] = [
  { value: "Ambas firmas completas", label: "Firmado",    className: "bg-emerald-500/15 text-emerald-300" },
  { value: "Sin Firmar",             label: "Sin firmar", className: "bg-amber-500/15 text-amber-300" },
];

export default async function PersonalFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const supabase = await createClient();

  const [{ data: persona, error }, categoriasPorId, propiedadesPersonalizadas] = await Promise.all([
    supabase.from("personal").select("*").eq("id", id).single(),
    cargarCategoriasEntidad(supabase, "personal", [id]),
    cargarPropiedadesPersonalizadas(supabase, "personal", [id]),
  ]);
  const categorias = categoriasPorId[id] ?? [];

  if (error && error.code !== "42501" && error.code !== "PGRST116") {
    throw new Error("No se pudo cargar el registro de personal");
  }

  // Sin permiso
  if (error?.code === "42501" || (!persona && !error)) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Personal" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Lock className="h-10 w-10 text-white/15" />
          <p className="text-sm font-medium text-white/45">Sin permiso de acceso</p>
          <p className="text-xs text-white/30">Tu rol actual no tiene acceso a esta sección.</p>
          <Link href="/entidades/personal" className="glass-btn-secondary text-xs mt-2">← Volver</Link>
        </div>
      </div>
    );
  }

  if (!persona) notFound();

  const diasFinContrato = persona.contrato_fin
    ? diasHastaFechaISO(persona.contrato_fin)
    : null;

  return (
    <div className="flex flex-col h-full">
      <Header title={persona.nombre} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1320px] px-6 py-8 sm:px-8 sm:py-10">

          <div className="mb-6 flex items-center justify-between gap-3">
            <Link href="/entidades/personal" className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Personal
            </Link>
            <HistorialPanel tabla="personal" registroId={persona.id} titulo={persona.nombre} />
          </div>

          {diasFinContrato !== null && diasFinContrato <= 30 && (
            <div className={`mb-6 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${diasFinContrato <= 15 ? "border-red-400/25 bg-red-500/10 text-red-300" : "border-amber-400/25 bg-amber-500/10 text-amber-300"}`}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Contrato vence en <strong>{diasFinContrato} días</strong>
              {persona.firmado && ` · ${persona.firmado}`}
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <EntityPropertyList ordenKey="personal" entidadTipo="personal">
              <EntityPropertyRow icon={<UserCheck className="h-3.5 w-3.5" />} label="Nombre">
                <EditableText tabla="personal" id={persona.id} campo="nombre" valorInicial={persona.nombre} revalidar={`/entidades/personal/${id}`} placeholder="Sin nombre" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Modalidad" campo="modalidad">
                <PropertyPill tabla="personal" id={persona.id} campo="modalidad" valor={persona.modalidad} opciones={MODALIDAD_OPCIONES} revalidar={`/entidades/personal/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Estado" campo="activo">
                <PropertyPill tabla="personal" id={persona.id} campo="activo" valor={persona.activo} opciones={ACTIVO_OPCIONES} revalidar={`/entidades/personal/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Firmado" campo="firmado">
                <PropertyPill tabla="personal" id={persona.id} campo="firmado" valor={persona.firmado} opciones={FIRMADO_OPCIONES} revalidar={`/entidades/personal/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<UserCheck className="h-3.5 w-3.5" />} label="Cargo" campo="cargo">
                <EditableText tabla="personal" id={persona.id} campo="cargo" valorInicial={persona.cargo} revalidar={`/entidades/personal/${id}`} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Mail className="h-3.5 w-3.5" />} label="Correo" campo="correo">
                <EditableText tabla="personal" id={persona.id} campo="correo" valorInicial={persona.correo} revalidar={`/entidades/personal/${id}`} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Calendar className="h-3.5 w-3.5" />} label="Inicio de contrato" campo="contrato_inicio">
                <EditableText tabla="personal" id={persona.id} campo="contrato_inicio" valorInicial={persona.contrato_inicio} revalidar={`/entidades/personal/${id}`} inputType="date" placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Calendar className="h-3.5 w-3.5" />} label="Fin de contrato" campo="contrato_fin">
                <EditableText tabla="personal" id={persona.id} campo="contrato_fin" valorInicial={persona.contrato_fin} revalidar={`/entidades/personal/${id}`} inputType="date" placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Contact className="h-3.5 w-3.5" />} label="DNI" campo="dni">
                <EditableText tabla="personal" id={id} campo="dni" valorInicial={persona.dni} revalidar={`/entidades/personal/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Wallet className="h-3.5 w-3.5" />} label="Remuneración" campo="remuneracion">
                <EditableText tabla="personal" id={id} campo="remuneracion" valorInicial={persona.remuneracion == null ? "" : String(persona.remuneracion)} revalidar={`/entidades/personal/${id}`} inputType="number" min={0} step="0.01" />
              </EntityPropertyRow>
              <FilasPropiedadesPersonalizadas
                entidadTipo="personal"
                entidadId={persona.id}
                propiedades={propiedadesPersonalizadas.definiciones}
                valores={propiedadesPersonalizadas.valoresPorEntidad[persona.id] ?? {}}
              />
            </EntityPropertyList>

            <div>
              <DocumentosYRelaciones entidadTipo="personal" entidadId={persona.id} categorias={categorias} titulo="Documentos y relaciones" permitirCrearTipo />
            </div>
          </div>

          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Notas</h3>
            <NotionBlockEditor
              tabla="personal"
              id={persona.id}
              campo="extra.notas"
              valorInicial={persona.extra?.notas}
              revalidar={`/entidades/personal/${id}`}
              placeholder="Anota acuerdos, incidencias o pendientes de esta persona…"
            />
          </div>

          <div className="mt-8 border-t border-white/[0.06] pt-6">
            <EliminarRegistro clave="personal" id={persona.id} nombre={persona.nombre} />
          </div>

        </div>
      </div>
    </div>
  );
}
