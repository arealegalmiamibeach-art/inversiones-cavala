import { createClient } from "@/lib/supabase/server";
import { ConcesionesTable } from "./concesiones-table";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { cargarRelacionesEntidad } from "@/lib/relaciones/contratos";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";

export default async function ConcesionesPage() {
  const supabase = await createClient();

  const { data: concesiones, error } = await fetchAllRows((from, to) =>
    supabase
      .from("concesiones_mineras")
      .select("id, nombre, codigo, hectareas, sustancia, estado, ubicacion, url_ubicacion")
      .order("nombre")
      .order("id")
      .range(from, to)
  );
  if (error) throw new Error("No se pudieron cargar las concesiones mineras");

  const idsConcesiones = (concesiones ?? []).map((concesion) => concesion.id);
  const [adjuntosPorId, propiedadesIniciales, relacionesPorId] = await Promise.all([
    contarArchivosPorEntidad(supabase, "concesion", idsConcesiones),
    cargarPropiedadesPersonalizadas(supabase, "concesion", idsConcesiones),
    cargarRelacionesEntidad(supabase, "concesion", idsConcesiones),
  ]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <h1 className="text-base font-semibold text-white">Concesiones mineras</h1>

        <ConcesionesTable concesiones={concesiones ?? []} adjuntosPorId={adjuntosPorId} relacionesPorId={relacionesPorId} propiedadesIniciales={propiedadesIniciales} />
      </div>
    </div>
  );
}
