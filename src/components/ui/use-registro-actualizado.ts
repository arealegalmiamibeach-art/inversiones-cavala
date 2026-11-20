"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { createClient } from "@/lib/supabase/client";

/** Refresca el panel abierto después de guardar sin desmontar sus editores. */
export function useRegistroActualizado<T extends Record<string, unknown>>(tabla: string, id: string | null, actualizar: Dispatch<SetStateAction<T | null>>) {
  useEffect(() => {
    if (!id) return;
    let vigente = true;
    let turno = 0;
    function recargar() {
      const solicitud = ++turno;
      void createClient().from(tabla).select("*").eq("id", id!).single().then(({ data, error }) => {
        if (vigente && solicitud === turno && !error && data) actualizar(data as T);
      });
    }
    window.addEventListener("registros-actualizados", recargar);
    return () => { vigente = false; window.removeEventListener("registros-actualizados", recargar); };
  }, [tabla, id, actualizar]);
}
