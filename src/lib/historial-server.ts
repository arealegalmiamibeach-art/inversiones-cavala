import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tipo de entidad de `archivos`/`vinculos` → tabla real que audita el historial. */
export const TABLA_POR_ENTIDAD: Record<string, string> = {
  documento: "documentos",
  contrato: "contratos",
  proceso: "procesos",
  vehiculo: "vehiculos",
  predio: "predios",
  concesion: "concesiones_mineras",
  propietario: "propietarios",
  personal: "personal",
  oficina_registral: "oficinas_registrales",
};

type EventoHistorial = {
  tabla: string;
  registroId: string;
  accion: "crear" | "editar" | "eliminar";
  campo: "archivo" | "adenda" | "vinculo" | "carpeta" | "vencimiento";
  valorAnterior?: string | null;
  valorNuevo?: string | null;
};

/**
 * Registra un evento de app que no es un cambio de columna (adjuntar/quitar un
 * archivo, crear/borrar una adenda, vincular). Los cambios de columna los
 * captura el trigger `registrar_historial` en Postgres.
 *
 * Nunca lanza: un fallo al auditar no debe tumbar la operación que el usuario
 * ya vio completarse.
 */
export async function registrarEvento(
  supabase: SupabaseClient,
  userId: string,
  evento: EventoHistorial
): Promise<void> {
  try {
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("nombre, correo")
      .eq("id", userId)
      .maybeSingle();

    await supabase.from("historial").insert({
      tabla: evento.tabla,
      registro_id: evento.registroId,
      accion: evento.accion,
      campo: evento.campo,
      valor_anterior: evento.valorAnterior ?? null,
      valor_nuevo: evento.valorNuevo ?? null,
      actor_id: userId,
      actor_nombre: perfil?.nombre ?? null,
      actor_correo: perfil?.correo ?? null,
    });
  } catch {
    // se ignora a propósito
  }
}
