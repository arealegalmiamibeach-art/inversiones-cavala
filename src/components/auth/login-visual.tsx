"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";

export function LoginVisualFallback() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden bg-[#020403]"
    >
      <div className="absolute -left-[18%] -top-[28%] h-[82%] w-[82%] rounded-full bg-emerald-500/25 blur-[72px] motion-safe:animate-pulse" />
      <div className="absolute -bottom-[35%] right-[-18%] h-[90%] w-[90%] rounded-full bg-green-800/35 blur-[90px]" />
      <div className="absolute left-[24%] top-[18%] h-[64%] w-[58%] rotate-[-12deg] rounded-[48%_52%_58%_42%] border border-white/[0.08] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_90px_rgba(12,90,45,0.25)] backdrop-blur-2xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_38%,rgba(137,255,177,0.16),transparent_22%),linear-gradient(145deg,rgba(255,255,255,0.025),transparent_45%)]" />
    </div>
  );
}

const LiquidRaymarching = dynamic(
  () => import("@/components/auth/liquid-raymarching"),
  {
    ssr: false,
    loading: LoginVisualFallback,
  },
);

class VisualErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // El arte es decorativo: el formulario debe seguir disponible aunque falle WebGPU.
  }

  render() {
    return this.state.failed ? <LoginVisualFallback /> : this.props.children;
  }
}

export default function LoginVisual() {
  const [efectoActivo, setEfectoActivo] = useState(false);

  useEffect(() => {
    // El raymarching es decorativo y costoso: se reserva para pantallas
    // grandes que no hayan solicitado reducir movimiento.
    const media = window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)");
    const actualizar = () => setEfectoActivo(media.matches);
    actualizar();
    media.addEventListener("change", actualizar);
    return () => media.removeEventListener("change", actualizar);
  }, []);

  if (!efectoActivo) return <LoginVisualFallback />;

  return (
    <VisualErrorBoundary>
      <LiquidRaymarching />
    </VisualErrorBoundary>
  );
}
