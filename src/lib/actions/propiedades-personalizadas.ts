"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { esUuid } from "@/lib/contratos/adendas";
import { esFechaISOValida } from "@/lib/utils";
import {
  ENTIDADES_PERSONALIZABLES,
  cargarVinculosRelacion,
  esTipoEntidadPersonalizable,
  requiereSubtipo,
  type TipoEntidadPersonalizable,
  type TipoPropiedadPersonalizada,
} from "@/lib/propiedades/personalizadas";
import { sincronizarVinculosDesdeRelacion } from "@/lib/vinculos-server";
import { fuentePropiedad, TIPOS_FECHA, type TipoFecha } from "@/lib/fechas-config";
import { nombrePropiedadReservado } from "@/lib/propiedades/nombres-reservados";

type ResultadoCrear = { ok: true; id: string } | { ok: false; error: string };
type Resultado = { ok: true } | { ok: false; error: string };

const TIPOS = new Set<TipoPropiedadPersonalizada>(["texto", "numero", "fecha", "booleano", "seleccion", "multiseleccion", "relacion"]);
const TIPOS_CON_OPCIONES = new Set<TipoPropiedadPersonalizada>(["seleccion", "multiseleccion"]);
const NOMBRE_RESERVADO = "Ese nombre ya pertenece a una propiedad de la tabla";

async function sesionEditable() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sesión expirada. Vuelve a iniciar sesión." };
  return { ok: true as const, supabase, user };
}

export async function crearPropiedadPersonalizada(entrada: {
  entidadTipo: string;
  /** Materia/tipo exacto al que pertenece (p. ej. "civil", "minuta"). Obligatorio cuando `entidadTipo` reparte sus registros en varias tablas — ver `requiereSubtipo`. */
  subtipo?: string;
  nombre: string;
  descripcion?: string;
  tipo: string;
  opciones?: string[];
  relacionTipo?: string;
  /** Obligatorio si `tipo` es "fecha": dato, evento o vencimiento. */
  tipoFecha?: string;
}): Promise<ResultadoCrear> {
  if (!esTipoEntidadPersonalizable(entrada.entidadTipo)) return { ok: false, error: "Tipo de entidad no válido" };
  if (!TIPOS.has(entrada.tipo as TipoPropiedadPersonalizada)) return { ok: false, error: "Tipo de propiedad no válido" };
  // El destino de una "relación" es siempre una de las tablas que ya tienen
  // su propia columna fija (Propietarios, Predios…): sería redundante con
  // ella y además la sincroniza con `vinculos`, así que ya no se puede crear.
  if (entrada.tipo === "relacion") return { ok: false, error: "Ya existe una columna para esa relación; agrégala desde ahí" };

  const subtipo = (entrada.subtipo ?? "").trim();
  if (requiereSubtipo(entrada.entidadTipo)) {
    if (!subtipo) return { ok: false, error: "Abre una tabla específica para agregar la propiedad ahí" };
    if (subtipo.length > 60) return { ok: false, error: "Tabla no válida" };
  }

  const nombre = entrada.nombre.trim().replace(/\s+/g, " ");
  const descripcion = (entrada.descripcion ?? "").trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: false, error: "Escribe un nombre para la propiedad" };
  if (nombre.length > 80) return { ok: false, error: "El nombre no puede pasar de 80 caracteres" };
  if (descripcion.length > 240) return { ok: false, error: "La descripción no puede pasar de 240 caracteres" };

  const tipo = entrada.tipo as TipoPropiedadPersonalizada;
  const opciones = Array.from(new Set((entrada.opciones ?? [])
    .map((opcion) => opcion.trim().replace(/\s+/g, " "))
    .filter(Boolean)))
    .slice(0, 50);
  if (opciones.some((opcion) => opcion.length > 80)) {
    return { ok: false, error: "Cada opción puede tener hasta 80 caracteres" };
  }
  if (TIPOS_CON_OPCIONES.has(tipo) && opciones.length === 0) {
    return { ok: false, error: "Agrega al menos una opción para la selección" };
  }
  const relacionTipo = entrada.relacionTipo ?? "";
  if (tipo === "relacion" && !esTipoEntidadPersonalizable(relacionTipo)) {
    return { ok: false, error: "Selecciona la base de datos que se relacionará" };
  }

  const tipoFecha = entrada.tipoFecha as TipoFecha | undefined;
  if (tipo === "fecha" && (!tipoFecha || !TIPOS_FECHA.includes(tipoFecha))) {
    return { ok: false, error: "Elige el tipo de fecha: dato, evento o vencimiento" };
  }

  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  if (!await puedeAdministrarEntidad(entrada.entidadTipo)) return { ok: false, error: "No puedes administrar propiedades de esta área" };
  // Libre sólo si la columna nativa que lo usa está eliminada.
  if (await nombrePropiedadReservado(sesion.supabase, entrada.entidadTipo, nombre)) return { ok: false, error: NOMBRE_RESERVADO };

  const { data, error } = await sesion.supabase
    .from("propiedades_personalizadas")
    .insert({
      entidad_tipo: entrada.entidadTipo,
      subtipo: requiereSubtipo(entrada.entidadTipo) ? subtipo : null,
      nombre,
      descripcion: descripcion || null,
      tipo,
      opciones: TIPOS_CON_OPCIONES.has(tipo) ? opciones : [],
      configuracion: tipo === "relacion" ? { entidad_tipo: relacionTipo } : {},
      creado_por: sesion.user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "Ya existe una propiedad con ese nombre" };
    if (error?.code === "42P01" || error?.code === "PGRST205") {
      return { ok: false, error: "Falta aplicar la migración de propiedades personalizadas" };
    }
    return { ok: false, error: error?.message ?? "No se pudo crear la propiedad" };
  }

  if (tipo === "fecha" && tipoFecha) {
    const { error: errorTipoFecha } = await sesion.supabase
      .from("fechas_config")
      .upsert({ fuente: fuentePropiedad(data.id as string), tipo: tipoFecha });
    if (errorTipoFecha) {
      // Sin su tipo de fecha la propiedad quedaría como "evento" aunque se
      // eligiera "dato" o "vencimiento": mejor no crearla que crearla mal.
      await sesion.supabase.from("propiedades_personalizadas").delete().eq("id", data.id);
      return { ok: false, error: "No se pudo guardar el tipo de fecha. Intenta de nuevo." };
    }
  }

  revalidarEntidad(entrada.entidadTipo, undefined);
  return { ok: true, id: data.id as string };
}

export async function actualizarDefinicionPropiedadPersonalizada(
  propiedadId: string,
  entrada: { nombre: string; descripcion?: string }
): Promise<Resultado> {
  if (!esUuid(propiedadId)) return { ok: false, error: "Propiedad no válida" };

  const nombre = entrada.nombre.trim().replace(/\s+/g, " ");
  const descripcion = (entrada.descripcion ?? "").trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: false, error: "Escribe un nombre para la propiedad" };
  if (nombre.length > 80) return { ok: false, error: "El nombre no puede pasar de 80 caracteres" };
  if (descripcion.length > 240) return { ok: false, error: "La descripción no puede pasar de 240 caracteres" };

  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  const { data: definicion } = await sesion.supabase
    .from("propiedades_personalizadas")
    .select("entidad_tipo")
    .eq("id", propiedadId)
    .maybeSingle();
  if (!definicion || !esTipoEntidadPersonalizable(definicion.entidad_tipo)) {
    return { ok: false, error: "La propiedad ya no existe" };
  }
  if (!await puedeAdministrarEntidad(definicion.entidad_tipo)) {
    return { ok: false, error: "No puedes administrar propiedades de esta área" };
  }
  if (await nombrePropiedadReservado(sesion.supabase, definicion.entidad_tipo, nombre)) return { ok: false, error: NOMBRE_RESERVADO };

  const { error } = await sesion.supabase
    .from("propiedades_personalizadas")
    .update({ nombre, descripcion: descripcion || null, actualizado_en: new Date().toISOString() })
    .eq("id", propiedadId);
  if (error?.code === "23505") return { ok: false, error: "Ya existe una propiedad con ese nombre" };
  if (error) return { ok: false, error: error.message };

  revalidarEntidad(definicion.entidad_tipo, undefined);
  return { ok: true };
}

export async function actualizarValorPropiedadPersonalizada(
  propiedadId: string,
  entidadId: string,
  valor: unknown
): Promise<Resultado> {
  if (!esUuid(propiedadId) || !esUuid(entidadId)) return { ok: false, error: "Propiedad o registro no válido" };

  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  const { data: definicion } = await sesion.supabase
    .from("propiedades_personalizadas")
    .select("id, entidad_tipo, tipo, opciones, configuracion")
    .eq("id", propiedadId)
    .maybeSingle();
  if (!definicion) return { ok: false, error: "La propiedad ya no existe" };
  if (!esTipoEntidadPersonalizable(definicion.entidad_tipo)) return { ok: false, error: "La propiedad pertenece a una tabla no válida" };
  if (!await puedeAdministrarEntidad(definicion.entidad_tipo)) return { ok: false, error: "No puedes administrar propiedades de esta área" };

  const entidadConfig = ENTIDADES_PERSONALIZABLES[definicion.entidad_tipo];
  const [{ data: registro }, { data: valorPrevio }] = await Promise.all([
    sesion.supabase.from(entidadConfig.tabla).select("id").eq("id", entidadId).maybeSingle(),
    definicion.tipo === "relacion"
      ? sesion.supabase.from("valores_propiedad_personalizada").select("valor").eq("propiedad_id", propiedadId).eq("entidad_id", entidadId).maybeSingle()
      : Promise.resolve({ data: null as { valor: unknown } | null }),
  ]);
  if (!registro) return { ok: false, error: "No se encontró el registro" };

  const normalizado = normalizarValor(
    definicion.tipo as TipoPropiedadPersonalizada,
    valor,
    Array.isArray(definicion.opciones) ? definicion.opciones as unknown[] : []
  );
  if (!normalizado.ok) return normalizado;

  // Para "relación": además de guardar el valor, sincroniza `vinculos` para
  // que el par aparezca también en "Documentos y relaciones" de ambas
  // fichas — no sólo como valor suelto de esta propiedad.
  let syncRelacion: { tipoDestino: TipoEntidadPersonalizable; idsAgregar: string[]; idsQuitar: string[] } | null = null;
  if (definicion.tipo === "relacion") {
    const configuracion = definicion.configuracion && typeof definicion.configuracion === "object" && !Array.isArray(definicion.configuracion)
      ? definicion.configuracion as Record<string, unknown>
      : {};
    const tipoDestino = configuracion.entidad_tipo;
    if (typeof tipoDestino !== "string" || !esTipoEntidadPersonalizable(tipoDestino)) {
      return { ok: false, error: "La relación no tiene una base de datos configurada" };
    }

    const idsNuevos = normalizado.vacio ? [] : (normalizado.valor as string[]);
    if (idsNuevos.length > 0) {
      const destinoConfig = ENTIDADES_PERSONALIZABLES[tipoDestino];
      const { data: destinos, error } = await sesion.supabase
        .from(destinoConfig.tabla)
        .select("id")
        .in("id", idsNuevos);
      if (error || (destinos ?? []).length !== idsNuevos.length) {
        return { ok: false, error: "Uno de los registros relacionados ya no está disponible" };
      }
    }

    // La propiedad muestra también lo ya vinculado por `vinculos` (ver
    // `cargarPropiedadesPersonalizadas`): cuenta como "anterior" para que
    // quitarlo aquí borre el vínculo en vez de reaparecer al recargar.
    const vinculados = await cargarVinculosRelacion(sesion.supabase, definicion.entidad_tipo, [entidadId], new Set([tipoDestino]));
    const idsAnteriores = Array.from(new Set([
      ...idsDesdeValor(valorPrevio?.valor),
      ...(vinculados.get(`${entidadId}:${tipoDestino}`) ?? []),
    ]));
    syncRelacion = {
      tipoDestino,
      idsAgregar: idsNuevos.filter((id) => !idsAnteriores.includes(id)),
      idsQuitar: idsAnteriores.filter((id) => !idsNuevos.includes(id)),
    };
  }

  if (normalizado.vacio) {
    const { error } = await sesion.supabase
      .from("valores_propiedad_personalizada")
      .delete()
      .eq("propiedad_id", propiedadId)
      .eq("entidad_id", entidadId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await sesion.supabase
      .from("valores_propiedad_personalizada")
      .upsert({
        propiedad_id: propiedadId,
        entidad_id: entidadId,
        valor: normalizado.valor,
        actualizado_por: sesion.user.id,
        actualizado_en: new Date().toISOString(),
      }, { onConflict: "propiedad_id,entidad_id" });
    if (error) return { ok: false, error: error.message };
  }

  if (syncRelacion && (syncRelacion.idsAgregar.length > 0 || syncRelacion.idsQuitar.length > 0)) {
    await sincronizarVinculosDesdeRelacion(
      sesion.supabase,
      definicion.entidad_tipo,
      entidadId,
      syncRelacion.tipoDestino,
      syncRelacion.idsAgregar,
      syncRelacion.idsQuitar
    );
    const destinoConfig = ENTIDADES_PERSONALIZABLES[syncRelacion.tipoDestino];
    revalidatePath(destinoConfig.href);
    for (const id of [...syncRelacion.idsAgregar, ...syncRelacion.idsQuitar]) {
      revalidatePath(`${destinoConfig.href}/${id}`);
    }
  }

  revalidarEntidad(definicion.entidad_tipo as TipoEntidadPersonalizable, entidadId);
  return { ok: true };
}

export async function eliminarPropiedadPersonalizada(propiedadId: string): Promise<Resultado> {
  if (!esUuid(propiedadId)) return { ok: false, error: "Propiedad no válida" };
  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  const { data: definicion } = await sesion.supabase.from("propiedades_personalizadas").select("entidad_tipo").eq("id", propiedadId).maybeSingle();
  if (!definicion || !await puedeAdministrarEntidad(definicion.entidad_tipo)) return { ok: false, error: "No puedes administrar esta propiedad" };

  const { error } = await sesion.supabase
    .from("propiedades_personalizadas")
    .delete()
    .eq("id", propiedadId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function actualizarOpcionesPropiedadPersonalizada(propiedadId: string, opciones: string[]): Promise<Resultado> {
  if (!esUuid(propiedadId)) return { ok: false, error: "Propiedad no válida" };

  const limpias = Array.from(new Set(opciones.map((opcion) => opcion.trim().replace(/\s+/g, " ")).filter(Boolean))).slice(0, 50);
  if (limpias.some((opcion) => opcion.length > 80)) return { ok: false, error: "Cada opción puede tener hasta 80 caracteres" };
  if (limpias.length === 0) return { ok: false, error: "Debe quedar al menos una opción" };

  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  const { data: definicion } = await sesion.supabase
    .from("propiedades_personalizadas")
    .select("entidad_tipo, tipo")
    .eq("id", propiedadId)
    .maybeSingle();
  if (!definicion) return { ok: false, error: "La propiedad ya no existe" };
  if (!TIPOS_CON_OPCIONES.has(definicion.tipo as TipoPropiedadPersonalizada)) return { ok: false, error: "Esta propiedad no tiene opciones" };
  if (!await puedeAdministrarEntidad(definicion.entidad_tipo)) return { ok: false, error: "No puedes administrar propiedades de esta área" };

  const { error } = await sesion.supabase
    .from("propiedades_personalizadas")
    .update({ opciones: limpias, actualizado_en: new Date().toISOString() })
    .eq("id", propiedadId);
  if (error) return { ok: false, error: error.message };

  revalidarEntidad(definicion.entidad_tipo as TipoEntidadPersonalizable, undefined);
  return { ok: true };
}

/**
 * Renombra una opción de Selección/Multiselección y, en el mismo paso, el valor
 * de los registros que la tenían (función SQL `renombrar_opcion_propiedad`).
 */
export async function renombrarOpcionPropiedadPersonalizada(propiedadId: string, anterior: string, nuevo: string): Promise<Resultado> {
  if (!esUuid(propiedadId)) return { ok: false, error: "Propiedad no válida" };
  const limpio = nuevo.trim().replace(/\s+/g, " ");
  if (!limpio) return { ok: false, error: "Escribe el nombre de la opción" };
  if (limpio.length > 80) return { ok: false, error: "La opción puede tener hasta 80 caracteres" };

  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  const { data: definicion } = await sesion.supabase
    .from("propiedades_personalizadas")
    .select("entidad_tipo")
    .eq("id", propiedadId)
    .maybeSingle();
  if (!definicion) return { ok: false, error: "La propiedad ya no existe" };
  if (!await puedeAdministrarEntidad(definicion.entidad_tipo)) return { ok: false, error: "No puedes administrar propiedades de esta área" };

  const { data, error } = await sesion.supabase.rpc("renombrar_opcion_propiedad", {
    p_id: propiedadId,
    p_anterior: anterior,
    p_nuevo: limpio,
  });
  if (error) return { ok: false, error: error.message };
  const respuesta = data as { ok: boolean; error?: string } | null;
  if (!respuesta?.ok) return { ok: false, error: respuesta?.error ?? "No se pudo renombrar la opción" };

  revalidarEntidad(definicion.entidad_tipo as TipoEntidadPersonalizable, undefined);
  return { ok: true };
}

/**
 * Une dos opciones de Selección/Multiselección: los registros con `origen`
 * pasan a `destino` (sin dejarlo repetido en Multiselección) y `origen` sale de
 * la lista, todo en un paso (función SQL `unir_opcion_propiedad`). Es lo que
 * pasa al renombrar una opción con el nombre de otra que ya existe.
 */
export async function unirOpcionPropiedadPersonalizada(propiedadId: string, origen: string, destino: string): Promise<Resultado> {
  if (!esUuid(propiedadId)) return { ok: false, error: "Propiedad no válida" };
  if (!origen || !destino) return { ok: false, error: "Elige las dos opciones que se van a unir" };
  if (origen === destino) return { ok: true };

  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  const { data: definicion } = await sesion.supabase
    .from("propiedades_personalizadas")
    .select("entidad_tipo")
    .eq("id", propiedadId)
    .maybeSingle();
  if (!definicion) return { ok: false, error: "La propiedad ya no existe" };
  if (!await puedeAdministrarEntidad(definicion.entidad_tipo)) return { ok: false, error: "No puedes administrar propiedades de esta área" };

  const { data, error } = await sesion.supabase.rpc("unir_opcion_propiedad", {
    p_id: propiedadId,
    p_origen: origen,
    p_destino: destino,
  });
  if (error) {
    // PGRST202 / 42883: la función todavía no existe en la base.
    if (error.code === "PGRST202" || error.code === "42883") {
      return { ok: false, error: "Falta aplicar la migración que permite unir opciones" };
    }
    return { ok: false, error: error.message };
  }
  const respuesta = data as { ok: boolean; error?: string } | null;
  if (!respuesta?.ok) return { ok: false, error: respuesta?.error ?? "No se pudo unir las opciones" };

  revalidarEntidad(definicion.entidad_tipo as TipoEntidadPersonalizable, undefined);
  return { ok: true };
}

/**
 * Cambia el TIPO de una propiedad personalizada (no sólo cómo la interpreta
 * una vista: la definición en la base). Los valores que ya existían se
 * convierten a la forma del tipo nuevo y los que no tienen equivalente se
 * borran; al pasar a Selección o Multiselección, los valores que ya estaban
 * escritos se siembran como opciones para que ninguna fila quede con un valor
 * que la propiedad ya no admite.
 *
 * Relación queda fuera a propósito: necesita una tabla de destino y mantiene
 * `vinculos` sincronizados en las dos fichas, así que convertirla desde aquí
 * dejaría vínculos huérfanos.
 */
export async function actualizarTipoPropiedadPersonalizada(
  propiedadId: string,
  tipoNuevo: string,
  /** Obligatorio al convertir a "fecha": dato, evento o vencimiento. */
  tipoFechaNuevo?: string
): Promise<Resultado> {
  if (!esUuid(propiedadId)) return { ok: false, error: "Propiedad no válida" };
  if (!TIPOS.has(tipoNuevo as TipoPropiedadPersonalizada)) return { ok: false, error: "Tipo de propiedad no válido" };
  const tipo = tipoNuevo as TipoPropiedadPersonalizada;

  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  const { data: definicion } = await sesion.supabase
    .from("propiedades_personalizadas")
    .select("entidad_tipo, tipo, opciones")
    .eq("id", propiedadId)
    .maybeSingle();
  if (!definicion) return { ok: false, error: "La propiedad ya no existe" };
  if (!esTipoEntidadPersonalizable(definicion.entidad_tipo)) return { ok: false, error: "La propiedad pertenece a una tabla no válida" };
  if (!await puedeAdministrarEntidad(definicion.entidad_tipo)) return { ok: false, error: "No puedes administrar propiedades de esta área" };

  const tipoAnterior = definicion.tipo as TipoPropiedadPersonalizada;
  if (tipoAnterior === tipo) return { ok: true };
  if (tipo === "relacion" || tipoAnterior === "relacion") {
    return { ok: false, error: "Una propiedad de relación no se convierte: crea otra propiedad con el tipo que necesitas" };
  }
  const tipoFecha = tipoFechaNuevo as TipoFecha | undefined;
  if (tipo === "fecha" && (!tipoFecha || !TIPOS_FECHA.includes(tipoFecha))) {
    return { ok: false, error: "Elige el tipo de fecha: dato, evento o vencimiento" };
  }

  const { data: valores, error: errorValores } = await sesion.supabase
    .from("valores_propiedad_personalizada")
    .select("entidad_id, valor")
    .eq("propiedad_id", propiedadId);
  if (errorValores) return { ok: false, error: errorValores.message };

  const convertidos = (valores ?? []).map((fila) => ({
    entidadId: fila.entidad_id as string,
    valor: convertirValorAlTipo(fila.valor, tipo),
  }));

  let opciones: string[] = [];
  if (TIPOS_CON_OPCIONES.has(tipo)) {
    opciones = Array.from(new Set([
      ...(Array.isArray(definicion.opciones) ? (definicion.opciones as unknown[]).filter((opcion): opcion is string => typeof opcion === "string") : []),
      ...convertidos.flatMap(({ valor }) => (Array.isArray(valor) ? valor : [valor]))
        .filter((valor): valor is string => typeof valor === "string" && valor.trim() !== ""),
    ]));
    // Recortar la lista dejaría filas con un valor que la propiedad ya no
    // admite (se vería, pero no se podría volver a guardar): mejor no convertir.
    if (opciones.length > 50) {
      return {
        ok: false,
        error: `Hay ${opciones.length} valores distintos escritos y una ${tipo === "seleccion" ? "selección" : "multiselección"} admite hasta 50. Limpia los valores antes de cambiar el tipo.`,
      };
    }
  }

  // Antes de convertir: si no se pudiera guardar el tipo de fecha, la propiedad
  // quedaría como "evento" aunque se eligiera otra cosa.
  if (tipo === "fecha" && tipoFecha) {
    const { error: errorTipoFecha } = await sesion.supabase
      .from("fechas_config")
      .upsert({ fuente: fuentePropiedad(propiedadId), tipo: tipoFecha });
    if (errorTipoFecha) return { ok: false, error: "No se pudo guardar el tipo de fecha. Intenta de nuevo." };
  }

  const { error } = await sesion.supabase
    .from("propiedades_personalizadas")
    .update({ tipo, opciones, actualizado_en: new Date().toISOString() })
    .eq("id", propiedadId);
  if (error) return { ok: false, error: error.message };

  // Ya no es una fecha: su tipo de fecha deja de tener sentido.
  if (tipoAnterior === "fecha") {
    await sesion.supabase.from("fechas_config").delete().eq("fuente", fuentePropiedad(propiedadId));
  }

  const aBorrar = convertidos.filter(({ valor }) => valor === null).map(({ entidadId }) => entidadId);
  if (aBorrar.length > 0) {
    await sesion.supabase
      .from("valores_propiedad_personalizada")
      .delete()
      .eq("propiedad_id", propiedadId)
      .in("entidad_id", aBorrar);
  }

  const aGuardar = convertidos.filter(({ valor }) => valor !== null);
  if (aGuardar.length > 0) {
    await sesion.supabase
      .from("valores_propiedad_personalizada")
      .upsert(
        aGuardar.map(({ entidadId, valor }) => ({
          propiedad_id: propiedadId,
          entidad_id: entidadId,
          valor,
          actualizado_por: sesion.user.id,
          actualizado_en: new Date().toISOString(),
        })),
        { onConflict: "propiedad_id,entidad_id" }
      );
  }

  revalidarEntidad(definicion.entidad_tipo, undefined);
  return { ok: true };
}

/** Valor equivalente en el tipo nuevo, o `null` si no hay forma de conservarlo. */
function convertirValorAlTipo(valor: unknown, tipo: TipoPropiedadPersonalizada): string | number | boolean | string[] | null {
  const lista = Array.isArray(valor) ? valor.filter((item): item is string => typeof item === "string") : null;
  const texto = lista ? lista.join(", ") : typeof valor === "boolean" ? (valor ? "Sí" : "No") : valor == null ? "" : String(valor).trim();

  if (tipo === "multiseleccion") {
    const elementos = (lista ?? (texto ? [texto] : [])).map((item) => item.slice(0, 80));
    return elementos.length > 0 ? elementos.slice(0, 50) : null;
  }
  if (tipo === "seleccion") {
    const primero = (lista?.[0] ?? texto).slice(0, 80);
    return primero ? primero : null;
  }
  if (tipo === "numero") {
    const numero = Number(texto.replace(/\s/g, "").replace(/,/g, ""));
    return texto !== "" && Number.isFinite(numero) && Math.abs(numero) <= 1e15 ? numero : null;
  }
  if (tipo === "fecha") {
    return esFechaISOValida(texto) ? texto : null;
  }
  if (tipo === "booleano") {
    const clave = texto.toLocaleLowerCase("es-PE");
    if (["true", "sí", "si", "1", "x"].includes(clave)) return true;
    if (["false", "no", "0"].includes(clave)) return false;
    return null;
  }
  return texto ? texto.slice(0, 2000) : null;
}

/** La copia de una propiedad fecha conserva su tipo de fecha: un vencimiento duplicado sigue avisando. */
async function copiarTipoFecha(supabase: SupabaseClient, origenId: string, copiaId: string) {
  const { data } = await supabase
    .from("fechas_config")
    .select("tipo")
    .eq("fuente", fuentePropiedad(origenId))
    .maybeSingle();
  if (data) await supabase.from("fechas_config").upsert({ fuente: fuentePropiedad(copiaId), tipo: data.tipo });
}

export async function duplicarPropiedadPersonalizada(propiedadId: string): Promise<ResultadoCrear> {
  if (!esUuid(propiedadId)) return { ok: false, error: "Propiedad no válida" };
  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  const { data: original } = await sesion.supabase
    .from("propiedades_personalizadas")
    .select("entidad_tipo, subtipo, nombre, descripcion, tipo, opciones, configuracion")
    .eq("id", propiedadId)
    .maybeSingle();
  if (!original) return { ok: false, error: "La propiedad ya no existe" };
  if (!esTipoEntidadPersonalizable(original.entidad_tipo)) return { ok: false, error: "La propiedad pertenece a una tabla no válida" };
  if (!await puedeAdministrarEntidad(original.entidad_tipo)) return { ok: false, error: "No puedes administrar propiedades de esta área" };

  for (let intento = 0; intento < 20; intento += 1) {
    const nombre = intento === 0 ? `${original.nombre} (copia)` : `${original.nombre} (copia ${intento + 1})`;
    const { data, error } = await sesion.supabase
      .from("propiedades_personalizadas")
      .insert({
        entidad_tipo: original.entidad_tipo,
        subtipo: original.subtipo,
        nombre,
        descripcion: original.descripcion,
        tipo: original.tipo,
        opciones: original.opciones,
        configuracion: original.configuracion,
        creado_por: sesion.user.id,
      })
      .select("id")
      .single();
    if (!error && data) {
      if (original.tipo === "fecha") await copiarTipoFecha(sesion.supabase, propiedadId, data.id as string);
      revalidarEntidad(original.entidad_tipo, undefined);
      return { ok: true, id: data.id as string };
    }
    if (error?.code !== "23505") return { ok: false, error: error?.message ?? "No se pudo duplicar la propiedad" };
  }
  return { ok: false, error: "Ya existen demasiadas copias de esta propiedad" };
}

function idsDesdeValor(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((id): id is string => typeof id === "string") : [];
}

function normalizarValor(
  tipo: TipoPropiedadPersonalizada,
  valor: unknown,
  opciones: unknown[]
): { ok: true; valor?: string | number | boolean | string[]; vacio: boolean } | { ok: false; error: string } {
  if (tipo === "booleano") {
    if (valor === null || valor === "") return { ok: true, vacio: true };
    if (typeof valor !== "boolean") return { ok: false, error: "Valor de casilla no válido" };
    return { ok: true, valor, vacio: false };
  }

  if (valor === null || valor === undefined || valor === "") return { ok: true, vacio: true };

  if (tipo === "relacion") {
    const idsCrudos = Array.isArray(valor) ? valor : [valor];
    if (idsCrudos.some((id) => typeof id !== "string" || !esUuid(id))) {
      return { ok: false, error: "La relación contiene registros no válidos" };
    }
    const ids = Array.from(new Set(idsCrudos as string[]));
    if (ids.length > 100) return { ok: false, error: "Una relación puede contener hasta 100 registros" };
    return ids.length === 0 ? { ok: true, vacio: true } : { ok: true, valor: ids, vacio: false };
  }

  if (tipo === "numero") {
    const numero = typeof valor === "number" ? valor : Number(valor);
    if (!Number.isFinite(numero) || Math.abs(numero) > 1e15) return { ok: false, error: "Ingresa un número válido" };
    return { ok: true, valor: numero, vacio: false };
  }

  const texto = typeof valor === "string" ? valor.trim() : "";
  if (tipo === "fecha") {
    if (!esFechaISOValida(texto)) {
      return { ok: false, error: "Ingresa una fecha válida" };
    }
    return { ok: true, valor: texto, vacio: false };
  }

  if (tipo === "seleccion") {
    const validas = opciones.filter((opcion): opcion is string => typeof opcion === "string");
    if (!validas.includes(texto)) return { ok: false, error: "La opción elegida ya no está disponible" };
    return { ok: true, valor: texto, vacio: false };
  }

  if (tipo === "multiseleccion") {
    const validas = new Set(opciones.filter((opcion): opcion is string => typeof opcion === "string"));
    const elegidas = Array.isArray(valor) ? valor : [valor];
    const unicas = Array.from(new Set(elegidas.filter((item): item is string => typeof item === "string")));
    if (unicas.some((item) => !validas.has(item))) return { ok: false, error: "Una de las opciones elegidas ya no está disponible" };
    if (unicas.length > 50) return { ok: false, error: "Una selección múltiple puede tener hasta 50 opciones" };
    return unicas.length === 0 ? { ok: true, vacio: true } : { ok: true, valor: unicas, vacio: false };
  }

  if (texto.length > 2000) return { ok: false, error: "El texto no puede pasar de 2,000 caracteres" };
  return { ok: true, valor: texto, vacio: false };
}

function revalidarEntidad(tipo: TipoEntidadPersonalizable, entidadId?: string) {
  const config = ENTIDADES_PERSONALIZABLES[tipo];
  revalidatePath(config.href);
  if (entidadId) revalidatePath(`${config.href}/${entidadId}`);
  if (tipo === "proceso") revalidatePath("/procesos/materia/[materia]", "page");
  if (tipo === "contrato") revalidatePath("/contratos/tipo/[tipo]", "page");
  if (tipo === "documento") revalidatePath("/documentos/tipos/[tipo]", "page");
}
