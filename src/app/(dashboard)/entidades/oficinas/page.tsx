import { createClient } from "@/lib/supabase/server";
import { Car, Hash, Landmark, MapPin } from "lucide-react";
import {
  OficinasTable,
  type OficinaRegistral,
  type PredioOficina,
  type VehiculoOficina,
} from "./oficinas-table";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { cargarRelacionesEntidad } from "@/lib/relaciones/contratos";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";

type Vinculo = {
  origen_tipo: string;
  origen_id: string;
  destino_tipo: string;
  destino_id: string;
};

type OficinaBase = {
  id: string;
  nombre: string;
};

export default async function OficinasPage() {
  const supabase = await createClient();

  const [{ data: oficinasData, error: oficinasError }, { data: vinculosData, error: vinculosError }] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("oficinas_registrales")
        .select("id, nombre")
        .order("nombre")
        .order("id")
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("vinculos")
        .select("origen_tipo, origen_id, destino_tipo, destino_id")
        .or("origen_tipo.eq.oficina_registral,destino_tipo.eq.oficina_registral")
        .order("id")
        .range(from, to)
    ),
  ]);
  if (oficinasError || vinculosError) throw new Error("No se pudieron cargar las oficinas registrales");

  const oficinasBase = (oficinasData ?? []) as OficinaBase[];
  const oficinasIds = new Set(oficinasBase.map((oficina) => oficina.id));
  const relaciones = new Map<string, { predios: Set<string>; vehiculos: Set<string> }>();

  for (const oficina of oficinasBase) {
    relaciones.set(oficina.id, { predios: new Set(), vehiculos: new Set() });
  }

  for (const vinculo of (vinculosData ?? []) as Vinculo[]) {
    const oficinaEsOrigen = vinculo.origen_tipo === "oficina_registral";
    const oficinaId = oficinaEsOrigen ? vinculo.origen_id : vinculo.destino_id;
    const otroTipo = oficinaEsOrigen ? vinculo.destino_tipo : vinculo.origen_tipo;
    const otroId = oficinaEsOrigen ? vinculo.destino_id : vinculo.origen_id;
    if (!oficinasIds.has(oficinaId)) continue;
    if (otroTipo === "predio") relaciones.get(oficinaId)?.predios.add(otroId);
    if (otroTipo === "vehiculo") relaciones.get(oficinaId)?.vehiculos.add(otroId);
  }

  // Conservamos compatibilidad con la FK directa, aunque hoy las relaciones
  // migradas viven principalmente en `vinculos`.
  const { data: prediosPorFk, error: prediosFkError } = oficinasBase.length
    ? await fetchAllRows((from, to) =>
        supabase
          .from("predios")
          .select("id, oficina_registral_id")
          .in("oficina_registral_id", oficinasBase.map((oficina) => oficina.id))
          .order("id")
          .range(from, to)
      )
    : { data: [], error: null };
  if (prediosFkError) throw new Error("No se pudieron cargar los predios de las oficinas");

  for (const predio of prediosPorFk ?? []) {
    if (predio.oficina_registral_id) {
      relaciones.get(predio.oficina_registral_id)?.predios.add(predio.id);
    }
  }

  const prediosIds = Array.from(
    new Set(Array.from(relaciones.values()).flatMap((relacion) => Array.from(relacion.predios)))
  );
  const vehiculosIds = Array.from(
    new Set(Array.from(relaciones.values()).flatMap((relacion) => Array.from(relacion.vehiculos)))
  );

  const [{ data: prediosData, error: prediosError }, { data: vehiculosData, error: vehiculosError }] = await Promise.all([
    prediosIds.length
      ? fetchAllRows((from, to) =>
          supabase
            .from("predios")
            .select("id, nombre, n_partida, tipo_predio, registrado, a_nombre_de, ubicacion")
            .in("id", prediosIds)
            .order("nombre")
            .order("id")
            .range(from, to)
        )
      : Promise.resolve({ data: [], error: null }),
    vehiculosIds.length
      ? fetchAllRows((from, to) =>
          supabase
            .from("vehiculos")
            .select("id, placa, marca_modelo, categoria, responsable, n_partida")
            .in("id", vehiculosIds)
            .order("placa")
            .order("id")
            .range(from, to)
        )
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (prediosError || vehiculosError) throw new Error("No se pudieron completar las relaciones de las oficinas");

  const prediosPorId = new Map(
    ((prediosData ?? []) as PredioOficina[]).map((predio) => [predio.id, predio])
  );
  const vehiculosPorId = new Map(
    ((vehiculosData ?? []) as VehiculoOficina[]).map((vehiculo) => [vehiculo.id, vehiculo])
  );

  const oficinas: OficinaRegistral[] = oficinasBase.map((oficina) => {
    const relacion = relaciones.get(oficina.id);
    return {
      ...oficina,
      predios: Array.from(relacion?.predios ?? [])
        .map((id) => prediosPorId.get(id))
        .filter((predio): predio is PredioOficina => Boolean(predio))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es-PE")),
      vehiculos: Array.from(relacion?.vehiculos ?? [])
        .map((id) => vehiculosPorId.get(id))
        .filter((vehiculo): vehiculo is VehiculoOficina => Boolean(vehiculo))
        .sort((a, b) => a.placa.localeCompare(b.placa, "es-PE")),
    };
  });

  const totalPredios = oficinas.reduce((total, oficina) => total + oficina.predios.length, 0);
  const totalVehiculos = oficinas.reduce((total, oficina) => total + oficina.vehiculos.length, 0);
  const totalPartidas = oficinas.reduce(
    (total, oficina) => total + oficina.predios.filter((predio) => predio.n_partida).length,
    0
  );
  const [adjuntosPredios, adjuntosVehiculos, propiedadesIniciales, relacionesPorId] = await Promise.all([
    contarArchivosPorEntidad(supabase, "predio", prediosIds),
    contarArchivosPorEntidad(supabase, "vehiculo", vehiculosIds),
    cargarPropiedadesPersonalizadas(supabase, "oficina_registral", oficinasBase.map((oficina) => oficina.id)),
    cargarRelacionesEntidad(supabase, "oficina_registral", oficinasBase.map((oficina) => oficina.id)),
  ]);
  const adjuntosPorId = Object.fromEntries(
    oficinas.map((oficina) => [
      oficina.id,
      oficina.predios.reduce((total, predio) => total + (adjuntosPredios[predio.id] ?? 0), 0)
        + oficina.vehiculos.reduce((total, vehiculo) => total + (adjuntosVehiculos[vehiculo.id] ?? 0), 0),
    ])
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-base font-semibold text-white">Oficinas registrales</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/45">
            <DatoResumen icono={<Landmark className="h-3 w-3" />} valor={oficinas.length} label="oficinas" />
            <DatoResumen icono={<MapPin className="h-3 w-3" />} valor={totalPredios} label="predios" />
            <DatoResumen icono={<Hash className="h-3 w-3" />} valor={totalPartidas} label="con partida" />
            <DatoResumen icono={<Car className="h-3 w-3" />} valor={totalVehiculos} label="vehículos" />
          </div>
        </div>

        <OficinasTable oficinas={oficinas} adjuntosPorId={adjuntosPorId} relacionesPorId={relacionesPorId} propiedadesIniciales={propiedadesIniciales} />
      </div>
    </div>
  );
}

function DatoResumen({ icono, valor, label }: { icono: React.ReactNode; valor: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-brand-300/75">{icono}</span>
      <strong className="font-semibold text-white/75">{valor.toLocaleString("es-PE")}</strong>
      {label}
    </span>
  );
}
