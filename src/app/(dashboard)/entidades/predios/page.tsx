import { createClient } from "@/lib/supabase/server";
import { PrediosTable } from "./predios-table";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { cargarRelacionesPredios } from "@/lib/relaciones/contratos";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";

export default async function PrediosPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    tipo?: string;
    registrado?: string;
    pagina?: string;
  }>;
}) {
  const { q, tipo, registrado } = await searchParams;
  const supabase = await createClient();

  const busqueda = q?.trim().slice(0, 120) || undefined;

  const { data: predios, error } = await fetchAllRows((from, to) =>
    supabase
      .from("predios")
      .select(
        "id, nombre, n_partida, tipo_predio, registrado, a_nombre_de, predio_padre_id, ubicacion, coordenadas, fecha_adquisicion, monto_copia_literal, detalles, archivador_drive, archivador_fisico"
      )
      .order("nombre")
      .order("id")
      .range(from, to)
  );
  if (error) throw new Error("No se pudieron cargar los predios");

  const filas = predios ?? [];
  const ids = filas.map((predio) => predio.id);
  const [adjuntosPorId, relacionesPorId, propiedadesIniciales] = await Promise.all([
    contarArchivosPorEntidad(supabase, "predio", ids),
    cargarRelacionesPredios(supabase, ids),
    cargarPropiedadesPersonalizadas(supabase, "predio", ids),
  ]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <h1 className="text-base font-semibold text-white">Predios</h1>

        <PrediosTable predios={filas} count={filas.length} q={busqueda} tipo={tipo} registrado={registrado} adjuntosPorId={adjuntosPorId} relacionesPorId={relacionesPorId} propiedadesIniciales={propiedadesIniciales} />
      </div>
    </div>
  );
}
