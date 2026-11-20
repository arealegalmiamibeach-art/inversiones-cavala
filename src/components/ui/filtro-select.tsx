"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";

export function FiltroSelect({
  param,
  actual,
  opciones,
}: {
  param: string;
  actual: string;
  opciones: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  function aplicar(valor: string) {
    // Se conservan el resto de parámetros para poder combinar varios filtros con la búsqueda.
    const params = new URLSearchParams(window.location.search);
    if (valor) params.set(param, valor);
    else params.delete(param);
    params.delete("pagina");
    const query = params.toString();
    iniciar(() => router.replace(`${window.location.pathname}${query ? `?${query}` : ""}`));
  }

  return (
    <div className="relative min-w-0 flex-1 sm:flex-none">
      <ListFilter
        className={cn(
          "pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 transition-colors",
          actual ? "text-brand-300" : "text-white/35",
          pendiente && "animate-pulse"
        )}
      />
      <select
        key={actual} // Se resincroniza cuando el servidor responde, sin parpadear mientras navega.
        name={param}
        defaultValue={actual}
        onChange={(event) => aplicar(event.target.value)}
        className={cn(
          "glass-input w-full cursor-pointer py-2 pl-8 text-xs [color-scheme:dark] sm:py-1.5",
          actual && "border-brand-400/35 text-brand-100"
        )}
      >
        {opciones.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#0b0d16] text-white">{o.label}</option>
        ))}
      </select>
    </div>
  );
}
