"use client";

import { motion } from "framer-motion";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Triángulo sólido de desplegar/contraer (mismo del `SubtaskToggle` de Cerebro):
 * apunta a la derecha cerrado y gira 90° con resorte al abrir. Hereda el color
 * del texto, así que el color y el hover se ponen en `className` o en el botón padre.
 */
export function TrianguloDesplegable({ abierto, className }: { abierto: boolean; className?: string }) {
  return (
    <motion.span
      aria-hidden
      animate={{ rotate: abierto ? 90 : 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={cn("inline-flex shrink-0", className)}
    >
      <Play className="h-3 w-3 fill-current" />
    </motion.span>
  );
}
