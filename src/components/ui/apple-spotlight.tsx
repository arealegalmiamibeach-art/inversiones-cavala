"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Search } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

const SVGFilter = () => (
  <svg width="0" height="0">
    <filter id="blob">
      <feGaussianBlur stdDeviation="10" in="SourceGraphic" />
      <feColorMatrix
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -9"
        result="blob"
      />
      <feBlend in="SourceGraphic" in2="blob" />
    </filter>
  </svg>
);

interface ShortcutButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
}

function ShortcutButton({ icon, onClick }: ShortcutButtonProps) {
  return (
    <button type="button" onClick={onClick} className="rounded-full cursor-pointer hover:shadow-lg hover:shadow-white/5 opacity-40 hover:opacity-100 transition-[opacity,shadow] duration-200">
      <div className="size-14 aspect-square flex items-center justify-center">{icon}</div>
    </button>
  );
}

function SpotlightPlaceholder({ text, className }: { text: string; className?: string }) {
  return (
    <motion.div layout className={cn("absolute text-white/40 flex items-center pointer-events-none z-10", className)}>
      <AnimatePresence mode="popLayout">
        <motion.p
          layoutId={`placeholder-${text}`}
          key={`placeholder-${text}`}
          initial={{ opacity: 0, y: 10, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, filter: "blur(5px)" }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {text}
        </motion.p>
      </AnimatePresence>
    </motion.div>
  );
}

function SpotlightInput({
  placeholder,
  hidePlaceholder,
  value,
  onChange,
  placeholderClassName,
}: {
  placeholder: string;
  hidePlaceholder: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholderClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div className="flex items-center w-full justify-start gap-3 px-6 h-14">
      <motion.div layoutId="search-icon">
        <Search className="size-5 text-white/50" />
      </motion.div>
      <div className="flex-1 relative text-xl">
        {!hidePlaceholder && <SpotlightPlaceholder text={placeholder} className={placeholderClassName} />}
        <motion.input
          ref={inputRef}
          layout="position"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-white outline-none"
        />
      </div>
    </div>
  );
}

export interface SpotlightResult {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}

export interface SpotlightShortcut {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

function SearchResultCard({ icon, label, description, isLast }: SpotlightResult & { isLast: boolean }) {
  return (
    <div className={cn(
      "flex items-center text-white justify-start hover:bg-white/10 gap-3 py-2.5 px-3 rounded-xl w-full cursor-pointer transition-colors",
      isLast && "rounded-b-2xl"
    )}>
      <div className="size-8 [&_svg]:stroke-[1.5] [&_svg]:size-5 aspect-square flex items-center justify-center text-white/60">
        {icon}
      </div>
      <div className="flex flex-col min-w-0">
        <p className="font-medium text-sm truncate">{label}</p>
        <p className="text-xs text-white/40 truncate">{description}</p>
      </div>
      <div className="flex-1 flex items-center justify-end opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">
        <ChevronRight className="size-4 text-white/30" />
      </div>
    </div>
  );
}

function SearchResultsContainer({
  results,
  onHover,
  onSelect,
}: {
  results: SpotlightResult[];
  onHover: (i: number | null) => void;
  onSelect: (r: SpotlightResult) => void;
}) {
  return (
    <motion.div
      layout
      onMouseLeave={() => onHover(null)}
      className="px-2 border-t border-white/10 flex flex-col bg-[#111318]/80 max-h-80 overflow-y-auto w-full py-2"
    >
      {results.map((result, index) => (
        <motion.div
          key={result.id}
          onMouseEnter={() => onHover(index)}
          onClick={() => onSelect(result)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ delay: index * 0.06, duration: 0.2, ease: "easeOut" }}
          className="group/card"
        >
          <SearchResultCard {...result} isLast={index === results.length - 1} />
        </motion.div>
      ))}
    </motion.div>
  );
}

export interface AppleSpotlightProps {
  isOpen: boolean;
  onClose: () => void;
  items: SpotlightResult[];
  shortcuts?: SpotlightShortcut[];
  onSelect: (item: SpotlightResult) => void;
  placeholder?: string;
  filterFn?: (item: SpotlightResult, query: string) => boolean;
}

export default function AppleSpotlight({
  isOpen,
  onClose,
  items,
  shortcuts = [],
  onSelect,
  placeholder = "Buscar…",
  filterFn,
}: AppleSpotlightProps) {
  const [hovered, setHovered] = useState(false);
  const [hoveredSearchResult, setHoveredSearchResult] = useState<number | null>(null);
  const [hoveredShortcut, setHoveredShortcut] = useState<number | null>(null);
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    if (!isOpen) setSearchValue("");
  }, [isOpen]);

  const filteredResults = searchValue.trim()
    ? items.filter((item) =>
        filterFn
          ? filterFn(item, searchValue)
          : `${item.label} ${item.description}`.toLocaleLowerCase("es-PE").includes(searchValue.toLocaleLowerCase("es-PE"))
      )
    : [];

  function handleSelect(result: SpotlightResult) {
    onSelect(result);
    onClose();
  }

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, filter: "blur(20px) url(#blob)", scaleX: 1.3, scaleY: 1.1, y: -10 }}
          animate={{ opacity: 1, filter: "blur(0px) url(#blob)", scaleX: 1, scaleY: 1, y: 0 }}
          exit={{ opacity: 0, filter: "blur(20px) url(#blob)", scaleX: 1.3, scaleY: 1.1, y: 10 }}
          transition={{ stiffness: 550, damping: 50, type: "spring" }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <SVGFilter />
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); setHoveredShortcut(null); }}
            onClick={(e) => e.stopPropagation()}
            style={{ filter: "url(#blob)" }}
            className={cn(
              "w-full flex items-center justify-end gap-4 z-20 group",
              "[&>div]:bg-[#151720] [&>div]:text-white [&>div]:rounded-full [&>div]:backdrop-blur-xl [&>div]:border [&>div]:border-white/10",
              "[&_svg]:size-6 [&_svg]:stroke-[1.4]",
              "max-w-2xl px-4"
            )}
          >
            <AnimatePresence mode="popLayout">
              <motion.div
                layoutId="search-input-container"
                transition={{ layout: { duration: 0.5, type: "spring", bounce: 0.2 } }}
                style={{ borderRadius: "24px" }}
                className="h-full w-full flex flex-col items-center justify-start z-10 relative shadow-2xl overflow-hidden"
              >
                <SpotlightInput
                  placeholder={
                    hoveredShortcut !== null && shortcuts[hoveredShortcut]
                      ? shortcuts[hoveredShortcut].label
                      : hoveredSearchResult !== null && filteredResults[hoveredSearchResult]
                        ? filteredResults[hoveredSearchResult].label
                        : placeholder
                  }
                  placeholderClassName={hoveredSearchResult !== null ? "text-white bg-white/5 rounded px-1" : "text-white/40"}
                  hidePlaceholder={!(hoveredSearchResult !== null || !searchValue)}
                  value={searchValue}
                  onChange={setSearchValue}
                />
                {searchValue && filteredResults.length > 0 && (
                  <SearchResultsContainer
                    results={filteredResults}
                    onHover={setHoveredSearchResult}
                    onSelect={handleSelect}
                  />
                )}
                {searchValue && filteredResults.length === 0 && (
                  <motion.div
                    layout
                    className="px-6 py-4 border-t border-white/10 w-full text-center"
                  >
                    <p className="text-sm text-white/30">Sin resultados</p>
                  </motion.div>
                )}
              </motion.div>
              {hovered && !searchValue && shortcuts.map((shortcut, index) => (
                <motion.div
                  key={`shortcut-${index}`}
                  onMouseEnter={() => setHoveredShortcut(index)}
                  layout
                  initial={{ scale: 0.7, x: -1 * (56 * (index + 1)) }}
                  animate={{ scale: 1, x: 0 }}
                  exit={{ scale: 0.7, x: 1 * (16 * (shortcuts.length - index - 1) + 56 * (shortcuts.length - index - 1)) }}
                  transition={{ duration: 0.8, type: "spring", bounce: 0.2, delay: index * 0.05 }}
                  className="rounded-full cursor-pointer"
                >
                  <ShortcutButton icon={shortcut.icon} onClick={() => { shortcut.onClick(); onClose(); }} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
