import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Car,
  CheckCircle2,
  Hash,
  Landmark,
  MapPin,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { EditableText } from "@/components/ui/editable-text";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { HistorialPanel } from "@/components/ui/historial-panel";
import { EliminarRegistro } from "@/components/ui/eliminar-registro";
import { cargarCategoriasEntidad } from "@/lib/relaciones/agrupar";
import { EntityPropertyList, EntityPropertyRow } from "@/components/ui/entity-sheet";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { esUuid } from "@/lib/contratos/adendas";
import type { OpcionPill } from "@/components/ui/property-pill";
import { cargarOpcionesColumna, combinarOpcionesColumna } from "@/lib/opciones-columna";
import { TIPO_PREDIO_OPCIONES } from "../../predios/opciones";

type Vinculo = {
  origen_tipo: string;
  origen_id: string;
  destino_tipo: string;
  destino_id: string;
};

export default async function OficinasRegistralesFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const supabase = await createClient();

  const [{ data: oficina, error: oficinaError }, { data: vinculos }, { data: prediosPorFk }, categoriasPorId, propiedadesPersonalizadas] = await Promise.all([
    supabase.from("oficinas_registrales").select("*").eq("id", id).single(),
    supabase
      .from("vinculos")
      .select("origen_tipo, origen_id, destino_tipo, destino_id")
      .or(
        `and(origen_tipo.eq.oficina_registral,origen_id.eq.${id}),and(destino_tipo.eq.oficina_registral,destino_id.eq.${id})`
      ),
    supabase.from("predios").select("id").eq("oficina_registral_id", id),
    cargarCategoriasEntidad(supabase, "oficina_registral", [id]),
    cargarPropiedadesPersonalizadas(supabase, "oficina_registral", [id]),
  ]);

  if (oficinaError && oficinaError.code !== "PGRST116") throw new Error("No se pudo cargar la oficina registral");
  if (!oficina) notFound();
  const categorias = categoriasPorId[id] ?? [];

  const prediosIds = new Set((prediosPorFk ?? []).map((predio) => predio.id));
  const vehiculosIds = new Set<string>();

  for (const vinculo of (vinculos ?? []) as Vinculo[]) {
    const oficinaEsOrigen = vinculo.origen_tipo === "oficina_registral" && vinculo.origen_id === id;
    const otroTipo = oficinaEsOrigen ? vinculo.destino_tipo : vinculo.origen_tipo;
    const otroId = oficinaEsOrigen ? vinculo.destino_id : vinculo.origen_id;
    if (otroTipo === "predio") prediosIds.add(otroId);
    if (otroTipo === "vehiculo") vehiculosIds.add(otroId);
  }

  const [{ data: predios }, { data: vehiculos }] = await Promise.all([
    prediosIds.size
      ? supabase
          .from("predios")
          .select(
            "id, nombre, n_partida, tipo_predio, registrado, a_nombre_de, ubicacion, archivador_drive, archivador_fisico"
          )
          .in("id", Array.from(prediosIds))
          .order("nombre")
      : Promise.resolve({ data: [] }),
    vehiculosIds.size
      ? supabase
          .from("vehiculos")
          .select(
            "id, placa, marca_modelo, categoria, responsable, n_partida, archivador_drive, archivador_fisico"
          )
          .in("id", Array.from(vehiculosIds))
          .order("placa")
      : Promise.resolve({ data: [] }),
  ]);

  const prediosRelacionados = predios ?? [];
  const vehiculosRelacionados = vehiculos ?? [];
  const registrados = prediosRelacionados.filter((predio) => predio.registrado === true).length;
  const conPartida = prediosRelacionados.filter((predio) => predio.n_partida).length;
  const urbanos = prediosRelacionados.filter((predio) => predio.tipo_predio === "urbano").length;
  const rurales = prediosRelacionados.filter((predio) => predio.tipo_predio === "rural").length;
  // Tipos agregados desde "Editar propiedad": no son urbano ni rural, pero tampoco se pierden.
  const otrosTipos = prediosRelacionados.filter((predio) => predio.tipo_predio && predio.tipo_predio !== "urbano" && predio.tipo_predio !== "rural").length;
  const opcionesTipoPredio = combinarOpcionesColumna(TIPO_PREDIO_OPCIONES, (await cargarOpcionesColumna(supabase, "predios")).tipo_predio);

  return (
    <div className="flex h-full flex-col">
      <Header title={oficina.nombre} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1320px] px-6 py-8 sm:px-8 sm:py-10">

          <div className="mb-6 flex items-center justify-between gap-3">
            <Link
              href="/entidades/oficinas"
              className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Oficinas Registrales
            </Link>
            <HistorialPanel tabla="oficinas_registrales" registroId={oficina.id} titulo={oficina.nombre} />
          </div>

          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Dato label="Predios" valor={prediosRelacionados.length} icono={MapPin} />
            <Dato label="Registrados" valor={registrados} icono={CheckCircle2} />
            <Dato label="Con partida" valor={conPartida} icono={Hash} />
            <Dato label="Urbanos / rurales" valor={otrosTipos > 0 ? `${urbanos} / ${rurales} · ${otrosTipos} otros` : `${urbanos} / ${rurales}`} icono={Shapes} />
            <Dato label="Vehículos" valor={vehiculosRelacionados.length} icono={Car} />
          </div>

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <EntityPropertyList ordenKey="oficina_registral" entidadTipo="oficina_registral">
              <EntityPropertyRow icon={<Landmark className="h-3.5 w-3.5" />} label="Nombre">
                <EditableText tabla="oficinas_registrales" id={oficina.id} campo="nombre" valorInicial={oficina.nombre} revalidar={`/entidades/oficinas/${id}`} placeholder="Sin nombre" />
              </EntityPropertyRow>
              <FilasPropiedadesPersonalizadas
                entidadTipo="oficina_registral"
                entidadId={oficina.id}
                propiedades={propiedadesPersonalizadas.definiciones}
                valores={propiedadesPersonalizadas.valoresPorEntidad[oficina.id] ?? {}}
              />
            </EntityPropertyList>

            <div>
              <DocumentosYRelaciones entidadTipo="oficina_registral" entidadId={oficina.id} categorias={categorias} titulo="Documentos y relaciones" permitirCrearTipo />
            </div>
          </div>

          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              Predios relacionados ({prediosRelacionados.length})
            </h3>
            {prediosRelacionados.length === 0 ? (
              <p className="text-sm text-white/35">No hay predios vinculados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="glass-thead-row">
                      <th className="px-3 py-3">Predio</th>
                      <th className="px-3 py-3">N° de partida</th>
                      <th className="px-3 py-3">Tipo</th>
                      <th className="px-3 py-3">Estado</th>
                      <th className="px-3 py-3">A nombre de</th>
                      <th className="px-3 py-3">Ubicación</th>
                    </tr>
                  </thead>
                  <tbody className="glass-tbody">
                    {prediosRelacionados.map((predio) => (
                      <tr key={predio.id} className="glass-row">
                        <td className="px-3 py-3">
                          <Link
                            href={`/entidades/predios/${predio.id}`}
                            className="font-medium text-white/90 hover:text-brand-300"
                          >
                            {predio.nombre}
                          </Link>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-white/50">{predio.n_partida ?? "—"}</td>
                        <td className="px-3 py-3">
                          <TipoPredio tipo={predio.tipo_predio} opciones={opcionesTipoPredio} />
                        </td>
                        <td className="px-3 py-3">
                          <EstadoRegistral registrado={predio.registrado} />
                        </td>
                        <td className="px-3 py-3 text-xs text-white/60">{formatearTitularidad(predio.a_nombre_de)}</td>
                        <td className="max-w-[260px] px-3 py-3 text-xs text-white/45">
                          <p className="truncate" title={predio.ubicacion ?? undefined}>{predio.ubicacion ?? "—"}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              Vehículos relacionados ({vehiculosRelacionados.length})
            </h3>
            {vehiculosRelacionados.length === 0 ? (
              <p className="text-sm text-white/35">No hay vehículos vinculados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead>
                    <tr className="glass-thead-row">
                      <th className="px-3 py-3">Placa / serie</th>
                      <th className="px-3 py-3">Marca / modelo</th>
                      <th className="px-3 py-3">Categoría</th>
                      <th className="px-3 py-3">Responsable</th>
                      <th className="px-3 py-3">N° de partida</th>
                      <th className="px-3 py-3">Archivadores</th>
                    </tr>
                  </thead>
                  <tbody className="glass-tbody">
                    {vehiculosRelacionados.map((vehiculo) => (
                      <tr key={vehiculo.id} className="glass-row">
                        <td className="px-3 py-3">
                          <Link
                            href={`/entidades/vehiculos/${vehiculo.id}`}
                            className="font-mono font-semibold text-white/90 hover:text-brand-300"
                          >
                            {vehiculo.placa}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-white/60">{vehiculo.marca_modelo ?? "—"}</td>
                        <td className="px-3 py-3 text-xs text-white/50">{vehiculo.categoria ?? "—"}</td>
                        <td className="px-3 py-3 text-xs font-medium uppercase text-white/60">{vehiculo.responsable ?? "—"}</td>
                        <td className="px-3 py-3 font-mono text-xs text-white/50">{vehiculo.n_partida ?? "—"}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {vehiculo.archivador_drive && <span className="badge bg-blue-500/10 text-blue-200/75">Drive</span>}
                            {vehiculo.archivador_fisico && <span className="badge bg-amber-500/10 text-amber-100/70">Físico</span>}
                            {!vehiculo.archivador_drive && !vehiculo.archivador_fisico && <span className="text-xs text-white/25">—</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Notas</h3>
            <NotionBlockEditor
              tabla="oficinas_registrales"
              id={oficina.id}
              campo="extra.notas"
              valorInicial={oficina.extra?.notas}
              revalidar={`/entidades/oficinas/${id}`}
              placeholder="Anota contactos, horarios o particularidades de esta oficina…"
            />
          </div>

          <div className="mt-8 border-t border-white/[0.06] pt-6">
            <EliminarRegistro clave="oficinas_registrales" id={oficina.id} nombre={oficina.nombre} />
          </div>

        </div>
      </div>
    </div>
  );
}

function Dato({
  label,
  valor,
  icono: Icono,
}: {
  label: string;
  valor: string | number;
  icono: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="mb-2 flex items-center gap-2 text-white/35">
        <Icono className="h-3.5 w-3.5" />
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="text-xl font-semibold text-white">{valor}</p>
    </div>
  );
}

/** Etiqueta y color vigentes del tipo (catálogo editable); un valor que ya no está en la lista se ve con su texto guardado. */
function TipoPredio({ tipo, opciones }: { tipo: string | null; opciones: OpcionPill[] }) {
  if (!tipo) return <span className="text-xs text-white/25">—</span>;
  const opcion = opciones.find((o) => o.value === tipo);
  return <span className={`badge ${opcion?.className ?? "bg-white/10 text-white/70"}`}>{opcion?.label ?? tipo}</span>;
}

function EstadoRegistral({ registrado }: { registrado: boolean | null }) {
  if (registrado === null) return <span className="text-xs text-white/25">—</span>;
  return registrado ? (
    <span className="badge bg-brand-500/20 text-brand-300">Registrado</span>
  ) : (
    <span className="badge bg-white/10 text-white/60">No registrado</span>
  );
}

function formatearTitularidad(valor: string | null) {
  if (!valor) return "—";
  if (valor === "inscrito a nuestro nombre") return "A nuestro nombre";
  if (valor === "a nombre de 3ros") return "A nombre de terceros";
  return valor;
}
