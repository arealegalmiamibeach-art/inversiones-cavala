"use client";

import React, { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

interface EffectRendererProps {
  text: string;
  isActive: boolean;
  allowDelete?: boolean;
  typeDurationMs: number;
  deleteDurationMs: number;
  pauseAfterTypeMs: number;
  prefersReducedMotion?: boolean;
  onDeleteComplete?: () => void;
  containerRef?: RefObject<HTMLElement | null>;
}

type BuiltinEffect = "typewriter" | "slide" | "fade" | "none";

const TypewriterEffect: React.FC<EffectRendererProps> = ({
  text, isActive, allowDelete = true, typeDurationMs, deleteDurationMs, pauseAfterTypeMs,
  prefersReducedMotion, onDeleteComplete, containerRef,
}) => {
  const [phase, setPhase] = useState<"typing" | "paused" | "deleting">("typing");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setPhase("typing");
    timers.current.forEach(clearTimeout);
    timers.current = [];
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [text, isActive, allowDelete]);

  useEffect(() => {
    if (!isActive) { setPhase("typing"); timers.current.forEach(clearTimeout); timers.current = []; }
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !prefersReducedMotion || !allowDelete) return;
    const t = setTimeout(() => onDeleteComplete?.(), Math.max(200, pauseAfterTypeMs));
    timers.current.push(t);
    return () => timers.current.forEach(clearTimeout);
  }, [isActive, prefersReducedMotion, allowDelete, pauseAfterTypeMs, onDeleteComplete]);

  if (!isActive) return null;

  return (
    <div ref={containerRef as RefObject<HTMLDivElement> | undefined} style={{ display: "inline-block", overflow: "hidden", whiteSpace: "nowrap", alignItems: "center" }}>
      {prefersReducedMotion ? (
        <span className="text-sm text-neutral-400 select-none">{text}</span>
      ) : (
        <motion.div
          key={text}
          initial={{ width: "0%" }}
          animate={phase === "deleting" ? { width: "0%" } : { width: "100%" }}
          transition={phase === "typing" ? { duration: typeDurationMs / 1000, ease: "linear" } : phase === "deleting" ? { duration: deleteDurationMs / 1000, ease: "linear" } : {}}
          onAnimationComplete={() => {
            if (phase === "typing") {
              setPhase("paused");
              if (allowDelete) { const t = setTimeout(() => setPhase("deleting"), pauseAfterTypeMs); timers.current.push(t); }
            } else if (phase === "deleting") { onDeleteComplete?.(); }
          }}
          style={{ display: "inline-flex", alignItems: "center", overflow: "hidden", whiteSpace: "nowrap" }}
        >
          <span className="text-sm text-neutral-400 select-none">{text}</span>
          <motion.span
            aria-hidden
            style={{ display: "inline-block", width: 1, marginLeft: 2, height: "1em", verticalAlign: "middle" }}
            className="bg-neutral-300"
            animate={phase === "typing" || phase === "paused" ? { opacity: [0, 1, 0] } : { opacity: 0 }}
            transition={phase === "typing" || phase === "paused" ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.1 }}
          />
        </motion.div>
      )}
    </div>
  );
};

export interface SuggestiveSearchProps {
  value?: string;
  onChange?: (val: string) => void;
  onFocusChange?: (focused: boolean) => void;
  suggestions?: string[];
  className?: string;
  effect?: BuiltinEffect;
  typeDurationMs?: number;
  deleteDurationMs?: number;
  pauseAfterTypeMs?: number;
  animateMode?: "infinite" | "once";
}

export default function SuggestiveSearch({
  value: controlledValue,
  onChange,
  onFocusChange,
  suggestions = ["Buscar expediente…", "Buscar por asunto…"],
  className,
  effect = "typewriter",
  typeDurationMs = 500,
  deleteDurationMs = 300,
  pauseAfterTypeMs = 1500,
  animateMode = "infinite",
}: SuggestiveSearchProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const search = controlledValue ?? internalSearch;
  const [isFocused, setIsFocused] = useState(false);
  const [index, setIndex] = useState(0);
  const [prefersReduced, setPrefersReduced] = useState(false);
  const current = useMemo(() => suggestions[index] ?? "", [suggestions, index]);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const actualizar = () => setPrefersReduced(media.matches);
    actualizar();
    media.addEventListener("change", actualizar);
    return () => media.removeEventListener("change", actualizar);
  }, []);

  const handleChange = (val: string) => {
    if (controlledValue === undefined) setInternalSearch(val);
    onChange?.(val);
  };

  const handleFocus = () => {
    setIsFocused(true);
    onFocusChange?.(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    onFocusChange?.(false);
  };

  const overlayActive = !search && !isFocused;
  const isLast = index === suggestions.length - 1;
  const allowDelete = animateMode === "infinite" ? true : !isLast;

  const ChosenEffect = effect === "typewriter" ? TypewriterEffect : () => null;

  return (
    <div
      className={cn(
        "relative flex items-center gap-x-2 h-8 px-4 rounded-full",
        "bg-[#eeeadf] text-black",
        className,
      )}
    >
      <Search className="size-4 text-neutral-400 shrink-0 stroke-[1.5]" />

      <input
        ref={inputRef}
        type="text"
        value={search}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={(e) => handleChange(e.target.value)}
        maxLength={120}
        className="bg-transparent outline-none text-sm text-neutral-900 w-full placeholder:text-transparent"
        placeholder=""
        aria-label="Buscar registros"
      />

      {overlayActive && (
        <div
          ref={overlayRef}
          aria-hidden
          className="absolute inset-y-0 flex items-center pointer-events-none overflow-hidden whitespace-nowrap"
          style={{ left: "calc(1rem + 1rem + 8px)", right: "1rem" }}
        >
          <ChosenEffect
            text={current}
            isActive={overlayActive}
            allowDelete={allowDelete}
            typeDurationMs={typeDurationMs}
            deleteDurationMs={deleteDurationMs}
            pauseAfterTypeMs={pauseAfterTypeMs}
            prefersReducedMotion={prefersReduced}
            onDeleteComplete={() => setIndex((i) => suggestions.length > 0 ? (i + 1) % suggestions.length : 0)}
            containerRef={overlayRef}
          />
        </div>
      )}
    </div>
  );
}
