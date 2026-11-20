"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAcceso } from "@/lib/auth/rol-context";
import { puedeEscribir } from "@/lib/auth/roles";
import { eliminarPropiedadNativa, restaurarPropiedadNativa } from "@/lib/actions/propiedades-nativas";
import type { PropiedadesNativasEliminadas } from "@/lib/propiedades-nativas";

type Contexto = {
  eliminadas: PropiedadesNativasEliminadas;
  marcar: (entidadTipo: string, campo: string, eliminada: boolean) => void;
};

const PropiedadesEliminadasContext = createContext<Contexto | null>(null);
const NINGUNA: ReadonlySet<string> = new Set();

/**
 * El layout del dashboard (Server Component) lee `propiedades_nativas_eliminadas`
 * una vez por request y la deja acá, para que cada ficha y cada tabla sepa qué
 * propiedades esconder desde el primer render (sin parpadeo ni consulta propia).
 * Al eliminar o restaurar se actualiza al instante y el servidor confirma con
 * el refresco de la ruta.
 */
export function PropiedadesEliminadasProvider({
  inicial,
  children,
}: {
  inicial: PropiedadesNativasEliminadas;
  children: React.ReactNode;
}) {
  const [eliminadas, setEliminadas] = useState(inicial);
  const firma = JSON.stringify(inicial);
  const [firmaPrevia, setFirmaPrevia] = useState(firma);
  // Un refresco de la ruta trae la lista vigente del servidor y manda sobre lo local.
  if (firma !== firmaPrevia) {
    setFirmaPrevia(firma);
    setEliminadas(inicial);
  }

  const marcar = useCallback((entidadTipo: string, campo: string, eliminada: boolean) => {
    setEliminadas((actual) => {
      const campos = (actual[entidadTipo] ?? []).filter((item) => item !== campo);
      return { ...actual, [entidadTipo]: eliminada ? [...campos, campo] : campos };
    });
  }, []);

  const valor = useMemo(() => ({ eliminadas, marcar }), [eliminadas, marcar]);
  return <PropiedadesEliminadasContext.Provider value={valor}>{children}</PropiedadesEliminadasContext.Provider>;
}

type Resultado = { ok: true } | { ok: false; error: string };

/**
 * Propiedades nativas eliminadas de un tipo de entidad, y cómo quitarlas o
 * devolverlas. `puedeAdministrar` sigue el permiso de escritura del área.
 */
export function usePropiedadesEliminadas(entidadTipo?: string) {
  const router = useRouter();
  const contexto = useContext(PropiedadesEliminadasContext);
  const acceso = useAcceso(entidadTipo);
  const marcar = contexto?.marcar;
  const lista = entidadTipo ? contexto?.eliminadas[entidadTipo] : undefined;

  const eliminadas = useMemo<ReadonlySet<string>>(() => (lista?.length ? new Set(lista) : NINGUNA), [lista]);

  const cambiar = useCallback(async (campo: string, eliminar: boolean): Promise<Resultado> => {
    if (!entidadTipo || !marcar) return { ok: false, error: "Esta propiedad no se puede eliminar" };
    const resultado = eliminar
      ? await eliminarPropiedadNativa(entidadTipo, campo)
      : await restaurarPropiedadNativa(entidadTipo, campo);
    if (!resultado.ok) return resultado;
    marcar(entidadTipo, campo, eliminar);
    router.refresh();
    return resultado;
  }, [entidadTipo, marcar, router]);

  const eliminar = useCallback((campo: string) => cambiar(campo, true), [cambiar]);
  const restaurar = useCallback((campo: string) => cambiar(campo, false), [cambiar]);

  return {
    eliminadas,
    eliminar,
    restaurar,
    puedeAdministrar: Boolean(entidadTipo && contexto) && puedeEscribir(acceso),
  };
}
