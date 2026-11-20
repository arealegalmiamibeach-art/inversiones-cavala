import type { AlcanceCorreo } from "@/lib/alertas/alcance-correo";

/** "todas las áreas" · "todas menos Personal" · "Contratos (sólo servicios), Vehículos" */
function resumenVencimientos({ vencimientos, excluidas }: AlcanceCorreo): string {
  if (vencimientos.length === 0) return "ninguna";
  // Una nota entre paréntesis (los tipos de contrato de Tesorería) se perdería en un "todas".
  const conNota = vencimientos.some((v) => v.includes("("));
  if (!conNota && excluidas.length === 0) return "todas las áreas";
  if (!conNota && excluidas.length <= 2) return `todas menos ${excluidas.join(" y ")}`;
  return vencimientos.join(", ");
}

/**
 * Qué le llegará por correo a esta persona. El cron corta el resumen con el
 * mismo acceso que tiene en la app, así que aquí sólo se muestra: cambia al
 * ajustar su rol o sus excepciones por área.
 */
export function AlcanceCorreoUsuario({ alcance }: { alcance: AlcanceCorreo }) {
  return (
    <div className="max-w-lg space-y-1.5 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 text-[11px] leading-relaxed">
      <p className="flex gap-2">
        <span className="w-[5.5rem] shrink-0 text-white/40">Vencimientos</span>
        <span className="min-w-0 text-white/70">{resumenVencimientos(alcance)}</span>
      </p>
      <p className="flex gap-2">
        <span className="w-[5.5rem] shrink-0 text-white/40">Diligencias</span>
        <span className="min-w-0 text-white/70">
          {alcance.diligencias ? "sí, las de Procesos judiciales" : "no, no tiene acceso a Procesos judiciales"}
        </span>
      </p>
      <p className="pt-0.5 text-[10px] text-white/35">
        Sólo recibe avisos de lo que puede abrir en el sistema.
      </p>
    </div>
  );
}
