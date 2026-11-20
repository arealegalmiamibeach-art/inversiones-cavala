"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Alerta } from "@/lib/alertas";

/**
 * El layout del dashboard (Server Component) arranca la consulta de alertas
 * una sola vez por request y pasa la PROMESA, sin esperarla: antes el layout
 * hacía `await` y ninguna página se pintaba hasta tener las alertas, que sólo
 * usa la campana. `null` mientras no llegan.
 */
const AlertasContext = createContext<Alerta[] | null>(null);

export function AlertasProvider({ alertas, children }: { alertas: Promise<Alerta[]>; children: React.ReactNode }) {
  const [valor, setValor] = useState<Alerta[] | null>(null);
  useEffect(() => {
    let vigente = true;
    alertas.then(
      (lista) => { if (vigente) setValor(lista); },
      () => { if (vigente) setValor([]); }
    );
    return () => { vigente = false; };
  }, [alertas]);
  return <AlertasContext.Provider value={valor}>{children}</AlertasContext.Provider>;
}

/** `null` mientras la consulta del layout sigue en curso. */
export function useAlertas(): Alerta[] | null {
  return useContext(AlertasContext);
}
