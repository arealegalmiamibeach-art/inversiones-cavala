import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularVigencia } from "@/lib/contratos/vigencia";

export type EstadoVigenciaArrendamiento = "vigente" | "por_vencer" | "vencido" | "sin_fecha";

/** Propietario ligado a un contrato de arrendamiento, para pintarlo como chip con enlace a su ficha. */
export type PersonaArrendamiento = { id: string; nombre: string; href: string };

export type Arrendamiento = {
  contratoId: string;
  nombre: string;
  href: string;
  /** Nombres unidos con ", " (orden y filtro por texto); las chips salen de `arrendadores`. */
  arrendador: string | null;
  arrendatario: string | null;
  arrendadores: PersonaArrendamiento[];
  arrendatarios: PersonaArrendamiento[];
  fechaInicio: string | null;
  fechaFin: string | null;
  monto: number | null;
  moneda: string | null;
  estadoVigencia: EstadoVigenciaArrendamiento;
  /** Negativo si ya venció, null si no tiene fecha de término. */
  diasRestantes: number | null;
};

/** Umbral "por vencer" (ámbar), compartido entre la tabla y las tarjetas de resumen. */
export const DIAS_POR_VENCER = 90;
/** Dentro de la ventana anterior, umbral "vence pronto" (rojo). */
export const DIAS_VENCE_PRONTO = 30;

export type ColorSemaforo = "rojo" | "ambar" | "neutro";

/** Rojo si venció o vence en ≤30 días, ámbar si vence en ≤90, neutro el resto. */
export function colorSemaforo(a: Pick<Arrendamiento, "estadoVigencia" | "diasRestantes">): ColorSemaforo {
  if (a.estadoVigencia === "vencido") return "rojo";
  if (a.estadoVigencia === "por_vencer") return a.diasRestantes !== null && a.diasRestantes <= DIAS_VENCE_PRONTO ? "rojo" : "ambar";
  return "neutro";
}

function bucketVigencia(fechaFin: string | null): { estado: EstadoVigenciaArrendamiento; dias: number | null } {
  const { estado, dias } = calcularVigencia(fechaFin);
  if (estado === "sin_fecha") return { estado: "sin_fecha", dias: null };
  if (estado === "vencido") return { estado: "vencido", dias };
  if (dias !== null && dias <= DIAS_POR_VENCER) return { estado: "por_vencer", dias };
  return { estado: "vigente", dias };
}

type ContratoFila = {
  id: string;
  nombre: string;
  monto: number | null;
  moneda: string | null;
  fecha_inicio: string | null;
  fecha_vencimiento: string | null;
};

/**
 * Carga en lote los contratos de arrendamiento (`tipo = 'arrendamiento'`)
 * vinculados a una lista de vehículos vía la tabla polimórfica `vinculos`,
 * resolviendo también el arrendador/arrendatario (propietarios vinculados al
 * contrato con ese rol). Consultas fijas, nada de N+1: vínculos
 * vehículo↔contrato, contratos, vínculos contrato↔propietario y sus nombres.
 */
export async function cargarArrendamientosVehiculos(
  supabase: SupabaseClient,
  vehiculoIds: string[]
): Promise<Record<string, Arrendamiento[]>> {
  if (vehiculoIds.length === 0) return {};

  const [{ data: comoOrigen }, { data: comoDestino }] = await Promise.all([
    supabase.from("vinculos").select("origen_id, destino_id").eq("origen_tipo", "vehiculo").eq("destino_tipo", "contrato").in("origen_id", vehiculoIds),
    supabase.from("vinculos").select("origen_id, destino_id").eq("destino_tipo", "vehiculo").eq("origen_tipo", "contrato").in("destino_id", vehiculoIds),
  ]);

  const contratosPorVehiculo = new Map<string, Set<string>>();
  const registrar = (vehiculoId: string, contratoId: string) => {
    const set = contratosPorVehiculo.get(vehiculoId) ?? new Set<string>();
    set.add(contratoId);
    contratosPorVehiculo.set(vehiculoId, set);
  };
  for (const v of (comoOrigen ?? []) as { origen_id: string; destino_id: string }[]) registrar(v.origen_id, v.destino_id);
  for (const v of (comoDestino ?? []) as { origen_id: string; destino_id: string }[]) registrar(v.destino_id, v.origen_id);

  const contratoIds = Array.from(new Set(Array.from(contratosPorVehiculo.values()).flatMap((set) => Array.from(set))));
  if (contratoIds.length === 0) return {};

  const { data: contratosData } = await supabase
    .from("contratos")
    .select("id, nombre, monto, moneda, fecha_inicio, fecha_vencimiento")
    .eq("tipo", "arrendamiento")
    .in("id", contratoIds);

  const contratos = new Map<string, ContratoFila>(((contratosData ?? []) as ContratoFila[]).map((c) => [c.id, c]));
  if (contratos.size === 0) return {};

  const idsArrendamiento = Array.from(contratos.keys());

  const [{ data: rolesOrigen }, { data: rolesDestino }] = await Promise.all([
    supabase.from("vinculos").select("origen_id, destino_id, rol").eq("origen_tipo", "contrato").eq("destino_tipo", "propietario").in("origen_id", idsArrendamiento),
    supabase.from("vinculos").select("origen_id, destino_id, rol").eq("destino_tipo", "contrato").eq("origen_tipo", "propietario").in("destino_id", idsArrendamiento),
  ]);

  type RolFila = { contratoId: string; propietarioId: string; rol: string };
  const rolesCrudos: RolFila[] = [
    ...((rolesOrigen ?? []) as { origen_id: string; destino_id: string; rol: string | null }[])
      .map((r) => ({ contratoId: r.origen_id, propietarioId: r.destino_id, rol: (r.rol ?? "").trim().toLocaleLowerCase("es-PE") })),
    ...((rolesDestino ?? []) as { origen_id: string; destino_id: string; rol: string | null }[])
      .map((r) => ({ contratoId: r.destino_id, propietarioId: r.origen_id, rol: (r.rol ?? "").trim().toLocaleLowerCase("es-PE") })),
  ].filter((r) => r.rol === "arrendador" || r.rol === "arrendatario");

  const propietarioIds = Array.from(new Set(rolesCrudos.map((r) => r.propietarioId)));
  const { data: propietariosData } = propietarioIds.length > 0
    ? await supabase.from("propietarios").select("id, nombre").in("id", propietarioIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombres = new Map<string, string>(((propietariosData ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre]));

  type GrupoPartes = {
    arrendadores: Set<string>;
    arrendatarios: Set<string>;
    personasArrendadores: Map<string, PersonaArrendamiento>;
    personasArrendatarios: Map<string, PersonaArrendamiento>;
  };
  const porContrato = new Map<string, GrupoPartes>();
  for (const r of rolesCrudos) {
    const nombre = nombres.get(r.propietarioId);
    if (!nombre) continue;
    const grupo = porContrato.get(r.contratoId) ?? {
      arrendadores: new Set<string>(),
      arrendatarios: new Set<string>(),
      personasArrendadores: new Map<string, PersonaArrendamiento>(),
      personasArrendatarios: new Map<string, PersonaArrendamiento>(),
    };
    const esArrendador = r.rol === "arrendador";
    (esArrendador ? grupo.arrendadores : grupo.arrendatarios).add(nombre);
    (esArrendador ? grupo.personasArrendadores : grupo.personasArrendatarios).set(r.propietarioId, {
      id: r.propietarioId,
      nombre,
      href: `/entidades/propietarios/${r.propietarioId}`,
    });
    porContrato.set(r.contratoId, grupo);
  }

  const resultado: Record<string, Arrendamiento[]> = {};
  for (const [vehiculoId, contratoIdsVehiculo] of contratosPorVehiculo.entries()) {
    for (const contratoId of contratoIdsVehiculo) {
      const contrato = contratos.get(contratoId);
      if (!contrato) continue; // vínculo a un contrato que no es de tipo arrendamiento
      const { estado, dias } = bucketVigencia(contrato.fecha_vencimiento);
      const grupo = porContrato.get(contratoId);
      const lista = resultado[vehiculoId] ?? [];
      lista.push({
        contratoId,
        nombre: contrato.nombre,
        href: `/contratos/${contratoId}`,
        arrendador: grupo && grupo.arrendadores.size > 0 ? Array.from(grupo.arrendadores).join(", ") : null,
        arrendatario: grupo && grupo.arrendatarios.size > 0 ? Array.from(grupo.arrendatarios).join(", ") : null,
        arrendadores: grupo ? Array.from(grupo.personasArrendadores.values()) : [],
        arrendatarios: grupo ? Array.from(grupo.personasArrendatarios.values()) : [],
        fechaInicio: contrato.fecha_inicio,
        fechaFin: contrato.fecha_vencimiento,
        monto: contrato.monto,
        moneda: contrato.moneda,
        estadoVigencia: estado,
        diasRestantes: dias,
      });
      resultado[vehiculoId] = lista;
    }
  }

  for (const lista of Object.values(resultado)) {
    lista.sort((a, b) => (a.diasRestantes ?? Infinity) - (b.diasRestantes ?? Infinity));
  }

  return resultado;
}

/**
 * Contrato que representa al vehículo en la tabla: el vigente más próximo a
 * vencer y, si todos vencieron, el que venció hace menos tiempo (un contrato
 * antiguo no debe tapar al que está en curso).
 */
export function arrendamientoPrincipal(lista?: Arrendamiento[]): Arrendamiento | null {
  if (!lista || lista.length === 0) return null;
  const vigentes = lista.filter((a) => a.estadoVigencia !== "vencido");
  if (vigentes.length > 0) {
    return vigentes.reduce((mejor, a) => ((a.diasRestantes ?? Infinity) < (mejor.diasRestantes ?? Infinity) ? a : mejor));
  }
  return lista.reduce((mejor, a) => ((a.diasRestantes ?? -Infinity) > (mejor.diasRestantes ?? -Infinity) ? a : mejor));
}

/** Arrendatarios de todos los contratos de un vehículo, sin repetir al mismo propietario. */
export function arrendatariosUnicos(lista?: Arrendamiento[]): PersonaArrendamiento[] {
  if (!lista || lista.length === 0) return [];
  const porId = new Map<string, PersonaArrendamiento>();
  for (const arrendamiento of lista) {
    for (const persona of arrendamiento.arrendatarios) if (!porId.has(persona.id)) porId.set(persona.id, persona);
  }
  return Array.from(porId.values());
}

/** El menor `diasRestantes` entre los contratos de una lista (el más urgente). */
export function diasMinimos(lista?: Arrendamiento[]): number | null {
  if (!lista || lista.length === 0) return null;
  const dias = lista.map((a) => a.diasRestantes).filter((d): d is number => d !== null);
  return dias.length > 0 ? Math.min(...dias) : null;
}
