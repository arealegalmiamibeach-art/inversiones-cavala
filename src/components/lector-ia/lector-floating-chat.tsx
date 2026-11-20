"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { LectorIaClient } from "@/app/(dashboard)/lector-ia/lector-ia-client";
import type { LectorAccessState, LectorStoredFile } from "@/lib/lector-ia/types";

export function LectorFloatingChat({
  access,
  storedFiles,
}: {
  access: LectorAccessState;
  storedFiles: LectorStoredFile[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const onLectorPage = pathname.startsWith("/lector-ia");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (onLectorPage) return null;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            key="chat-backdrop"
            type="button"
            aria-label="Cerrar chat"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="fixed inset-0 z-[74] bg-black/55 backdrop-blur-[2px] sm:hidden"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section
            key="chat-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Cavala Lector IA"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
            transition={reduceMotion
              ? { duration: 0.01 }
              : { type: "spring", stiffness: 390, damping: 34, mass: 0.85 }}
            style={{ transformOrigin: "bottom right" }}
            className="fixed inset-x-2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] top-2 z-[80] flex overflow-hidden rounded-2xl border border-white/[0.12] bg-black/95 shadow-[0_24px_90px_rgba(0,0,0,.72)] backdrop-blur-2xl sm:inset-auto sm:top-auto sm:bottom-4 sm:right-4 sm:h-[min(760px,calc(100dvh-2rem))] sm:w-[min(420px,calc(100vw-2rem))]"
          >
            <LectorIaClient
              access={access}
              storedFiles={storedFiles}
              compact
              onClose={() => setOpen(false)}
            />
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!open && (
          <motion.button
            key="chat-launcher"
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir Cavala Lector IA"
            title="Abrir Lector IA"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.75, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.82, y: 5 }}
            whileHover={reduceMotion ? undefined : { scale: 1.07, y: -3 }}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            transition={reduceMotion
              ? { duration: 0.01 }
              : { type: "spring", stiffness: 430, damping: 27 }}
            className="group fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-[72] flex h-12 w-12 items-center justify-center rounded-full p-px text-white shadow-[0_12px_36px_rgba(0,0,0,.48),0_0_24px_rgba(139,92,246,.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black lg:bottom-6"
          >
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-[conic-gradient(from_210deg,rgba(255,255,255,.28),rgba(139,92,246,.78),rgba(34,211,238,.52),rgba(255,255,255,.18))] opacity-65 transition-opacity duration-300 group-hover:opacity-100"
              animate={reduceMotion ? undefined : { rotate: 360 }}
              transition={{ duration: 12, ease: "linear", repeat: Infinity }}
            />
            <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_32%_20%,#29233a_0%,#17151e_48%,#0d0d11_100%)]">
              <span aria-hidden="true" className="absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              <motion.span
                className="relative flex items-center justify-center"
                animate={reduceMotion ? undefined : { y: [0, -1.25, 0], rotate: [0, -2, 0] }}
                transition={{ duration: 3.2, ease: "easeInOut", repeat: Infinity }}
              >
                <MessageSquare className="h-[18px] w-[18px] stroke-[1.8] text-white/90 transition-colors duration-300 group-hover:text-white" />
                <Sparkles className="absolute -right-2 -top-2 h-2.5 w-2.5 text-violet-300 transition-transform duration-300 group-hover:scale-125 group-hover:text-cyan-200" />
              </motion.span>
              <motion.span
                aria-hidden="true"
                className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_7px_rgba(110,231,183,.9)]"
                animate={reduceMotion ? undefined : { opacity: [0.65, 1, 0.65], scale: [0.9, 1.15, 0.9] }}
                transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
              />
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
