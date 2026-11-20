import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, BadgeCheck, Building2, Contact, CreditCard, FileKey2,
  Landmark, MapPin, Tag, UserRound, type LucideIcon,
} from "lucide-react";
import { PropertyPill, type OpcionPill } from "@/components/ui/property-pill";
import { EditableText } from "@/components/ui/editable-text";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { HistorialPanel } from "@/components/ui/historial-panel";
import { cargarCategoriasEntidad } from "@/lib/relaciones/agrupar";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { EliminarRegistro } from "@/components/ui/eliminar-registro";
import { valorTipoPropietario } from "@/lib/propietarios/tipo";
import { EntityPropertyList, EntityPropertyRow } from "@/components/ui/entity-sheet";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { esUuid } from "@/lib/contratos/adendas";
import { TIPO_PERSONA_OPCIONES } from "../opciones";
import { cargarTiposPropietario, opcionesTipoPropietario } from "@/lib/propietarios/tipos-catalogo";


// Datos fiscales (viven en `datos_empresas`, no en `propietarios`) — mismo
// orden y campos que el panel lateral, para que ambas vistas coincidan.
const CAMPOS_EMPRESA: { campo: string; label: string; icon: LucideIcon; align?: "start" }[] = [
  { campo: "razon_social",     label: "Razón social",     icon: Building2 },
  { campo: "ruc",               label: "RUC",               icon: Landmark },
  { campo: "dni",               label: "DNI",               icon: Contact },
  { campo: "gerente",           label: "Gerente",           icon: UserRound },
  { campo: "direccion_fiscal",  label: "Dirección fiscal",  icon: MapPin, align: "start" },
  { campo: "partida_registral", label: "Partida registral", icon: FileKey2 },
  { campo: "cuenta_bancaria",   label: "Cuenta bancaria",   icon: CreditCard, align: "start" },
];

export default async function PropietarioFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const supabase = await createClient();

  // Propietario + datos_empresas + categorías desplegables, en paralelo
  const [
    { data: propietario, error: propietarioError },
    { data: datosEmpresas },
    categoriasPorId,
    tiposPropietario,
    propiedadesPersonalizadas,
  ] = await Promise.all([
    supabase
      .from("propietarios")
      .select("*")
      .eq("id", id)
      .single(),
    supabase
      .from("datos_empresas")
      .select("*")
      .eq("propietario_id", id)
      .order("id")
      .limit(1)
      .maybeSingle(),
    cargarCategoriasEntidad(supabase, "propietario", [id]),
    cargarTiposPropietario(supabase),
    cargarPropiedadesPersonalizadas(supabase, "propietario", [id]),
  ]);

  if (propietarioError && propietarioError.code !== "PGRST116") throw new Error("No se pudo cargar el propietario");
  if (!propietario) notFound();

  const categorias = categoriasPorId[id] ?? [];
  const opcionesTipo = opcionesTipoPropietario(tiposPropietario);

  return (
    <div className="flex flex-col h-full">
      <Header title={propietario.nombre} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1320px] px-6 py-8 sm:px-8 sm:py-10">

          {/* Volver + historial */}
          <div className="mb-6 flex items-center justify-between gap-3">
            <Link
              href="/entidades/propietarios"
              className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Propietarios
            </Link>
            <HistorialPanel tabla="propietarios" registroId={propietario.id} titulo={propietario.nombre} />
          </div>

          {/* Propiedades a la izquierda, documentos y relaciones a la derecha — el nombre ya se ve en la cabecera de la página */}
          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <EntityPropertyList ordenKey="propietario" entidadTipo="propietario">
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Nombre" campo="nombre">
                <EditableText tabla="propietarios" id={propietario.id} campo="nombre" valorInicial={propietario.nombre} revalidar={`/entidades/propietarios/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Tipo" campo="es_propio">
                <PropertyPill tabla="propietarios" id={propietario.id} campo="es_propio" valor={valorTipoPropietario(propietario)} opciones={opcionesTipo} revalidar={`/entidades/propietarios/${id}`} gestion={{ tipo: "tipo-propietario" }} crearOpciones />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Tipo de persona" campo="tipo_persona">
                <PropertyPill tabla="propietarios" id={propietario.id} campo="tipo_persona" valor={propietario.tipo_persona} opciones={TIPO_PERSONA_OPCIONES} revalidar={`/entidades/propietarios/${id}`} />
              </EntityPropertyRow>
              {CAMPOS_EMPRESA.map((campo) => (
                <EntityPropertyRow key={campo.campo} icon={<campo.icon className="h-3.5 w-3.5" />} label={campo.label} campo={campo.campo} align={campo.align ?? "center"}>
                  <EditableText
                    tabla="datos_empresas"
                    id={datosEmpresas?.id ?? propietario.id}
                    propietarioId={propietario.id}
                    campo={campo.campo}
                    valorInicial={datosEmpresas?.[campo.campo]}
                    revalidar={`/entidades/propietarios/${id}`}
                    placeholder="—"
                  />
                </EntityPropertyRow>
              ))}
              <FilasPropiedadesPersonalizadas
                entidadTipo="propietario"
                entidadId={propietario.id}
                propiedades={propiedadesPersonalizadas.definiciones}
                valores={propiedadesPersonalizadas.valoresPorEntidad[propietario.id] ?? {}}
              />
            </EntityPropertyList>

            <div>
              <DocumentosYRelaciones entidadTipo="propietario" entidadId={propietario.id} categorias={categorias} titulo="Documentos y relaciones" permitirCrearTipo />
            </div>
          </div>

          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Notas</h3>
            <NotionBlockEditor
              tabla="propietarios"
              id={propietario.id}
              campo="extra.notas"
              valorInicial={propietario.extra?.notas}
              revalidar={`/entidades/propietarios/${id}`}
            />
          </div>

          <div className="mt-8 border-t border-white/[0.06] pt-6">
            <EliminarRegistro clave="propietarios" id={propietario.id} nombre={propietario.nombre} />
          </div>

        </div>
      </div>
    </div>
  );
}
