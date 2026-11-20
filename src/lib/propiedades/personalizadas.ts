import type { SupabaseClient } from "@supabase/supabase-js";

export type TipoPropiedadPersonalizada = "texto" | "numero" | "fecha" | "booleano" | "seleccion" | "multiseleccion" | "relacion";

// Paleta de colores para las opciones de "selección"/"multiselección", estilo
// Notion: cada opción recibe un color estable (por hash de su texto) para que
// se vea igual en el editor, en la celda y en cualquier vista de la tabla.
const TONOS_OPCION = [
  { claro: "border-neutral-300 bg-neutral-200/70 text-neutral-700", oscuro: "border-white/[0.16] bg-white/[0.08] text-white/75" },
  { claro: "border-amber-300 bg-amber-100 text-amber-800", oscuro: "border-amber-400/25 bg-amber-500/15 text-amber-300" },
  { claro: "border-orange-300 bg-orange-100 text-orange-800", oscuro: "border-orange-400/25 bg-orange-500/15 text-orange-300" },
  { claro: "border-lime-300 bg-lime-100 text-lime-800", oscuro: "border-lime-400/25 bg-lime-500/15 text-lime-300" },
  { claro: "border-emerald-300 bg-emerald-100 text-emerald-800", oscuro: "border-emerald-400/25 bg-emerald-500/15 text-emerald-300" },
  { claro: "border-teal-300 bg-teal-100 text-teal-800", oscuro: "border-teal-400/25 bg-teal-500/15 text-teal-300" },
  { claro: "border-sky-300 bg-sky-100 text-sky-800", oscuro: "border-sky-400/25 bg-sky-500/15 text-sky-300" },
  { claro: "border-blue-300 bg-blue-100 text-blue-800", oscuro: "border-blue-400/25 bg-blue-500/15 text-blue-300" },
  { claro: "border-violet-300 bg-violet-100 text-violet-800", oscuro: "border-violet-400/25 bg-violet-500/15 text-violet-300" },
  { claro: "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-800", oscuro: "border-fuchsia-400/25 bg-fuchsia-500/15 text-fuchsia-300" },
  { claro: "border-rose-300 bg-rose-100 text-rose-800", oscuro: "border-rose-400/25 bg-rose-500/15 text-rose-300" },
] as const;

/** Color estable (mismo texto → mismo color) para una opción de selección/multiselección. */
export function colorOpcion(opcion: string, tema: "claro" | "oscuro" = "oscuro"): string {
  let hash = 0;
  for (let i = 0; i < opcion.length; i += 1) hash = (hash * 31 + opcion.charCodeAt(i)) >>> 0;
  return TONOS_OPCION[hash % TONOS_OPCION.length][tema];
}

export const TIPOS_ENTIDAD_PERSONALIZABLE = [
  "propietario",
  "predio",
  "vehiculo",
  "concesion",
  "personal",
  "oficina_registral",
  "proceso",
  "documento",
  "contrato",
] as const;

export type TipoEntidadPersonalizable = typeof TIPOS_ENTIDAD_PERSONALIZABLE[number];

export type ConfigEntidadPersonalizable = {
  singular: string;
  plural: string;
  tabla: string;
  campoNombre: string;
  camposDetalle: string[];
  href: string;
};

export const ENTIDADES_PERSONALIZABLES: Record<TipoEntidadPersonalizable, ConfigEntidadPersonalizable> = {
  propietario: { singular: "Propietario", plural: "Propietarios", tabla: "propietarios", campoNombre: "nombre", camposDetalle: ["tipo_persona"], href: "/entidades/propietarios" },
  predio: { singular: "Predio", plural: "Predios", tabla: "predios", campoNombre: "nombre", camposDetalle: ["n_partida", "ubicacion"], href: "/entidades/predios" },
  vehiculo: { singular: "Vehículo", plural: "Vehículos", tabla: "vehiculos", campoNombre: "placa", camposDetalle: ["marca_modelo", "categoria"], href: "/entidades/vehiculos" },
  concesion: { singular: "Concesión", plural: "Concesiones", tabla: "concesiones_mineras", campoNombre: "nombre", camposDetalle: ["codigo"], href: "/entidades/concesiones" },
  personal: { singular: "Persona", plural: "Personal", tabla: "personal", campoNombre: "nombre", camposDetalle: ["cargo"], href: "/entidades/personal" },
  oficina_registral: { singular: "Oficina registral", plural: "Oficinas registrales", tabla: "oficinas_registrales", campoNombre: "nombre", camposDetalle: [], href: "/entidades/oficinas" },
  proceso: { singular: "Proceso", plural: "Procesos", tabla: "procesos", campoNombre: "expediente", camposDetalle: ["asunto"], href: "/procesos" },
  documento: { singular: "Documento", plural: "Documentos", tabla: "documentos", campoNombre: "nombre", camposDetalle: ["tipo"], href: "/documentos" },
  contrato: { singular: "Contrato", plural: "Contratos", tabla: "contratos", campoNombre: "nombre", camposDetalle: ["tipo"], href: "/contratos" },
};

export function esTipoEntidadPersonalizable(valor: string): valor is TipoEntidadPersonalizable {
  return Object.prototype.hasOwnProperty.call(ENTIDADES_PERSONALIZABLES, valor);
}

/**
 * Tipos de entidad cuyos registros ya viven repartidos en varias "tablas"
 * dentro de una misma tabla física (materia de `procesos`, tipo de
 * `documentos`/`contratos`). Una propiedad personalizada de estos tipos
 * pertenece a un único valor de esa columna: la creada en "Minutas" no debe
 * verse en "Testimonios". Propietario, predio, vehículo, etc. no están aquí
 * porque cada uno ya es su propia tabla física.
 */
export const ENTIDADES_CON_SUBTIPO: Partial<Record<TipoEntidadPersonalizable, { tabla: string; columna: string }>> = {
  proceso: { tabla: "procesos", columna: "materia" },
  documento: { tabla: "documentos", columna: "tipo" },
  contrato: { tabla: "contratos", columna: "tipo" },
};

export function requiereSubtipo(entidadTipo: TipoEntidadPersonalizable): boolean {
  return Object.prototype.hasOwnProperty.call(ENTIDADES_CON_SUBTIPO, entidadTipo);
}

export type ValorRelacionPersonalizada = {
  id: string;
  nombre: string;
  href: string;
};

export type PropiedadPersonalizada = {
  id: string;
  entidadTipo: TipoEntidadPersonalizable;
  /** Valor de la columna (materia/tipo) al que pertenece; `null` si `entidadTipo` no tiene subtipo. */
  subtipo: string | null;
  nombre: string;
  descripcion: string | null;
  tipo: TipoPropiedadPersonalizada;
  opciones: string[];
  configuracion: {
    entidad_tipo?: TipoEntidadPersonalizable;
  };
};

export type ValoresPropiedadesPersonalizadas = Record<string, Record<string, unknown>>;

export type PropiedadesPersonalizadasCargadas = {
  definiciones: PropiedadPersonalizada[];
  valoresPorEntidad: ValoresPropiedadesPersonalizadas;
};

const TIPOS = new Set<TipoPropiedadPersonalizada>(["texto", "numero", "fecha", "booleano", "seleccion", "multiseleccion", "relacion"]);

/**
 * Carga definiciones una vez y todos sus valores en lote, sin consultas por fila.
 *
 * `subtipo`: cuando `entidadTipo` reparte sus registros en varias "tablas"
 * dentro de una misma tabla física (ver `ENTIDADES_CON_SUBTIPO`), acota las
 * definiciones a las creadas para ese valor exacto (p. ej. la materia
 * "civil" de procesos). Sin `subtipo` trae TODAS las definiciones del tipo
 * de entidad — lo que quiere una vista agregada tipo "Todos los procesos".
 */
export async function cargarPropiedadesPersonalizadas(
  supabase: SupabaseClient,
  entidadTipo: string,
  entidadIds: string[],
  subtipo?: string
): Promise<PropiedadesPersonalizadasCargadas> {
  let consultaDefiniciones = supabase
    .from("propiedades_personalizadas")
    .select("id, entidad_tipo, subtipo, nombre, descripcion, tipo, opciones, configuracion")
    .eq("entidad_tipo", entidadTipo);
  if (subtipo !== undefined) consultaDefiniciones = consultaDefiniciones.eq("subtipo", subtipo);
  const { data: definicionesData, error } = await consultaDefiniciones
    .order("creado_en")
    .order("id");

  // Permite desplegar primero el código y aplicar la migración en el mismo
  // release: mientras la tabla no exista, las vistas base siguen funcionando.
  if (error) return { definiciones: [], valoresPorEntidad: {} };

  const definiciones: PropiedadPersonalizada[] = [];
  for (const fila of (definicionesData ?? []) as Record<string, unknown>[]) {
    if (
      typeof fila.id !== "string" ||
      typeof fila.nombre !== "string" ||
      typeof fila.entidad_tipo !== "string" ||
      !esTipoEntidadPersonalizable(fila.entidad_tipo) ||
      !TIPOS.has(fila.tipo as TipoPropiedadPersonalizada)
    ) continue;
    definiciones.push({
      id: fila.id,
      entidadTipo: fila.entidad_tipo,
      subtipo: typeof fila.subtipo === "string" ? fila.subtipo : null,
      nombre: fila.nombre,
      descripcion: typeof fila.descripcion === "string" ? fila.descripcion : null,
      tipo: fila.tipo as TipoPropiedadPersonalizada,
      opciones: Array.isArray(fila.opciones)
        ? fila.opciones.filter((opcion): opcion is string => typeof opcion === "string")
        : [],
      configuracion: normalizarConfiguracion(fila.configuracion),
    });
  }

  if (definiciones.length === 0 || entidadIds.length === 0) {
    return { definiciones, valoresPorEntidad: {} };
  }

  const definicionesPorId = new Map(definiciones.map((definicion) => [definicion.id, definicion]));
  const tiposDestino = new Set<TipoEntidadPersonalizable>();
  for (const definicion of definiciones) {
    if (definicion.tipo === "relacion" && definicion.configuracion.entidad_tipo) tiposDestino.add(definicion.configuracion.entidad_tipo);
  }

  const [filasValores, vinculosPorEntidad] = await Promise.all([
    leerEnLotes<{ propiedad_id: string; entidad_id: string; valor: unknown }>(entidadIds, (lote, desde, hasta) =>
      supabase
        .from("valores_propiedad_personalizada")
        .select("propiedad_id, entidad_id, valor")
        .in("propiedad_id", definiciones.map((definicion) => definicion.id))
        .in("entidad_id", lote)
        .order("propiedad_id")
        .order("entidad_id")
        .range(desde, hasta)
    ),
    cargarVinculosRelacion(supabase, entidadTipo, entidadIds, tiposDestino),
  ]);

  // Una propiedad "relación" muestra lo que se eligió en ella MÁS todo lo que
  // la ficha ya tiene vinculado con esa tabla (importado de Notion, agregado
  // desde "Documentos y relaciones", o desde la ficha del otro lado). Así la
  // columna nunca sale vacía para un registro que sí tiene la relación.
  const idsPorValor = new Map<string, string[]>();
  const idsDerivados = new Set<string>();
  for (const fila of filasValores) {
    const definicion = definicionesPorId.get(fila.propiedad_id);
    if (definicion?.tipo !== "relacion") continue;
    idsPorValor.set(`${fila.entidad_id}:${fila.propiedad_id}`, idsRelacion(fila.valor));
  }
  for (const definicion of definiciones) {
    const tipoDestino = definicion.configuracion.entidad_tipo;
    if (definicion.tipo !== "relacion" || !tipoDestino) continue;
    for (const entidadId of entidadIds) {
      const vinculados = vinculosPorEntidad.get(`${entidadId}:${tipoDestino}`);
      if (!vinculados) continue;
      const clave = `${entidadId}:${definicion.id}`;
      const ids = idsPorValor.get(clave) ?? [];
      for (const id of vinculados) {
        if (ids.includes(id)) continue;
        ids.push(id);
        idsDerivados.add(`${clave}:${id}`);
      }
      idsPorValor.set(clave, ids);
    }
  }

  const idsRelacionPorTipo = new Map<TipoEntidadPersonalizable, Set<string>>();
  for (const [clave, ids] of idsPorValor) {
    const tipoDestino = definicionesPorId.get(clave.split(":")[1])?.configuracion.entidad_tipo;
    if (!tipoDestino) continue;
    const acumulados = idsRelacionPorTipo.get(tipoDestino) ?? new Set<string>();
    ids.forEach((id) => acumulados.add(id));
    idsRelacionPorTipo.set(tipoDestino, acumulados);
  }

  const relacionesResueltas = new Map<string, ValorRelacionPersonalizada>();
  await Promise.all(Array.from(idsRelacionPorTipo.entries()).map(async ([tipo, ids]) => {
    if (ids.size === 0) return;
    const config = ENTIDADES_PERSONALIZABLES[tipo];
    const data = await leerEnLotes<Record<string, unknown>>(Array.from(ids), (lote, desde, hasta) =>
      supabase
        .from(config.tabla)
        .select(["id", config.campoNombre].join(", "))
        .in("id", lote)
        .order("id")
        .range(desde, hasta) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>
    );
    for (const fila of data) {
      if (typeof fila.id !== "string") continue;
      relacionesResueltas.set(`${tipo}:${fila.id}`, {
        id: fila.id,
        nombre: typeof fila[config.campoNombre] === "string" && fila[config.campoNombre]
          ? String(fila[config.campoNombre])
          : config.singular,
        href: `${config.href}/${fila.id}`,
      });
    }
  }));

  const valoresPorEntidad: ValoresPropiedadesPersonalizadas = {};
  for (const fila of filasValores) {
    const definicion = definicionesPorId.get(fila.propiedad_id);
    if (definicion?.tipo === "relacion") continue;
    (valoresPorEntidad[fila.entidad_id] ??= {})[fila.propiedad_id] = fila.valor;
  }
  for (const [clave, ids] of idsPorValor) {
    const [entidadId, propiedadId] = clave.split(":");
    const tipoDestino = definicionesPorId.get(propiedadId)?.configuracion.entidad_tipo;
    if (!tipoDestino) continue;
    const config = ENTIDADES_PERSONALIZABLES[tipoDestino];
    const valor: ValorRelacionPersonalizada[] = [];
    for (const id of ids) {
      const resuelta = relacionesResueltas.get(`${tipoDestino}:${id}`);
      if (resuelta) valor.push(resuelta);
      // Un vínculo a un registro en la papelera (o sin permiso) no se
      // muestra; uno elegido a mano sí, para que se pueda quitar.
      else if (!idsDerivados.has(`${clave}:${id}`)) valor.push({ id, nombre: `${config.singular} no disponible`, href: `${config.href}/${id}` });
    }
    if (valor.length > 0) (valoresPorEntidad[entidadId] ??= {})[propiedadId] = valor;
  }

  return { definiciones, valoresPorEntidad };
}

type Lote<T> = { data: T[] | null; error: unknown };

/**
 * Lee todas las filas de un filtro `.in(columna, ids)`: parte los ids en
 * lotes (PostgREST los pone en la URL y con unos cientos de UUIDs responde
 * 400) y pagina cada lote más allá del tope de 1000 filas.
 */
async function leerEnLotes<T>(
  ids: string[],
  consulta: (lote: string[], desde: number, hasta: number) => PromiseLike<Lote<T>>
): Promise<T[]> {
  const filas: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await consulta(lote, desde, desde + 999);
      if (error) break;
      filas.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
  }
  return filas;
}

/**
 * Vínculos (en ambos sentidos) entre las entidades dadas y cada tabla de
 * destino de sus propiedades "relación", como `"<entidadId>:<tipoDestino>"`
 * → ids del otro extremo.
 */
export async function cargarVinculosRelacion(
  supabase: SupabaseClient,
  entidadTipo: string,
  entidadIds: string[],
  tiposDestino: Set<string>
): Promise<Map<string, string[]>> {
  const resultado = new Map<string, string[]>();
  if (tiposDestino.size === 0 || entidadIds.length === 0) return resultado;
  const destinos = Array.from(tiposDestino);
  type Fila = { origen_tipo: string; origen_id: string; destino_tipo: string; destino_id: string };
  const [comoOrigen, comoDestino] = await Promise.all([
    leerEnLotes<Fila>(entidadIds, (lote, desde, hasta) =>
      supabase.from("vinculos").select("origen_tipo, origen_id, destino_tipo, destino_id")
        .eq("origen_tipo", entidadTipo).in("origen_id", lote).in("destino_tipo", destinos)
        .order("id").range(desde, hasta)
    ),
    leerEnLotes<Fila>(entidadIds, (lote, desde, hasta) =>
      supabase.from("vinculos").select("origen_tipo, origen_id, destino_tipo, destino_id")
        .eq("destino_tipo", entidadTipo).in("destino_id", lote).in("origen_tipo", destinos)
        .order("id").range(desde, hasta)
    ),
  ]);
  const agregar = (entidadId: string, tipo: string, otroId: string) => {
    if (tipo === entidadTipo && otroId === entidadId) return;
    const clave = `${entidadId}:${tipo}`;
    const ids = resultado.get(clave) ?? [];
    if (!ids.includes(otroId)) ids.push(otroId);
    resultado.set(clave, ids);
  };
  for (const v of comoOrigen) agregar(v.origen_id, v.destino_tipo, v.destino_id);
  for (const v of comoDestino) agregar(v.destino_id, v.origen_tipo, v.origen_id);
  return resultado;
}

export function valorPropiedadComoTexto(valor: unknown, tipo: TipoPropiedadPersonalizada): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (tipo === "booleano") return valor === true ? "Sí" : "No";
  if (tipo === "relacion" && Array.isArray(valor)) {
    return valor
      .filter(esValorRelacionPersonalizada)
      .map((item) => item.nombre)
      .join(" ");
  }
  if (tipo === "multiseleccion" && Array.isArray(valor)) {
    return valor.filter((item): item is string => typeof item === "string").join(" ");
  }
  return String(valor);
}

export function esValorRelacionPersonalizada(valor: unknown): valor is ValorRelacionPersonalizada {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;
  const fila = valor as Record<string, unknown>;
  return typeof fila.id === "string" && typeof fila.nombre === "string" && typeof fila.href === "string";
}

function normalizarConfiguracion(valor: unknown): PropiedadPersonalizada["configuracion"] {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  const tipoEntidad = (valor as Record<string, unknown>).entidad_tipo;
  return typeof tipoEntidad === "string" && esTipoEntidadPersonalizable(tipoEntidad)
    ? { entidad_tipo: tipoEntidad }
    : {};
}

function idsRelacion(valor: unknown): string[] {
  const valores = Array.isArray(valor) ? valor : typeof valor === "string" ? [valor] : [];
  return valores.filter((id): id is string => typeof id === "string");
}
