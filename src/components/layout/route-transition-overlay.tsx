"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CubeLoader } from "@/components/ui/cube-loader";

const EVENTO_NAVEGANDO    = "cavala:navegando";
const EVENTO_LOADING_START = "cavala:loading-start";
const EVENTO_LOADING_END   = "cavala:loading-end";
const LIMITE_MS = 8000;
// Las rutas que salen del Router Cache no necesitan un destello de carga. El
// indicador aparece sólo si la navegación realmente tarda más que este umbral.
const RETRASO_OVERLAY_MS = 120;
// Tiempo que el overlay espera (tras el cambio de URL) antes de ocultarse, por
// si loading.tsx va a montar su propio cubo justo después.
const RETRASO_OCULTAR_MS = 80;

/**
 * `loading.tsx` (Suspense de Next) sólo se dispara cuando React decide
 * mostrar el fallback — con el Router Cache del cliente, una ruta ya
 * visitada navega "instantánea" y ese fallback nunca llega a pintarse, así
 * que el usuario ve la app congelada un momento y luego salta a la página
 * nueva sin ningún aviso. Este overlay no depende de eso: se activa desde el
 * clic, aparece sólo si la transición supera el umbral y se oculta cuando la
 * URL completa ya cambió.
 *
 * Para una navegación disparada sin `<a href>` (p. ej. `router.push` en el
 * `onClick` de una fila de tabla), llama a `marcarNavegando()` a mano antes
 * de navegar.
 */
export function marcarNavegando() {
  window.dispatchEvent(new Event(EVENTO_NAVEGANDO));
}

export function RouteTransitionOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, setPendiente] = useState(false);
  const navegacionIniciada = useRef(false);
  const temporizadorMostrar = useRef<number | null>(null);
  const temporizadorOcultar = useRef<number | null>(null);
  const loadingActivo = useRef(false);
  const rutaActual = `${pathname}?${searchParams.toString()}`;

  function ocultar() {
    setPendiente(false);
    navegacionIniciada.current = false;
  }

  // La URL ya cambió. No nos ocultamos inmediatamente: le damos RETRASO_OCULTAR_MS
  // para que loading.tsx pueda montar su CubeLoader. Si lo hace, el listener de
  // EVENTO_LOADING_END toma el control; si no (ruta rápida/cacheada), ocultamos aquí.
  useEffect(() => {
    if (!navegacionIniciada.current) return;
    if (temporizadorMostrar.current !== null) {
      window.clearTimeout(temporizadorMostrar.current);
      temporizadorMostrar.current = null;
    }
    temporizadorOcultar.current = window.setTimeout(() => {
      temporizadorOcultar.current = null;
      if (!loadingActivo.current) ocultar();
    }, RETRASO_OCULTAR_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutaActual]);

  // Cuando CubeLoader (loading.tsx) monta, cancela el timer de ocultado y
  // mantiene el overlay. Cuando desmonta, el overlay ya puede ocultarse.
  useEffect(() => {
    function onLoadingStart() {
      loadingActivo.current = true;
      if (temporizadorOcultar.current !== null) {
        window.clearTimeout(temporizadorOcultar.current);
        temporizadorOcultar.current = null;
      }
    }
    function onLoadingEnd() {
      loadingActivo.current = false;
      if (navegacionIniciada.current) ocultar();
    }
    window.addEventListener(EVENTO_LOADING_START, onLoadingStart);
    window.addEventListener(EVENTO_LOADING_END, onLoadingEnd);
    return () => {
      window.removeEventListener(EVENTO_LOADING_START, onLoadingStart);
      window.removeEventListener(EVENTO_LOADING_END, onLoadingEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function activar() {
      if (navegacionIniciada.current) return;
      navegacionIniciada.current = true;
      temporizadorMostrar.current = window.setTimeout(() => {
        temporizadorMostrar.current = null;
        setPendiente(true);
      }, RETRASO_OVERLAY_MS);
    }
    function alClic(event: MouseEvent) {
      // OJO: no filtrar por `event.defaultPrevented` — Next.js SIEMPRE llama
      // preventDefault() en el click de un <Link> para interceptar la
      // navegación nativa y hacerla del lado del cliente. Filtrar por eso
      // descartaba justo los clics que había que detectar. Por eso además se
      // escucha en fase de captura: corre ANTES que el handler del propio
      // <Link>, así ni siquiera depende de ese detalle de implementación.
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const enlace = (event.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!enlace) return;
      if (enlace.target && enlace.target !== "_self") return;
      if (enlace.hasAttribute("download")) return;
      let destino: URL;
      try {
        destino = new URL(enlace.href, window.location.href);
      } catch {
        return;
      }
      if (destino.origin !== window.location.origin) return;
      const mismaRuta = destino.pathname === window.location.pathname && destino.search === window.location.search;
      if (mismaRuta) return;
      activar();
    }
    document.addEventListener("click", alClic, true);
    window.addEventListener(EVENTO_NAVEGANDO, activar);
    return () => {
      document.removeEventListener("click", alClic, true);
      window.removeEventListener(EVENTO_NAVEGANDO, activar);
      if (temporizadorMostrar.current !== null) window.clearTimeout(temporizadorMostrar.current);
      if (temporizadorOcultar.current !== null) window.clearTimeout(temporizadorOcultar.current);
    };
  }, []);

  // Colchón de seguridad: si la navegación se cancela o falla y la URL nunca
  // cambia, el overlay no debe quedar pegado para siempre.
  useEffect(() => {
    if (!pendiente) return;
    const limite = window.setTimeout(() => {
      setPendiente(false);
      navegacionIniciada.current = false;
    }, LIMITE_MS);
    return () => window.clearTimeout(limite);
  }, [pendiente]);

  if (!pendiente) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#05060a]/70 backdrop-blur-sm">
      <CubeLoader />
    </div>
  );
}
