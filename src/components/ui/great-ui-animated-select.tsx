"use client";

import React, { useState, useEffect, useId, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const ChevronIcon = ({
  isOpen,
  isDarkMode,
}: {
  isOpen: boolean;
  isDarkMode: boolean;
}) => (
  <motion.svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    animate={{ rotate: isOpen ? 180 : 0 }}
    transition={{ type: "spring", stiffness: 260, damping: 22 }}
    className={cn(
      "h-4 w-4 transition-colors duration-300",
      isDarkMode ? "text-neutral-400" : "text-neutral-500",
    )}
  >
    <path d="M6 9l6 6 6-6" />
  </motion.svg>
);

export interface DropdownOption {
  id: string;
  label: string;
  icon: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
  danger?: boolean;
}

export interface AnimatedSelectProps {
  placeholder?: string;
  options?: DropdownOption[];
  className?: string;
  width?: number;
  itemHeight?: number;
  itemGap?: number;
  triggerHeight?: number;
  onSelect?: (option: DropdownOption) => void;
  value?: string | null;
}

export default function AnimatedSelect({
  placeholder = "Select Action",
  options = [],
  className,
  width = 192,
  itemHeight = 40,
  itemGap = 4,
  triggerHeight = 44,
  onSelect,
  value,
}: AnimatedSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<DropdownOption | null>(null);
  const [menuWidth, setMenuWidth] = useState(width);
  const [menuOffset, setMenuOffset] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const isDarkMode = false;

  useEffect(() => {
    if (value !== undefined) {
      const match = options.find((o) => o.id === value);
      setSelected(match ?? null);
    }
  }, [value, options]);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;

    context.font = "600 13px ui-sans-serif, system-ui, sans-serif";
    const widestLabel = options.reduce((widest, option) => {
      const textWidth = context.measureText(option.label).width + option.label.length * 0.35;
      return Math.max(widest, textWidth);
    }, 0);
    const availableWidth = Math.max(width, Math.min(560, window.innerWidth - 32));
    setMenuWidth(Math.max(width, Math.min(availableWidth, Math.ceil(widestLabel + 64))));
  }, [options, width]);

  useEffect(() => {
    if (!isOpen) {
      setMenuOffset(0);
      return;
    }

    function positionMenu() {
      const bounds = rootRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const viewportPadding = 16;
      const maximumLeft = Math.max(viewportPadding, window.innerWidth - viewportPadding - menuWidth);
      const menuLeft = Math.min(Math.max(bounds.left, viewportPadding), maximumLeft);
      setMenuOffset(Math.round(menuLeft - bounds.left));
    }

    positionMenu();
    window.addEventListener("resize", positionMenu);
    return () => window.removeEventListener("resize", positionMenu);
  }, [isOpen, menuWidth]);

  useEffect(() => {
    if (!isOpen) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("[data-animated-select]")) return;
      setIsOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [isOpen]);

  const resolvedDarkMode = isDarkMode;
  const toggle = () => setIsOpen(!isOpen);

  const enfocarOpcion = (indice: number) => {
    if (options.length === 0) return;
    const normalizado = (indice + options.length) % options.length;
    requestAnimationFrame(() => optionRefs.current[normalizado]?.focus());
  };

  const handleSelect = (opt: DropdownOption) => {
    setSelected(opt);
    setIsOpen(false);
    onSelect?.(opt);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div
      ref={rootRef}
      data-animated-select
      className={cn("relative flex flex-col items-center select-none", className)}
      style={{ width }}
    >
      <motion.div
        className={cn(
          "absolute left-0 z-0 rounded-b-xl border-x border-b transition-colors duration-300",
          resolvedDarkMode
            ? "border-white/[0.1] bg-[#151720] shadow-2xl"
            : "border-[#d9d4c8] bg-[#eeeadf] shadow-sm",
        )}
        // Además de dibujar el panel, esta superficie mantiene el puntero dentro
        // del selector al cruzar los espacios entre opciones. Sin ella, el
        // toolbar padre recibe mouseleave y desmonta todos los filtros.
        style={{
          top: triggerHeight,
          left: menuOffset,
          width: menuWidth,
          pointerEvents: isOpen ? "auto" : "none",
        }}
        initial={false}
        animate={{
          height: isOpen ? (itemHeight + itemGap) * options.length + itemGap : 0,
          opacity: isOpen ? 1 : 0,
        }}
        transition={{ type: "spring", stiffness: 220, damping: 28 }}
      />

      <div className="relative z-10 flex w-full flex-col items-center">
        <motion.button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={menuId}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setIsOpen(true);
              enfocarOpcion(event.key === "ArrowUp" ? options.length - 1 : 0);
            }
          }}
          style={{ width, height: triggerHeight }}
          className={cn(
            "relative z-10 flex cursor-pointer items-center justify-between px-4 text-[13px] font-semibold tracking-wide transition-all duration-200 active:scale-95",
            isOpen ? "rounded-t-xl rounded-b-none border border-neutral-200" : "rounded-full",
            resolvedDarkMode
              ? "border-white/[0.1] bg-[#151720] text-white/90 hover:bg-white/[0.06]"
              : "bg-[#eeeadf] text-neutral-800 hover:bg-[#e5e0d4]",
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                <selected.icon className={cn("h-4 w-4 shrink-0", resolvedDarkMode ? "text-white/50" : "text-neutral-500")} />
                <span>{selected.label}</span>
              </>
            ) : (
              <span className={cn("font-medium", resolvedDarkMode ? "text-white/40" : "text-neutral-400")}>
                {placeholder}
              </span>
            )}
          </span>
          <ChevronIcon isOpen={isOpen} isDarkMode={resolvedDarkMode} />
        </motion.button>

        <div id={menuId} role="menu" aria-label={placeholder} aria-hidden={!isOpen} className="absolute inset-x-0 top-0 z-20">
          {options.map((opt, i) => {
            const yPos = triggerHeight + itemGap + i * (itemHeight + itemGap);
            return (
              <motion.button
                ref={(element) => { optionRefs.current[i] = element; }}
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected?.id === opt.id}
                tabIndex={isOpen ? 0 : -1}
                onClick={() => handleSelect(opt)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    enfocarOpcion(i + 1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    enfocarOpcion(i - 1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    enfocarOpcion(0);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    enfocarOpcion(options.length - 1);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setIsOpen(false);
                    triggerRef.current?.focus();
                  } else if (event.key === "Tab") {
                    setIsOpen(false);
                  }
                }}
                initial={false}
                animate={{
                  y: isOpen ? yPos : 0,
                  scale: isOpen ? 1 : 0.8,
                  opacity: isOpen ? 1 : 0,
                }}
                transition={{
                  type: "spring",
                  stiffness: 220,
                  damping: 26,
                  delay: isOpen ? i * 0.045 : (options.length - 1 - i) * 0.02,
                }}
                style={{
                  left: menuOffset + 4,
                  height: itemHeight,
                  width: menuWidth - 8,
                  pointerEvents: isOpen ? "auto" : "none",
                }}
                className={cn(
                  "absolute top-0 flex cursor-pointer items-center gap-3 overflow-hidden rounded-xl bg-transparent px-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/50 active:scale-95",
                  resolvedDarkMode
                    ? opt.danger
                      ? "text-red-400 hover:bg-red-950/40 hover:text-red-300"
                      : "text-white/80 hover:bg-white/[0.08]"
                    : opt.danger
                      ? "text-red-500 hover:bg-red-50 hover:text-red-600"
                      : "text-neutral-800 hover:bg-[#e5e0d4]",
                )}
              >
                <span aria-hidden="true"><opt.icon className="h-4 w-4 shrink-0" /></span>
                <span className="whitespace-nowrap text-[13px] font-semibold tracking-wide" title={opt.label}>
                  {opt.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
