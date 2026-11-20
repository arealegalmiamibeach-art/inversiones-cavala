import { Suspense } from "react";
import { Header } from "@/components/layout/header";
import { DashboardTabs } from "@/components/layout/dashboard-tabs";
import { GlareCard } from "@/components/ui/glare-card";
import { cn } from "@/lib/utils";
import { ArrowRight, FolderOpen, Gavel, Users, type LucideIcon } from "lucide-react";
import { StatsSection } from "./stats-section";
import { CalendarioSection } from "./calendario-section";
import { VencimientosSection } from "./vencimientos-section";
import { StatsSkeletons, CalendarioSkeleton, VencimientosSkeleton } from "./skeletons";

export default function DashboardPage() {
  return (
    <div className="flex h-full flex-col">
      <Header title="Dashboard" />
      <DashboardTabs />

      <div className="scrollbar-glass flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-4">

        <Suspense fallback={<StatsSkeletons />}>
          <StatsSection />
        </Suspense>

        <Suspense fallback={<CalendarioSkeleton />}>
          <CalendarioSection />
        </Suspense>

        <Suspense fallback={<VencimientosSkeleton />}>
          <VencimientosSection />
        </Suspense>

        {/* Módulos — estáticos, sin Suspense */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/35">
            Módulos del sistema
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ModuleCard
              title="Entidades y Relaciones"
              description="Propietarios, predios, vehículos, concesiones mineras, personal y oficinas registrales."
              icon={Users}
              href="/entidades/propietarios"
              color="blue"
            />
            <ModuleCard
              title="Procesos Judiciales"
              description="Expedientes por materia, alertas de vencimiento y seguimiento de escritos."
              icon={Gavel}
              href="/procesos"
              color="red"
            />
            <ModuleCard
              title="Documentos"
              description="Búsqueda, descarga, clasificación y vinculación de documentos a entidades."
              icon={FolderOpen}
              href="/documentos"
              color="green"
            />
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── sub-componentes ─────────────────────────────────────────────────────────

function ModuleCard({
  title, description, icon: Icon, href, color,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  color: "blue" | "red" | "green";
}) {
  const colorMap = {
    blue:  { icon: "text-brand-300",   halo: "bg-brand-500/15 border-brand-400/25",     glow: "shadow-[0_0_24px_-8px_rgba(59,130,246,0.55)]",  glare: "rgba(96,165,250,0.30)" },
    red:   { icon: "text-red-300",     halo: "bg-red-500/15 border-red-400/25",         glow: "shadow-[0_0_24px_-8px_rgba(239,68,68,0.55)]",   glare: "rgba(248,113,113,0.24)" },
    green: { icon: "text-emerald-300", halo: "bg-emerald-500/15 border-emerald-400/25", glow: "shadow-[0_0_24px_-8px_rgba(16,185,129,0.55)]",  glare: "rgba(52,211,153,0.24)" },
  };
  const c = colorMap[color];
  return (
    <GlareCard href={href} label={title} glareColor={c.glare} tiltIntensity={8} className="group gap-3 p-5">
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-105", c.halo, c.glow)}>
        <Icon className={cn("h-5 w-5", c.icon)} />
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-white/45">{description}</p>
        </div>
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-white/20 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-white/60" />
      </div>
    </GlareCard>
  );
}
