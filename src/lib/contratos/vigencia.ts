import { diasHastaFechaISO } from "@/lib/utils";

/**
 * Fórmulas de vencimiento de contratos, calculadas en vivo desde
 * `fecha_vencimiento` (no dependen del texto importado de Notion).
 *
 *   - Vigencia:    VIGENTE / VENCIDO
 *   - Vencimiento: "Faltan N días" / "Pasaron N días" / "Vence hoy"
 */

export type EstadoVigencia = "vigente" | "vencido" | "sin_fecha";

export type Vigencia = {
  estado: EstadoVigencia;
  /** Días hasta el vencimiento; negativo si ya venció, null si no hay fecha. */
  dias: number | null;
  /** Etiqueta de la fórmula de vigencia: "VIGENTE" | "VENCIDO" | "—". */
  vigencia: string;
  /** Etiqueta de la fórmula de seguimiento: "Faltan 62 días" | "Pasaron 152 días" | "Vence hoy" | "—". */
  seguimiento: string;
};

export function calcularVigencia(fechaVencimiento: string | null | undefined): Vigencia {
  if (!fechaVencimiento) {
    return { estado: "sin_fecha", dias: null, vigencia: "—", seguimiento: "—" };
  }

  const dias = diasHastaFechaISO(fechaVencimiento);
  if (dias === null) {
    return { estado: "sin_fecha", dias: null, vigencia: "—", seguimiento: "—" };
  }

  if (dias < 0) {
    return {
      estado: "vencido",
      dias,
      vigencia: "VENCIDO",
      seguimiento: `Pasaron ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`,
    };
  }

  return {
    estado: "vigente",
    dias,
    vigencia: "VIGENTE",
    seguimiento: dias === 0 ? "Vence hoy" : `Faltan ${dias} día${dias === 1 ? "" : "s"}`,
  };
}
