"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { CLASE_LABEL, esClaseAdenda, esUuid, leerMarcaAdenda, type ClaseAdenda } from "@/lib/contratos/adendas";
import { registrarEvento } from "@/lib/historial-server";
import { mandarAPapelera } from "@/lib/papelera-server";

export type ResultadoAdenda =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type ResultadoSimple = { ok: true } | { ok: false; error: string };

const NOMBRE_MAX = 240;

/**
 * Crea una adenda o resolución colgando de `padreId`: fila propia en
 * `contratos` (mismo tipo que el padre) más el vínculo contrato→contrato.
 * A partir de ahí se le suben archivos como a cualquier otro contrato.
 */
export async function crearAdenda(entrada: {
  padreId: string;
  clase: ClaseAdenda;
  nombre?: string;
}): Promise<ResultadoAdenda> {
  if (!esUuid(entrada.padreId)) return { ok: false, error: "Contrato padre inválido" };
  if (!esClaseAdenda(entrada.clase)) return { ok: false, error: "Tipo de documento inválido" };

  const nombreLimpio = (entrada.nombre ?? "").trim().replace(/\s+/g, " ");
  if (nombreLimpio.length > NOMBRE_MAX) {
    return { ok: false, error: `El nombre no puede pasar de ${NOMBRE_MAX} caracteres` };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!await puedeAdministrarEntidad("contrato")) return { ok: false, error: "Tu rol no permite crear adendas" };

  const { data: padre } = await supabase
    .from("contratos")
    .select("id, tipo, nombre, moneda")
    .eq("id", entrada.padreId)
    .single();
  if (!padre) return { ok: false, error: "No se encontró el contrato padre" };

  const nombre = (nombreLimpio || `${CLASE_LABEL[entrada.clase]}: ${padre.nombre ?? "contrato"}`).slice(0, NOMBRE_MAX);

  const { data: creada, error: errorInsercion } = await supabase
    .from("contratos")
    .insert({
      tipo: padre.tipo,
      nombre,
      moneda: padre.moneda,
      extra: {
        es_adenda: true,
        documento_padre: padre.id,
        clase: entrada.clase,
        origen: "app",
      },
    })
    .select("id")
    .single();

  if (errorInsercion || !creada) {
    return { ok: false, error: errorInsercion?.message ?? "No se pudo crear la adenda" };
  }

  // El vínculo es lo que hace que la adenda también aparezca en el grafo de
  // relaciones. Si falla no se revierte la fila: el árbol se dibuja igual con
  // `extra.documento_padre`.
  await supabase.from("vinculos").insert({
    origen_tipo: "contrato",
    origen_id: padre.id,
    destino_tipo: "contrato",
    destino_id: creada.id,
    rol: null,
    resuelto_por: "manual",
  });

  await registrarEvento(supabase, user.id, {
    tabla: "contratos",
    registroId: padre.id,
    accion: "crear",
    campo: "adenda",
    valorNuevo: nombre,
  });

  revalidarContratos(padre.id, creada.id);
  return { ok: true, id: creada.id };
}

/**
 * Manda a la papelera una adenda creada desde la app. Reversible: sus
 * archivos y vínculos se quedan intactos y la política "ocultar_eliminados"
 * la esconde del árbol del contrato padre hasta que se restaure.
 */
export async function eliminarAdenda(adendaId: string): Promise<ResultadoSimple> {
  if (!esUuid(adendaId)) return { ok: false, error: "Adenda inválida" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!await puedeAdministrarEntidad("contrato")) return { ok: false, error: "Tu rol no permite eliminar adendas" };

  const { data: adenda } = await supabase
    .from("contratos")
    .select("id, nombre, extra, notion_id")
    .eq("id", adendaId)
    .single();
  if (!adenda) return { ok: false, error: "No se encontró la adenda" };

  const marca = leerMarcaAdenda(adenda.extra);
  if (!marca.esAdenda || !marca.creadaEnApp || adenda.notion_id) {
    return { ok: false, error: "Sólo se pueden eliminar adendas creadas desde la aplicación" };
  }

  const baja = await mandarAPapelera(supabase, "contratos", adendaId);
  if (!baja.ok) return baja;

  if (marca.padre) {
    await registrarEvento(supabase, user.id, {
      tabla: "contratos",
      registroId: marca.padre,
      accion: "eliminar",
      campo: "adenda",
      valorAnterior: adenda.nombre ?? null,
    });
  }

  revalidarContratos(marca.padre ?? undefined, adendaId);
  return { ok: true };
}

function revalidarContratos(padreId?: string, hijoId?: string) {
  revalidatePath("/contratos");
  revalidatePath("/contratos/tipo/[tipo]", "page");
  if (padreId) revalidatePath(`/contratos/${padreId}`);
  if (hijoId) revalidatePath(`/contratos/${hijoId}`);
}
