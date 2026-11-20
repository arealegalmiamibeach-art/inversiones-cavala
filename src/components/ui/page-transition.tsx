"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Reemplaza al <main> del layout. Se vuelve a animar en cada cambio de ruta
 * gracias a la key basada en pathname; si la ruta incluye un [id] dinámico el
 * contenido también se anima al pasar de una ficha a otra.
 */
export function PageTransition({ children, className }: { children: ReactNode; className: string }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <motion.main
      key={pathname}
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {children}
    </motion.main>
  );
}
