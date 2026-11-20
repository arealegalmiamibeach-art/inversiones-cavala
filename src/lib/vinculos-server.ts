import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Piezas compartidas de la tabla polimórfica `vinculos`.
 *
 * Viven aquí y no en `lib/actions/vinculos.ts` porque ese archivo es
 * `"use server"`: todo lo que exporta queda publicado como Server Action con
 * su propio endpoint. `sincronizarVinculosDesdeRelacion` no es una acción del
 * usuario —la llama `actualizarValorPropiedadPersonalizada` después de haber
 * comprobado sesión y permisos— así que no tiene por qué ser alcanzable desde
 * el navegador.
 */

export type EntidadRelacionable = keyof typeof ENTIDAD_INFO;

export const ENTIDAD_INFO = {
  propietario: { tabla: "propietarios", nombreCampo: "nombre", ruta: (id: string) => `/entidades/propietarios/${id}`, label: "Propietario" },
  vehiculo: { tabla: "vehiculos", nombreCampo: "placa", ruta: (id: string) => `/entidades/vehiculos/${id}`, label: "Vehículo" },
  predio: { tabla: "predios", nombreCampo: "nombre", ruta: (id: string) => `/entidades/predios/${id}`, label: "Predio" },
  concesion: { tabla: "concesiones_mineras", nombreCampo: "nombre", ruta: (id: string) => `/entidades/concesiones/${id}`, label: "Concesión minera" },
  personal: { tabla: "personal", nombreCampo: "nombre", ruta: (id: string) => `/entidades/personal/${id}`, label: "Personal" },
  oficina_registral: { tabla: "oficinas_registrales", nombreCampo: "nombre", ruta: (id: string) => `/entidades/oficinas/${id}`, label: "Oficina registral" },
  proceso: { tabla: "procesos", nombreCampo: "expediente", ruta: (id: string) => `/procesos/${id}`, label: "Proceso judicial" },
  documento: { tabla: "documentos", nombreCampo: "nombre", ruta: (id: string) => `/documentos/${id}`, label: "Documento" },
  contrato: { tabla: "contratos", nombreCampo: "nombre", ruta: (id: string) => `/contratos/${id}`, label: "Contrato" },
} as const satisfies Record<string, { tabla: string; nombreCampo: string; ruta: (id: string) => string; label: string }>;

export function esEntidadRelacionable(valor: string): valor is EntidadRelacionable {
  return Object.prototype.hasOwnProperty.call(ENTIDAD_INFO, valor);
}

/** Filtro `or` que encuentra el par en los dos sentidos: la importación de Notion dejó aristas en cualquier dirección. */
export function filtroParEntidades(tipoA: string, idA: string, tipoB: string, idB: string): string {
  return [
    `and(origen_tipo.eq.${tipoA},origen_id.eq.${idA},destino_tipo.eq.${tipoB},destino_id.eq.${idB})`,
    `and(origen_tipo.eq.${tipoB},origen_id.eq.${idB},destino_tipo.eq.${tipoA},destino_id.eq.${idA})`,
  ].join(",");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (valor: unknown): valor is string => typeof valor === "string" && UUID.test(valor);

/**
 * Sincroniza `vinculos` cuando se guarda el valor de una propiedad
 * personalizada de tipo "relación" (ver `actualizarValorPropiedadPersonalizada`):
 * agrega el vínculo real por cada id que se sumó y lo quita por cada id que se
 * sacó. Así la relación aparece también en "Documentos y relaciones" de ambas
 * fichas, no sólo como valor de la propiedad. No revierte nada si un id puntual
 * falla — mismo criterio que el resto de altas de vínculo, no vale la pena una
 * transacción para esto.
 *
 * No comprueba permisos: el llamante ya validó sesión, rol y entidad. Por eso
 * no puede ser una Server Action.
 */
export async function sincronizarVinculosDesdeRelacion(
  supabase: SupabaseClient,
  tipoA: string,
  idA: string,
  tipoB: string,
  idsAgregar: string[],
  idsQuitar: string[]
): Promise<void> {
  if (!esUuid(idA) || !esEntidadRelacionable(tipoA) || !esEntidadRelacionable(tipoB)) return;

  for (const idB of idsAgregar) {
    if (!esUuid(idB) || (idB === idA && tipoA === tipoB)) continue;
    const { data: existente } = await supabase
      .from("vinculos")
      .select("id")
      .or(filtroParEntidades(tipoA, idA, tipoB, idB))
      .limit(1)
      .maybeSingle();
    if (existente) continue;
    await supabase.from("vinculos").insert({
      origen_tipo: tipoA,
      origen_id: idA,
      destino_tipo: tipoB,
      destino_id: idB,
      rol: null,
      resuelto_por: "manual",
    });
  }

  for (const idB of idsQuitar) {
    if (!esUuid(idB)) continue;
    await supabase.from("vinculos").delete().or(filtroParEntidades(tipoA, idA, tipoB, idB));
  }
}
