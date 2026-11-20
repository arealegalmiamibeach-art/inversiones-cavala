import { createClient } from "@/lib/supabase/server";
import { PropietariosTable } from "./propietarios-table";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { cargarRelacionesPropietarios } from "@/lib/relaciones/contratos";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { cargarTiposPropietario } from "@/lib/propietarios/tipos-catalogo";

export default async function PropietariosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; persona?: string; pagina?: string }>;
}) {
  const { q, tipo, persona } = await searchParams;
  const supabase = await createClient();

  const busqueda = q?.trim().slice(0, 120) || undefined;

  // La agrupación y los filtros viven en el cliente, por lo que necesitan el
  // conjunto completo. Limitar aquí a 25 filas hacía que cada página armara
  // grupos parciales y repitiera un mismo grupo en varias páginas.
  const [{ data: propietarios, error }, tiposPropietario] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("propietarios")
        .select("id, nombre, es_propio, tipo_persona, extra")
        .order("nombre")
        .order("id")
        .range(from, to)
    ),
    cargarTiposPropietario(supabase),
  ]);
  if (error) throw new Error("No se pudieron cargar los propietarios");

  const filas = propietarios ?? [];
  const ids = filas.map((propietario) => propietario.id);
  const [adjuntosPorId, relacionesPorId, propiedadesIniciales, { data: datosEmpresas, error: datosEmpresasError }] = await Promise.all([
    contarArchivosPorEntidad(supabase, "propietario", ids),
    cargarRelacionesPropietarios(supabase, ids),
    cargarPropiedadesPersonalizadas(supabase, "propietario", ids),
    ids.length > 0
      ? fetchAllRows((from, to) =>
          supabase
            .from("datos_empresas")
            .select("*")
            .in("propietario_id", ids)
            .order("propietario_id")
            .range(from, to)
        )
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (datosEmpresasError) throw new Error("No se pudieron cargar los datos empresariales");
  const datosEmpresasPorId = Object.fromEntries(
    (datosEmpresas ?? []).map((empresa) => [empresa.propietario_id as string, empresa])
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <h1 className="text-base font-semibold text-white">Propietarios</h1>

        <PropietariosTable propietarios={filas} count={filas.length} q={busqueda} tipo={tipo} persona={persona} adjuntosPorId={adjuntosPorId} relacionesPorId={relacionesPorId} datosEmpresasPorId={datosEmpresasPorId} tiposPropietario={tiposPropietario} propiedadesIniciales={propiedadesIniciales} />
      </div>
    </div>
  );
}
