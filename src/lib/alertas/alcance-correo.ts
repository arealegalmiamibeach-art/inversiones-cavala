import {
  nivelAcceso,
  seccionRuta,
  tiposContratoVisibles,
  type Acceso,
  type Seccion,
} from "@/lib/auth/roles";

/**
 * Qué parte del resumen diario le corresponde a cada persona.
 *
 * La campana ya llega recortada por RLS, pero el cron del correo corre con la
 * service-role key y se salta esas políticas: sin este filtro todos recibían el
 * mismo resumen global, con vencimientos de personal, documentos y diligencias
 * judiciales que su rol no puede abrir en la app. Es el espejo, en TypeScript,
 * de lo que la base ya decide para la sesión de cada usuario.
 *
 * Sin imports de servidor: lo usan el cron y el panel de usuarios.
 */

/**
 * Áreas cuyos registros pueden generar un vencimiento. Procesos queda fuera a
 * propósito: lo suyo son las diligencias, que se resumen aparte.
 */
const AREAS_CON_VENCIMIENTOS: { seccion: Seccion; label: string }[] = [
  { seccion: "contratos", label: "Contratos" },
  { seccion: "vehiculos", label: "Vehículos" },
  { seccion: "personal", label: "Personal" },
  { seccion: "documentos", label: "Documentos" },
  { seccion: "propietarios", label: "Propietarios" },
  { seccion: "predios", label: "Predios" },
  { seccion: "concesiones", label: "Concesiones mineras" },
  { seccion: "oficinas", label: "Oficinas registrales" },
];

const RUTA_CONTRATO = /^\/contratos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;

/** Id del contrato al que apunta un aviso; hace falta para consultar su tipo. */
export function idContratoDeHref(href: string): string | null {
  return RUTA_CONTRATO.exec(href)?.[1] ?? null;
}

/**
 * `tipoContrato` sólo importa en los avisos de contratos: Tesorería ve tres de
 * los seis tipos. Si su tipo no se conoce, se niega: mejor un aviso de menos
 * que uno que no debía llegar.
 */
export function puedeRecibirAlerta(
  acceso: Acceso,
  alerta: { href: string },
  tipoContrato?: string | null
): boolean {
  const seccion = seccionRuta(alerta.href);
  // Una ruta que no se reconoce sólo se le confía al administrador.
  if (!seccion) return acceso.rol === "administrador";
  if (nivelAcceso(acceso.rol, seccion, acceso.permisos) === "sin_acceso") return false;
  if (seccion !== "contratos") return true;
  const tipos = tiposContratoVisibles(acceso);
  return tipos === null || (!!tipoContrato && tipos.includes(tipoContrato));
}

export function filtrarAlertas<T extends { href: string }>(
  alertas: T[],
  acceso: Acceso,
  tiposContrato: ReadonlyMap<string, string>
): T[] {
  return alertas.filter((alerta) => {
    const id = idContratoDeHref(alerta.href);
    return puedeRecibirAlerta(acceso, alerta, id ? tiposContrato.get(id) : null);
  });
}

/** Las diligencias cuelgan de Procesos: quien no ve esa área no las recibe. */
export function puedeRecibirDiligencias(acceso: Acceso): boolean {
  return nivelAcceso(acceso.rol, "procesos", acceso.permisos) !== "sin_acceso";
}

export type AlcanceCorreo = {
  /** Áreas de las que llegan vencimientos, ya en palabras: "Contratos (sólo servicios, mutuo)". */
  vencimientos: string[];
  /** Áreas con vencimientos que su acceso deja fuera. */
  excluidas: string[];
  diligencias: boolean;
};

/** Resumen de lo que recibirá una persona; lo muestra Configuración → Usuarios. */
export function alcanceCorreo(acceso: Acceso): AlcanceCorreo {
  const tipos = tiposContratoVisibles(acceso);
  const vencimientos: string[] = [];
  const excluidas: string[] = [];
  for (const { seccion, label } of AREAS_CON_VENCIMIENTOS) {
    if (nivelAcceso(acceso.rol, seccion, acceso.permisos) === "sin_acceso") {
      excluidas.push(label);
    } else {
      vencimientos.push(seccion === "contratos" && tipos ? `${label} (sólo ${tipos.join(", ")})` : label);
    }
  }
  return { vencimientos, excluidas, diligencias: puedeRecibirDiligencias(acceso) };
}
