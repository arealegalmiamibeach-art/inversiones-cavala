import { AlertTriangle, Clock3 } from "lucide-react";
import { calcularVigencia } from "@/lib/contratos/vigencia";

/**
 * Semáforo de vigencia + cuenta regresiva en una sola pieza. Antes vivían
 * como dos filas separadas ("Vigencia" con la insignia VIGENTE/VENCIDO y
 * "Vencimiento" con "Faltan N días") que repetían la misma fecha de dos
 * formas distintas — el panel de detalle sólo necesita una.
 *
 * No se usa en la tabla: ahí "Vigencia" y "Vencimiento" siguen siendo dos
 * columnas separadas (VigenciaBadge / SeguimientoBadge en contratos-list.tsx),
 * eso no cambió.
 */
export function VigenciaIndicador({ fecha }: { fecha: string | null }) {
  const { estado, dias, vigencia, seguimiento } = calcularVigencia(fecha);
  if (estado === "sin_fecha") return <span className="text-sm text-white/55">—</span>;

  const vencido = estado === "vencido";
  const proximo = dias !== null && dias >= 0 && dias <= 30;

  return (
    <span className="inline-flex flex-wrap items-center gap-2" title="Se calcula automáticamente con la fecha de vencimiento">
      <span
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold ${
          vencido ? "bg-amber-500/15 text-amber-200" : "bg-emerald-500/15 text-emerald-200"
        }`}
      >
        {vencido && <AlertTriangle className="h-3 w-3" />}
        {vigencia}
      </span>
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium ${
          vencido || proximo ? "text-amber-300" : "text-white/70"
        }`}
      >
        {vencido ? <AlertTriangle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
        {seguimiento}
      </span>
    </span>
  );
}
