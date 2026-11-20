"use client";

import { useEffect } from "react";

// Cubo 3D giratorio para el estado de carga entre navegaciones. Next.js lo
// muestra automáticamente vía `loading.tsx` mientras el siguiente Server
// Component todavía está consultando datos — el layout (sidebar, encabezado)
// permanece montado, sólo el área de contenido cambia. Cubre también el
// paso de una ficha a otra (el mismo mecanismo de `loading.tsx` se dispara
// otra vez porque cambia el parámetro dinámico de la ruta, no sólo al entrar
// desde un listado).

const EVENTO_LOADING_START = "cavala:loading-start";
const EVENTO_LOADING_END   = "cavala:loading-end";

export function CubeLoader({ etiqueta = "Cargando" }: { etiqueta?: string }) {
  // Avisa al RouteTransitionOverlay cuando este fallback monta/desmonta, para
  // que el overlay no se oculte antes de que la página esté lista.
  useEffect(() => {
    window.dispatchEvent(new Event(EVENTO_LOADING_START));
    return () => { window.dispatchEvent(new Event(EVENTO_LOADING_END)); };
  }, []);

  return (
    <div className="perspective-container flex h-full min-h-[50vh] w-full flex-col items-center justify-center gap-10 p-12">
      <div className="preserve-3d relative flex h-24 w-24 items-center justify-center">
        {/* Cubo giratorio */}
        <div className="preserve-3d animate-cube-spin relative h-full w-full">
          {/* Núcleo (fuente de energía) */}
          <div className="animate-pulse-fast absolute inset-0 m-auto h-8 w-8 rounded-full bg-white shadow-[0_0_40px_rgba(255,255,255,0.8)] blur-md" />

          {/* Caras del cubo — cada `side-wrapper` fija la orientación, cada
              `face` interna hace la respiración (expansión/contracción). */}
          <div className="side-wrapper front">
            <div className="face border-2 border-cyan-400 bg-cyan-500/10 shadow-[0_0_15px_rgba(34,211,238,0.4)]" />
          </div>
          <div className="side-wrapper back">
            <div className="face border-2 border-cyan-400 bg-cyan-500/10 shadow-[0_0_15px_rgba(34,211,238,0.4)]" />
          </div>
          <div className="side-wrapper right">
            <div className="face border-2 border-purple-400 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.4)]" />
          </div>
          <div className="side-wrapper left">
            <div className="face border-2 border-purple-400 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.4)]" />
          </div>
          <div className="side-wrapper top">
            <div className="face border-2 border-indigo-400 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.4)]" />
          </div>
          <div className="side-wrapper bottom">
            <div className="face border-2 border-indigo-400 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.4)]" />
          </div>
        </div>

        {/* Sombra en el piso, respira junto con las caras */}
        <div className="animate-shadow-breathe absolute -bottom-20 h-8 w-24 rounded-[100%] bg-black/40 blur-xl" />
      </div>

      <div className="mt-2 flex flex-col items-center gap-1">
        <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">{etiqueta}</h3>
        <p className="text-xs text-white/40">Preparando la información…</p>
      </div>

      <style jsx>{`
        .perspective-container {
          perspective: 1200px;
        }
        .preserve-3d {
          transform-style: preserve-3d;
        }

        /* Gira todo el conjunto sobre los ejes X e Y. */
        @keyframes cubeSpin {
          0% { transform: rotateX(0deg) rotateY(0deg); }
          100% { transform: rotateX(360deg) rotateY(360deg); }
        }

        /* Empuja la cara hacia afuera (translateZ) y de vuelta. Como el
           padre (.side-wrapper) ya está rotado, Z siempre apunta "hacia
           afuera" respecto de esa cara. 48px = mitad de w-24 (96px). */
        @keyframes breathe {
          0%, 100% { transform: translateZ(48px); opacity: 0.8; }
          50% { transform: translateZ(80px); opacity: 0.4; border-color: rgba(255,255,255,0.8); }
        }

        @keyframes pulseFast {
          0%, 100% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1.2); opacity: 1; }
        }

        @keyframes shadowBreathe {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.5); opacity: 0.2; }
        }

        .animate-cube-spin {
          animation: cubeSpin 8s linear infinite;
        }
        .animate-pulse-fast {
          animation: pulseFast 2s ease-in-out infinite;
        }
        .animate-shadow-breathe {
          animation: shadowBreathe 3s ease-in-out infinite;
        }

        .side-wrapper {
          position: absolute;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          transform-style: preserve-3d;
        }
        .face {
          width: 100%;
          height: 100%;
          position: absolute;
          animation: breathe 3s ease-in-out infinite;
          backdrop-filter: blur(2px);
        }

        .front  { transform: rotateY(0deg); }
        .back   { transform: rotateY(180deg); }
        .right  { transform: rotateY(90deg); }
        .left   { transform: rotateY(-90deg); }
        .top    { transform: rotateX(90deg); }
        .bottom { transform: rotateX(-90deg); }

        @media (prefers-reduced-motion: reduce) {
          .animate-cube-spin, .face, .animate-pulse-fast, .animate-shadow-breathe {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
