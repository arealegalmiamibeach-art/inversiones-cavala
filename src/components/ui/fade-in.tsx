"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Envuelve cualquier bloque con un fade + slide suave al montar.
 * Úsalo en los async Server Components del dashboard para que el contenido
 * aparezca con gracia al reemplazar el skeleton de Suspense.
 */
export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
