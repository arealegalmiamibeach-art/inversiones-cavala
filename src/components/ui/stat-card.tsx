import { cn } from "@/lib/utils";
import { GlareCard } from "@/components/ui/glare-card";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  description?: string;
  color?: "blue" | "green" | "yellow" | "red" | "purple";
}

const colorMap = {
  blue:   { icon: "text-brand-300",   halo: "bg-brand-500/15 border-brand-400/25",     glow: "shadow-[0_0_24px_-8px_rgba(59,130,246,0.55)]",  glare: "rgba(96,165,250,0.30)" },
  green:  { icon: "text-emerald-300", halo: "bg-emerald-500/15 border-emerald-400/25", glow: "shadow-[0_0_24px_-8px_rgba(16,185,129,0.55)]",  glare: "rgba(52,211,153,0.24)" },
  yellow: { icon: "text-amber-300",   halo: "bg-amber-500/15 border-amber-400/25",     glow: "shadow-[0_0_24px_-8px_rgba(245,158,11,0.55)]",  glare: "rgba(251,191,36,0.24)" },
  red:    { icon: "text-red-300",     halo: "bg-red-500/15 border-red-400/25",         glow: "shadow-[0_0_24px_-8px_rgba(239,68,68,0.55)]",   glare: "rgba(248,113,113,0.24)" },
  purple: { icon: "text-violet-300",  halo: "bg-violet-500/15 border-violet-400/25",   glow: "shadow-[0_0_24px_-8px_rgba(139,92,246,0.55)]",  glare: "rgba(167,139,250,0.24)" },
};

export function StatCard({ label, value, icon: Icon, description, color = "blue" }: StatCardProps) {
  const c = colorMap[color];
  return (
    <GlareCard className="p-5" glareColor={c.glare}>
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl border", c.halo, c.glow)}>
        <Icon className={cn("h-5 w-5", c.icon)} />
      </div>
      <p className="mt-4 text-2xl font-bold tabular-nums text-white">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-white/50">{label}</p>
      {description && <p className="mt-1 text-xs text-white/35">{description}</p>}
    </GlareCard>
  );
}
