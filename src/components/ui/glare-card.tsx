"use client";

import Link from "next/link";
import { useCallback, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlareCardProps {
  children: ReactNode;
  className?: string;
  href?: string;
  label?: string;
  tiltIntensity?: number;
  glareColor?: string;
}

export function GlareCard({
  children,
  className,
  href,
  label,
  tiltIntensity = 6,
  glareColor = "rgba(96,165,250,0.35)",
}: GlareCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
      el.style.setProperty("--rx", `${((0.5 - py) * tiltIntensity).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${((px - 0.5) * tiltIntensity).toFixed(2)}deg`);
      el.style.setProperty("--glare-o", "1");
    },
    [tiltIntensity]
  );

  const onMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--glare-o", "0");
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ "--glare-color": glareColor } as CSSProperties}
      className={cn("glare-card", className)}
    >
      <div className="glare-shine" aria-hidden />
      <div className="relative z-10 flex h-full flex-col">{children}</div>
      {href && (
        <Link href={href} aria-label={label} className="absolute inset-0 z-20 rounded-[inherit]" />
      )}
    </div>
  );
}
