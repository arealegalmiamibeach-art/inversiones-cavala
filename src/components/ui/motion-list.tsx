"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Grid con stagger: cada <MotionItem> aparece desfasado respecto al anterior.
 * El Server Component padre pasa los hijos ya renderizados — este componente
 * sólo aplica la animación de entrada.
 */

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const itemVariantsNormal = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0,  transition: { duration: 0.22, ease: "easeOut" as const } },
};

const itemVariantsReduced = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { duration: 0.18 } },
};

export function MotionList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function MotionItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div variants={reduce ? itemVariantsReduced : itemVariantsNormal} className={className}>
      {children}
    </motion.div>
  );
}
