import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { colorSemaforo, type Arrendamiento, type PersonaArrendamiento } from "@/lib/vehiculos/arrendamientos";

const COLOR_TEXTO: Record<string, string> = {
  rojo: "text-red-300",
  ambar: "text-amber-300",
  neutro: "text-white/70",
};

export function formatFechaArrendamiento(fecha: string | null) {
  return fecha ? new Date(`${fecha}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export function formatMontoArrendamiento(monto: number | null, moneda: string | null) {
  if (!monto) return null;
  const simbolo = moneda === "USD" ? "$ " : "S/ ";
  return `${simbolo}${Number(monto).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
}

/** Partes del contrato como chips con enlace a la ficha del propietario (mismo aspecto que la tabla, más compactas). */
function PersonasChips({ personas, vacio }: { personas: PersonaArrendamiento[]; vacio: string }) {
  if (personas.length === 0) return <span className="text-white/45">{vacio}</span>;
  return (
    <>
      {personas.map((persona) => (
        <Link key={persona.id} href={persona.href} className="glass-chip px-2 py-0.5 text-[11px]">
          {persona.nombre}
        </Link>
      ))}
    </>
  );
}

/** Fila de un contrato de arrendamiento: reutilizada en el panel lateral y en la ficha completa. */
export function ArrendamientoFila({ arrendamiento }: { arrendamiento: Arrendamiento }) {
  const color = colorSemaforo(arrendamiento);
  const monto = formatMontoArrendamiento(arrendamiento.monto, arrendamiento.moneda);
  const dias = arrendamiento.diasRestantes;

  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <Link href={arrendamiento.href} className="min-w-0 truncate text-xs font-medium text-brand-300 hover:text-brand-200">
          {arrendamiento.nombre}
        </Link>
        {monto && <span className="shrink-0 font-mono text-[11px] text-white/60">{monto}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-white/60">
        <PersonasChips personas={arrendamiento.arrendadores} vacio="Arrendador sin dato" />
        <span className="text-white/30">→</span>
        <PersonasChips personas={arrendamiento.arrendatarios} vacio="Arrendatario sin dato" />
      </div>
      <p className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${COLOR_TEXTO[color]}`}>
        {color !== "neutro" && <AlertTriangle className="h-3 w-3 shrink-0" />}
        {formatFechaArrendamiento(arrendamiento.fechaInicio)} — {formatFechaArrendamiento(arrendamiento.fechaFin)}
        {dias !== null && (
          <span className="text-white/45">({dias < 0 ? `vencido hace ${Math.abs(dias)}d` : dias === 0 ? "vence hoy" : `${dias}d`})</span>
        )}
      </p>
    </div>
  );
}

/** Lista de arrendamientos de un vehículo, con estado vacío. */
export function ArrendamientosSection({ arrendamientos }: { arrendamientos: Arrendamiento[] }) {
  if (arrendamientos.length === 0) {
    return <p className="text-xs text-white/50">Sin contratos de arrendamiento</p>;
  }
  return (
    <div className="space-y-2">
      {arrendamientos.map((a) => <ArrendamientoFila key={a.contratoId} arrendamiento={a} />)}
    </div>
  );
}
