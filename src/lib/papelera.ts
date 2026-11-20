/**
 * Papelera: config compartida entre la acción de servidor y el panel.
 * Sin imports de servidor a propósito — lo importan ambos lados.
 *
 * Las claves son los nombres de tabla que devuelve `papelera_listar()`;
 * tienen que coincidir con la lista blanca de `papelera_tablas()` en la
 * migración 20260831000400.
 */

export const DIAS_RETENCION = 30;

export type FilaPapelera = {
  tabla: string;
  id: string;
  nombre: string;
  eliminadoEn: string;
  actorId: string | null;
  actorNombre: string | null;
  actorCorreo: string | null;
  adjuntos: number;
};

type TipoPapelera = {
  /** Etiqueta singular, para la fila y los mensajes de confirmación. */
  label: string;
  /** Nombre de icono de lucide-react; el panel hace el lookup. */
  icono: string;
  /** Ruta de la ficha, para ir al registro tras restaurarlo. */
  href?: (id: string) => string;
  /** Rutas a revalidar tras restaurar o purgar. */
  revalidar: string[];
};

export const TIPOS_PAPELERA: Record<string, TipoPapelera> = {
  propietarios: {
    label: "Propietario",
    icono: "Users",
    href: (id) => `/entidades/propietarios/${id}`,
    revalidar: ["/entidades/propietarios"],
  },
  predios: {
    label: "Predio",
    icono: "MapPin",
    href: (id) => `/entidades/predios/${id}`,
    revalidar: ["/entidades/predios"],
  },
  vehiculos: {
    label: "Vehículo",
    icono: "Car",
    href: (id) => `/entidades/vehiculos/${id}`,
    revalidar: ["/entidades/vehiculos"],
  },
  concesiones_mineras: {
    label: "Concesión minera",
    icono: "Gem",
    href: (id) => `/entidades/concesiones/${id}`,
    revalidar: ["/entidades/concesiones"],
  },
  personal: {
    label: "Personal",
    icono: "UserCheck",
    href: (id) => `/entidades/personal/${id}`,
    revalidar: ["/entidades/personal"],
  },
  oficinas_registrales: {
    label: "Oficina registral",
    icono: "Landmark",
    href: (id) => `/entidades/oficinas/${id}`,
    revalidar: ["/entidades/oficinas"],
  },
  procesos: {
    label: "Proceso judicial",
    icono: "Gavel",
    href: (id) => `/procesos/${id}`,
    revalidar: ["/procesos"],
  },
  contratos: {
    label: "Contrato",
    icono: "ScrollText",
    href: (id) => `/contratos/${id}`,
    revalidar: ["/contratos"],
  },
  documentos: {
    label: "Documento",
    icono: "FileText",
    href: (id) => `/documentos/${id}`,
    revalidar: ["/documentos"],
  },
  eventos: {
    label: "Diligencia",
    icono: "CalendarClock",
    revalidar: ["/procesos", "/dashboard"],
  },
  archivos: {
    label: "Archivo adjunto",
    icono: "Paperclip",
    revalidar: [],
  },
};

export function tipoPapelera(tabla: string): TipoPapelera {
  return TIPOS_PAPELERA[tabla] ?? { label: tabla, icono: "Trash2", revalidar: [] };
}

/** Días que le quedan antes de la purga automática. Negativo = ya vencido. */
export function diasParaPurga(eliminadoEn: string): number {
  const transcurridos = (Date.now() - new Date(eliminadoEn).getTime()) / 86_400_000;
  return Math.ceil(DIAS_RETENCION - transcurridos);
}

export function nombreActorPapelera(fila: FilaPapelera): string {
  return fila.actorNombre?.trim() || fila.actorCorreo?.split("@")[0] || "Alguien";
}

/** Coincidencia laxa para el buscador: sin acentos y sin distinguir mayúsculas. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
