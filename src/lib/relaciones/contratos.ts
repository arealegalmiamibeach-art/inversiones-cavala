import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows, fetchAllRowsIn } from "@/lib/supabase/fetch-all";
import { calcularVigencia, type EstadoVigencia } from "@/lib/contratos/vigencia";

type EntidadConfig = {
  label: string;
  tabla: string;
  nombreCampo: string;
  href: string;
};

export const ENTIDADES: Record<string, EntidadConfig> = {
  propietario: {
    label: "Propietario",
    tabla: "propietarios",
    nombreCampo: "nombre",
    href: "/entidades/propietarios",
  },
  predio: {
    label: "Predio",
    tabla: "predios",
    nombreCampo: "nombre",
    href: "/entidades/predios",
  },
  vehiculo: {
    label: "Vehículo",
    tabla: "vehiculos",
    nombreCampo: "placa",
    href: "/entidades/vehiculos",
  },
  concesion: {
    label: "Concesión",
    tabla: "concesiones_mineras",
    nombreCampo: "nombre",
    href: "/entidades/concesiones",
  },
  personal: {
    label: "Personal",
    tabla: "personal",
    nombreCampo: "nombre",
    href: "/entidades/personal",
  },
  oficina_registral: {
    label: "Oficina registral",
    tabla: "oficinas_registrales",
    nombreCampo: "nombre",
    href: "/entidades/oficinas",
  },
  proceso: {
    label: "Proceso",
    tabla: "procesos",
    nombreCampo: "expediente",
    href: "/procesos",
  },
  documento: {
    label: "Documento",
    tabla: "documentos",
    nombreCampo: "nombre",
    href: "/documentos",
  },
  contrato: {
    label: "Contrato",
    tabla: "contratos",
    nombreCampo: "nombre",
    href: "/contratos",
  },
};

type Vinculo = {
  origen_tipo: string;
  origen_id: string;
  destino_tipo: string;
  destino_id: string;
  rol: string | null;
};

type Referencia = {
  contratoId: string;
  entidadTipo: string;
  entidadId: string;
  rol: string | null;
};

export type ContratoRelacion = {
  id: string;
  rol: string | null;
  rolLabel: string;
  entidadTipo: string;
  entidadTipoLabel: string;
  entidadId: string;
  entidadNombre: string;
  href: string;
};

export type EntidadRelacion = ContratoRelacion;

/**
 * Resuelve en lote todos los extremos de los vínculos de una página de
 * entidades de un tipo dado. Así la tabla puede mostrar rol + entidad sin
 * consultas por fila.
 */
export async function cargarRelacionesEntidad(
  supabase: SupabaseClient,
  entidadTipo: string,
  entidadIds: string[]
): Promise<Record<string, EntidadRelacion[]>> {
  if (entidadIds.length === 0) return {};

  const [{ data: comoOrigen, error: errorOrigen }, { data: comoDestino, error: errorDestino }] = await Promise.all([
    fetchAllRowsIn(entidadIds, (lote, from, to) =>
      supabase
        .from("vinculos")
        .select("origen_tipo, origen_id, destino_tipo, destino_id, rol")
        .eq("origen_tipo", entidadTipo)
        .in("origen_id", lote)
        .order("id")
        .range(from, to)
    ),
    fetchAllRowsIn(entidadIds, (lote, from, to) =>
      supabase
        .from("vinculos")
        .select("origen_tipo, origen_id, destino_tipo, destino_id, rol")
        .eq("destino_tipo", entidadTipo)
        .in("destino_id", lote)
        .order("id")
        .range(from, to)
    ),
  ]);
  if (errorOrigen || errorDestino) throw new Error((errorOrigen ?? errorDestino)!.message);

  const referenciasCrudas: Referencia[] = [
    ...((comoOrigen ?? []) as Vinculo[]).map((vinculo) => ({
      contratoId: vinculo.origen_id,
      entidadTipo: vinculo.destino_tipo,
      entidadId: vinculo.destino_id,
      rol: vinculo.rol,
    })),
    ...((comoDestino ?? []) as Vinculo[]).map((vinculo) => ({
      contratoId: vinculo.destino_id,
      entidadTipo: vinculo.origen_tipo,
      entidadId: vinculo.origen_id,
      rol: vinculo.rol,
    })),
  ].filter((referencia) =>
    ENTIDADES[referencia.entidadTipo] &&
    !(referencia.entidadTipo === entidadTipo && referencia.entidadId === referencia.contratoId)
  );

  // La importación de Notion dejó algunos vínculos recíprocos (A→B y B→A).
  // Son una sola relación visual. Si una copia tiene rol y la otra no, se
  // conserva el rol explícito; dos roles explícitos distintos sí se respetan.
  const referenciasPorEntidad = new Map<string, Referencia[]>();
  for (const referencia of referenciasCrudas) {
    const clave = `${referencia.contratoId}:${referencia.entidadTipo}:${referencia.entidadId}`;
    const grupo = referenciasPorEntidad.get(clave) ?? [];
    grupo.push(referencia);
    referenciasPorEntidad.set(clave, grupo);
  }
  const referencias = Array.from(referenciasPorEntidad.values()).flatMap((grupo) => {
    const conRol = grupo.filter((referencia) => referencia.rol?.trim());
    const candidatas = conRol.length > 0 ? conRol : [grupo[0]];
    const rolesVistos = new Set<string>();
    return candidatas.filter((referencia) => {
      const rol = referencia.rol?.trim().toLocaleLowerCase("es-PE") ?? "";
      if (rolesVistos.has(rol)) return false;
      rolesVistos.add(rol);
      return true;
    });
  });

  const idsPorTipo = new Map<string, Set<string>>();
  for (const referencia of referencias) {
    const ids = idsPorTipo.get(referencia.entidadTipo) ?? new Set<string>();
    ids.add(referencia.entidadId);
    idsPorTipo.set(referencia.entidadTipo, ids);
  }

  const nombresPorTipo = new Map<string, Map<string, string>>();
  await Promise.all(
    Array.from(idsPorTipo.entries()).map(async ([tipo, ids]) => {
      const config = ENTIDADES[tipo];
      const { data, error } = await fetchAllRowsIn(Array.from(ids), (lote, from, to) =>
        supabase
          .from(config.tabla)
          .select(`id, ${config.nombreCampo}`)
          .in("id", lote)
          .order("id")
          .range(from, to)
      );
      if (error && error.code !== "42501") throw new Error(error.message);
      const nombres = new Map<string, string>();
      for (const registro of (data ?? []) as unknown as Record<string, string | null>[]) {
        nombres.set(registro.id ?? "", registro[config.nombreCampo]?.trim() || "Sin nombre");
      }
      nombresPorTipo.set(tipo, nombres);
    })
  );

  const resultado: Record<string, ContratoRelacion[]> = {};
  const vistos = new Set<string>();
  for (const referencia of referencias) {
    const config = ENTIDADES[referencia.entidadTipo];
    // No mostrar enlaces a registros que RLS o la papelera ya no permiten leer.
    if (!nombresPorTipo.get(referencia.entidadTipo)?.has(referencia.entidadId)) continue;
    const rol = referencia.rol?.trim() || null;
    const clave = `${referencia.contratoId}:${referencia.entidadTipo}:${referencia.entidadId}:${rol ?? ""}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    const relaciones = resultado[referencia.contratoId] ?? [];
    relaciones.push({
      id: clave,
      rol,
      rolLabel: rol ? humanizar(rol) : config.label,
      entidadTipo: referencia.entidadTipo,
      entidadTipoLabel: config.label,
      entidadId: referencia.entidadId,
      entidadNombre:
        nombresPorTipo.get(referencia.entidadTipo)?.get(referencia.entidadId) ??
        `${config.label} vinculado`,
      href: `${config.href}/${referencia.entidadId}`,
    });
    resultado[referencia.contratoId] = relaciones;
  }

  for (const relaciones of Object.values(resultado)) {
    relaciones.sort((a, b) =>
      `${a.rolLabel} ${a.entidadNombre}`.localeCompare(`${b.rolLabel} ${b.entidadNombre}`, "es-PE")
    );
  }

  return resultado;
}

/** Resuelve relaciones para una página de contratos. */
export function cargarRelacionesContratos(
  supabase: SupabaseClient,
  contratosIds: string[]
): Promise<Record<string, EntidadRelacion[]>> {
  return cargarRelacionesEntidad(supabase, "contrato", contratosIds);
}

/** Resuelve relaciones (predios, vehículos, contratos, etc.) para una página de propietarios. */
export function cargarRelacionesPropietarios(
  supabase: SupabaseClient,
  propietariosIds: string[]
): Promise<Record<string, EntidadRelacion[]>> {
  return cargarRelacionesEntidad(supabase, "propietario", propietariosIds);
}

/** Resuelve relaciones (propietarios, contratos, procesos, etc.) para una página de predios. */
export function cargarRelacionesPredios(
  supabase: SupabaseClient,
  prediosIds: string[]
): Promise<Record<string, EntidadRelacion[]>> {
  return cargarRelacionesEntidad(supabase, "predio", prediosIds);
}

export type ContratoVigenciaResumen = {
  id: string;
  nombre: string;
  fechaInicio: string | null;
  fechaVencimiento: string | null;
  estado: EstadoVigencia;
};

/**
 * Resuelve en lote, para una página de personal, los contratos vinculados a
 * cada persona con su vigencia calculada en vivo (no el texto de "estado"
 * importado de Notion) — alimenta las tarjetas de contrato de la tabla de
 * Personal (una por documento, calco de la propiedad "Contratos de Personal"
 * en Notion).
 */
export async function cargarContratosPersonal(
  supabase: SupabaseClient,
  personalIds: string[]
): Promise<Record<string, ContratoVigenciaResumen[]>> {
  if (personalIds.length === 0) return {};

  const [{ data: comoOrigen }, { data: comoDestino }] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("vinculos")
        .select("origen_id, destino_id")
        .eq("origen_tipo", "personal")
        .eq("destino_tipo", "contrato")
        .in("origen_id", personalIds)
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("vinculos")
        .select("origen_id, destino_id")
        .eq("origen_tipo", "contrato")
        .eq("destino_tipo", "personal")
        .in("destino_id", personalIds)
        .range(from, to)
    ),
  ]);

  const contratoIdsPorPersona = new Map<string, Set<string>>();
  function registrar(personaId: string, contratoId: string) {
    const set = contratoIdsPorPersona.get(personaId) ?? new Set<string>();
    set.add(contratoId);
    contratoIdsPorPersona.set(personaId, set);
  }
  for (const vinculo of (comoOrigen ?? []) as { origen_id: string; destino_id: string }[]) {
    registrar(vinculo.origen_id, vinculo.destino_id);
  }
  for (const vinculo of (comoDestino ?? []) as { origen_id: string; destino_id: string }[]) {
    registrar(vinculo.destino_id, vinculo.origen_id);
  }

  const todosContratoIds = Array.from(new Set(Array.from(contratoIdsPorPersona.values()).flatMap((set) => Array.from(set))));
  if (todosContratoIds.length === 0) return {};

  const { data: contratos } = await fetchAllRows((from, to) =>
    supabase
      .from("contratos")
      .select("id, nombre, fecha_inicio, fecha_vencimiento")
      .in("id", todosContratoIds)
      .range(from, to)
  );
  type ContratoFila = { id: string; nombre: string | null; fecha_inicio: string | null; fecha_vencimiento: string | null };
  const contratoPorId = new Map(
    ((contratos ?? []) as ContratoFila[]).map((contrato) => [contrato.id, contrato])
  );

  const resultado: Record<string, ContratoVigenciaResumen[]> = {};
  for (const [personaId, contratoIds] of contratoIdsPorPersona.entries()) {
    resultado[personaId] = Array.from(contratoIds)
      .map((id) => contratoPorId.get(id))
      .filter((contrato): contrato is ContratoFila => Boolean(contrato))
      .map((contrato) => ({
        id: contrato.id,
        nombre: contrato.nombre?.trim() || "Contrato sin nombre",
        fechaInicio: contrato.fecha_inicio,
        fechaVencimiento: contrato.fecha_vencimiento,
        estado: calcularVigencia(contrato.fecha_vencimiento).estado,
      }))
      .sort((a, b) => (a.fechaInicio ?? "").localeCompare(b.fechaInicio ?? ""));
  }
  return resultado;
}

function humanizar(valor: string) {
  const limpio = valor.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("es-PE");
  return limpio ? limpio.charAt(0).toLocaleUpperCase("es-PE") + limpio.slice(1) : "Relación";
}
