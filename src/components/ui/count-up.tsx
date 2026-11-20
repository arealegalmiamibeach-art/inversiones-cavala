"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "framer-motion";

interface CountUpProps {
  to: number;
  duration?: number;
}

/**
 * Anima un número desde 0 hasta `to` al montarse.
 * Pensado para ser usado como `value` en StatCard.
 */
export function CountUp({ to, duration = 0.9 }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (reduce) {
      el.textContent = to.toLocaleString("es-PE");
      return;
    }

    const controls = animate(0, to, {
      duration,
      ease: "easeOut",
      onUpdate(value) {
        if (el) el.textContent = Math.round(value).toLocaleString("es-PE");
      },
    });

    return () => controls.stop();
  }, [to, duration, reduce]);

  return <span ref={ref}>{to.toLocaleString("es-PE")}</span>;
}
