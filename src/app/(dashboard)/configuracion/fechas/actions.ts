"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getRol, getUsuario } from "@/lib/auth/perfil";
import { esFuenteValida, TIPOS_FECHA, type TipoFecha } from "@/lib/fechas-config";

export async function guardarConfigFecha(
  fuente: string,
  tipo: TipoFecha,
  diasVigencia: number | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await getRol() !== "administrador") return { ok: false, error: "Sólo un administrador puede cambiar esto" };
  if (!esFuenteValida(fuente)) return { ok: false, error: "Fuente de fecha desconocida" };
  if (!TIPOS_FECHA.includes(tipo)) return { ok: false, error: "Tipo de fecha no válido" };

  // La vigencia sólo tiene sentido en fechas de emisión (documentos) que avisan.
  const aceptaVigencia = fuente.startsWith("documento:") && tipo === "vencimiento";
  const dias = aceptaVigencia ? diasVigencia : null;
  if (dias !== null && (!Number.isInteger(dias) || dias < 1 || dias > 3650)) {
    return { ok: false, error: "Los días de vigencia van de 1 a 3650" };
  }

  const [supabase, usuario] = await Promise.all([createClient(), getUsuario()]);
  const { error } = await supabase.from("fechas_config").upsert({
    fuente,
    tipo,
    dias_vigencia: dias,
    actualizado_por: usuario?.id ?? null,
    actualizado_en: new Date().toISOString(),
  });
  if (error) return { ok: false, error: "No se pudo guardar el cambio" };

  // Calendario, panel de vencimientos y campana leen esta configuración.
  revalidatePath("/", "layout");
  return { ok: true };
}
