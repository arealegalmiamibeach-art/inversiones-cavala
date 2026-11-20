import { createClient } from "@/lib/supabase/server";
import { VehiculosTable } from "./vehiculos-table";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { cargarArrendamientosVehiculos } from "@/lib/vehiculos/arrendamientos";
import { cargarRelacionesEntidad } from "@/lib/relaciones/contratos";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";

export default async function VehiculosPage() {
  const supabase = await createClient();

  const { data: vehiculos, error } = await fetchAllRows((from, to) =>
    supabase
      .from("vehiculos")
      .select("id, placa, marca_modelo, categoria, responsable, soat_vence, poliza_vence, anio, n_serie, n_partida, revision_tecnica, detalle, archivador_drive, archivador_fisico")
      .order("placa")
      .order("id")
      .range(from, to)
  );
  if (error) throw new Error("No se pudieron cargar los vehículos");

  // Las vistas ("Con arrendamiento", vencimientos de SOAT/póliza) reciben el
  // listado completo para filtrar y reordenar al instante en el cliente.
  const idsVehiculos = (vehiculos ?? []).map((vehiculo) => vehiculo.id);
  const [adjuntosPorId, arrendamientosPorId, relacionesPorId, propiedadesIniciales] = await Promise.all([
    contarArchivosPorEntidad(supabase, "vehiculo", idsVehiculos),
    cargarArrendamientosVehiculos(supabase, idsVehiculos),
    cargarRelacionesEntidad(supabase, "vehiculo", idsVehiculos),
    cargarPropiedadesPersonalizadas(supabase, "vehiculo", idsVehiculos),
  ]);
  // La columna "Propietarios" de la vista del cliente sale del grafo `vinculos`:
  // el vehículo no guarda un propietario_id propio.
  const propietariosPorId = Object.fromEntries(
    Object.entries(relacionesPorId).map(([vehiculoId, relaciones]) => [
      vehiculoId,
      relaciones
        .filter((relacion) => relacion.entidadTipo === "propietario")
        .map((relacion) => ({ id: relacion.id, nombre: relacion.entidadNombre, href: relacion.href })),
    ])
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <h1 className="text-base font-semibold text-white">Vehículos</h1>

        <VehiculosTable
          vehiculos={vehiculos ?? []}
          count={vehiculos?.length ?? 0}
          adjuntosPorId={adjuntosPorId}
          arrendamientosPorId={arrendamientosPorId}
          propietariosPorId={propietariosPorId}
          relacionesPorId={relacionesPorId}
          propiedadesIniciales={propiedadesIniciales}
        />
      </div>
    </div>
  );
}
