/**
 * Roles de la aplicación. Los literales son los del enum `rol_usuario` en
 * Postgres (migración 015); las etiquetas largas viven sólo aquí, para que
 * cambiar el texto comercial no cueste una migración.
 *
 * Sin imports de servidor a propósito: lo importan tanto Server Components
 * (layout) como Client Components (sidebar). Las funciones que sí tocan
 * Supabase/`next/headers` viven en `perfil.ts`.
 */
export type Rol = "administrador" | "tesoreria" | "soporte_documentario";

export const ROL_LABEL: Record<Rol, string> = {
  administrador: "ADMINISTRADOR-GERENCIA GENERAL-ÁREA LEGAL",
  tesoreria: "TESORERÍA-CONTABILIDAD",
  soporte_documentario: "SOPORTE DOCUMENTARIO",
};

// ---------------------------------------------------------------------
// Predicados. Espejo de las funciones SQL de la migración 015: si cambia
// una política allí, tiene que cambiar su gemela aquí.
// ---------------------------------------------------------------------

/** El permiso de escritura se resuelve sobre el área, sin elevar el rol. */
export function puedeEscribir(acceso: Rol | Acceso | null, seccion?: Seccion): boolean {
  if (typeof acceso === "object" && acceso) {
    const area = seccion ?? acceso.seccion;
    return area ? nivelAcceso(acceso.rol, area, acceso.permisos) === "administrar" : acceso.rol === "administrador";
  }
  return acceso === "administrador";
}

export function esAdmin(rol: Rol | null): boolean {
  return rol === "administrador";
}

/** personal_lectura — DNI y remuneración, Ley N° 29733. */
export function puedeVerPersonal(acceso: Rol | Acceso | null): boolean {
  return typeof acceso === "object" && acceso
    ? nivelAcceso(acceso.rol, "personal", acceso.permisos) !== "sin_acceso"
    : acceso === "administrador";
}

/** Tipos de contrato visibles. Tesorería sólo ve tres de los seis. */
export const TIPOS_CONTRATO_TESORERIA = ["servicios", "mutuo", "arrendamiento"] as const;

export function tiposContratoVisibles(acceso: Rol | Acceso | null): readonly string[] | null {
  const rol = typeof acceso === "object" && acceso ? acceso.rol : acceso;
  if (rol === "tesoreria") {
    const nivel = typeof acceso === "object" && acceso
      ? nivelAcceso(acceso.rol, "contratos", acceso.permisos)
      : nivelAcceso(rol, "contratos");
    // La lectura de Tesorería mantiene el alcance económico acotado. Sólo una
    // excepción explícita de administración amplía Contratos a todos sus tipos.
    if (nivel !== "administrar") return TIPOS_CONTRATO_TESORERIA;
  }
  return null; // null = sin filtro, ve todos
}

/**
 * Secciones de navegación por rol. Tesorería-Contabilidad es el único rol
 * con alcance parcial: fuera de esta lista, RLS le devolvería tablas vacías,
 * que en pantalla se confunde con "no hay datos".
 */
export type Seccion =
  | "dashboard"
  | "riesgo"
  | "propietarios"
  | "predios"
  | "vehiculos"
  | "concesiones"
  | "personal"
  | "oficinas"
  | "procesos"
  | "documentos"
  | "contratos";

const TODAS: Seccion[] = [
  "dashboard", "riesgo", "propietarios", "predios", "vehiculos", "concesiones",
  "personal", "oficinas", "procesos", "documentos", "contratos",
];

export const SECCIONES_POR_ROL: Record<Rol, Seccion[]> = {
  administrador: TODAS,
  // Todo salvo `personal`: la tabla queda invisible, no sólo vacía.
  // Dashboard oculto por ahora (pedido explícito, por revisar más adelante).
  soporte_documentario: TODAS.filter((s) => s !== "personal" && s !== "dashboard"),
  // Sólo Vehículos y Contratos (los tres tipos filtrados). Sin Documentos:
  // ni la biblioteca general ni los adjuntos de sus propios vehículos o
  // contratos — cero acceso a archivos (migración 016). Dashboard oculto
  // por ahora (pedido explícito, por revisar más adelante).
  tesoreria: ["vehiculos", "contratos"],
};

export function puedeVerSeccion(rol: Rol | null, seccion: Seccion): boolean {
  if (!rol) return false;
  return SECCIONES_POR_ROL[rol].includes(seccion);
}

export const SECCIONES = TODAS;
export type NivelAcceso = "administrar" | "visualizar" | "sin_acceso";
export type Permisos = Partial<Record<Seccion, NivelAcceso>>;
export type Acceso = { rol: Rol | null; permisos: Permisos; seccion?: Seccion };

/** Dashboard y Riesgo son informes: no contienen acciones de escritura. */
export const SECCIONES_SOLO_LECTURA: readonly Seccion[] = ["dashboard", "riesgo"];

export function puedeAdministrarSeccion(seccion: Seccion): boolean {
  return !SECCIONES_SOLO_LECTURA.includes(seccion);
}

export function nivelBaseRol(rol: Rol | null, seccion: Seccion): NivelAcceso {
  if (!rol) return "sin_acceso";
  if (rol === "administrador") return puedeAdministrarSeccion(seccion) ? "administrar" : "visualizar";
  return puedeVerSeccion(rol, seccion) ? "visualizar" : "sin_acceso";
}

/**
 * Conserva únicamente excepciones reales al rol. Evita que una fila redundante
 * cambie el significado del acceso (antes ocurría con Contratos/Tesorería).
 */
export function normalizarPermisos(rol: Rol | null, permisos: Permisos = {}): Permisos {
  if (!rol || rol === "administrador") return {};
  const resultado: Permisos = {};
  for (const seccion of SECCIONES) {
    const solicitado = permisos[seccion];
    if (solicitado !== "administrar" && solicitado !== "visualizar" && solicitado !== "sin_acceso") continue;
    const nivel = solicitado === "administrar" && !puedeAdministrarSeccion(seccion)
      ? "visualizar"
      : solicitado;
    if (nivel !== nivelBaseRol(rol, seccion)) resultado[seccion] = nivel;
  }
  return resultado;
}

export function nivelAcceso(rol: Rol | null, seccion: Seccion, permisos: Permisos = {}): NivelAcceso {
  if (!rol) return "sin_acceso";
  if (rol === "administrador") return nivelBaseRol(rol, seccion);
  const nivel = permisos[seccion];
  if (nivel === "administrar") return puedeAdministrarSeccion(seccion) ? nivel : "visualizar";
  if (nivel === "visualizar" || nivel === "sin_acceso") return nivel;
  return nivelBaseRol(rol, seccion);
}

const AREA_POR_ENTIDAD: Record<string, Seccion> = {
  propietario: "propietarios", propietarios: "propietarios", datos_empresas: "propietarios",
  predio: "predios", predios: "predios", vehiculo: "vehiculos", vehiculos: "vehiculos",
  concesion: "concesiones", concesiones_mineras: "concesiones", personal: "personal",
  oficina_registral: "oficinas", oficinas_registrales: "oficinas",
  proceso: "procesos", procesos: "procesos", evento: "procesos", eventos: "procesos",
  documento: "documentos", documentos: "documentos", contrato: "contratos", contratos: "contratos",
};

export function seccionEntidad(entidad: string): Seccion | undefined {
  return AREA_POR_ENTIDAD[entidad];
}

export function seccionRuta(pathname: string): Seccion | undefined {
  if (pathname === "/dashboard/riesgo" || pathname.startsWith("/dashboard/riesgo/")) return "riesgo";
  if (pathname === "/dashboard") return "dashboard";
  if (pathname.startsWith("/entidades/")) {
    const parte = pathname.split("/")[2];
    return ({ concesiones: "concesiones", oficinas: "oficinas" } as Record<string, Seccion>)[parte] ?? seccionEntidad(parte);
  }
  return seccionEntidad(pathname.split("/")[1]);
}
