"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
  { href: "/dashboard/riesgo", label: "Riesgo y exposición", icon: ShieldAlert },
];

export function DashboardTabs() {
  const pathname = usePathname();

  return (
    <div className="scrollbar-glass flex shrink-0 items-center gap-1 overflow-x-auto px-3 pt-3 sm:px-4 sm:pt-4">
      {TABS.map((t) => {
        const activo = pathname === t.href;
        const Icono = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors sm:px-3.5 sm:text-sm",
              activo
                ? "border border-white/10 bg-white/10 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
                : "border border-transparent text-white/45 hover:bg-white/5 hover:text-white/80"
            )}
          >
            <Icono className={cn("h-4 w-4", activo ? "text-brand-300" : "text-white/30")} />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
