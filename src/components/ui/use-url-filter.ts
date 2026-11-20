"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Mantiene los filtros en la URL sin volver a pedir al servidor una tabla que
 * ya está completa en memoria. `replaceState` también se integra con los hooks
 * de navegación de Next, pero evita una recarga RSC por cada tecla o selector.
 */
export function useUrlFilter() {
  const temporizadores = useRef(new Map<string, number>());

  useEffect(() => () => {
    temporizadores.current.forEach((id) => window.clearTimeout(id));
    temporizadores.current.clear();
  }, []);

  const update = useCallback((name: string, value: string, debounceMs = 0) => {
    const anterior = temporizadores.current.get(name);
    if (anterior !== undefined) window.clearTimeout(anterior);

    const navegar = () => {
      temporizadores.current.delete(name);
      const params = new URLSearchParams(window.location.search);
      if (value) params.set(name, value);
      else params.delete(name);
      params.delete("pagina");

      const query = params.toString();
      const href = `${window.location.pathname}${query ? `?${query}` : ""}`;
      window.history.replaceState(window.history.state, "", href);
    };

    if (debounceMs > 0) {
      temporizadores.current.set(name, window.setTimeout(navegar, debounceMs));
    } else {
      navegar();
    }
  }, []);

  return { pending: false, update };
}
