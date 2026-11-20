"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { esUuid } from "@/lib/contratos/adendas";

type Resultado = { ok: true } | { ok: false; error: string };

/** Tope del recorrido hacia arriba: ninguna cadena matriz → subpredio real llega a tanto. */
const PROFUNDIDAD_MAXIMA = 50;

/**
 * Define (o quita, con `matrizId = null`) el predio matriz de un subpredio
 * independizado. Rechaza que un predio quede como matriz de sí mismo o de uno
 * de sus ancestros: el ciclo dejaría a ambos sin raíz visible en la tabla.
 * El cambio de columna lo audita el trigger `registrar_historial`.
 */
export async function asignarPredioMatriz(subpredioId: string, matrizId: string | null): Promise<Resultado> {
  if (!esUuid(subpredioId) || (matrizId !== null && !esUuid(matrizId))) return { ok: false, error: "Predio no válido" };
  if (matrizId === subpredioId) return { ok: false, error: "Un predio no puede ser su propia matriz" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!await puedeAdministrarEntidad("predio")) return { ok: false, error: "Tu rol no permite editar predios" };

  if (matrizId) {
    let actual: string | null = matrizId;
    for (let paso = 0; actual && paso < PROFUNDIDAD_MAXIMA; paso++) {
      const { data, error }: { data: { id: string; predio_padre_id: string | null } | null; error: { message: string } | null } = await supabase
        .from("predios")
        .select("id, predio_padre_id")
        .eq("id", actual)
        .maybeSingle();
      if (error) return { ok: false, error: "No se pudo validar el predio matriz" };
      if (!data) return { ok: false, error: paso === 0 ? "El predio matriz no existe" : "No se pudo validar el predio matriz" };
      if (data.predio_padre_id === subpredioId) {
        return { ok: false, error: "Ese predio ya es subpredio de este; no puede ser también su matriz" };
      }
      actual = data.predio_padre_id;
    }
  }

  const { data: previo } = await supabase.from("predios").select("predio_padre_id").eq("id", subpredioId).maybeSingle();

  const { data: actualizado, error } = await supabase
    .from("predios")
    .update({ predio_padre_id: matrizId })
    .eq("id", subpredioId)
    .select("id, predio_padre_id")
    .maybeSingle();
  if (error) return { ok: false, error: "No se pudo guardar el predio matriz" };
  if (!actualizado) return { ok: false, error: "El predio no existe o no tienes permiso para editarlo" };

  revalidatePath("/entidades/predios");
  revalidatePath(`/entidades/predios/${subpredioId}`);
  for (const id of new Set([matrizId, previo?.predio_padre_id ?? null])) {
    if (id) revalidatePath(`/entidades/predios/${id}`);
  }
  return { ok: true };
}
