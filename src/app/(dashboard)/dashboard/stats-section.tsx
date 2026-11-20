import { createClient } from "@/lib/supabase/server";
import { getAlertasActuales } from "@/lib/alertas-server";
import { alertasAbiertas } from "@/lib/alertas";
import { StatCard } from "@/components/ui/stat-card";
import { CountUp } from "@/components/ui/count-up";
import { FadeIn } from "@/components/ui/fade-in";
import {
  AlertTriangle, Car, FolderOpen, Gem, Gavel, MapPin, UserCheck, Users,
} from "lucide-react";

type Conteos = {
  propietarios: number; predios: number; vehiculos: number;
  concesiones_mineras: number; personal: number; procesos: number; documentos: number;
};

export async function StatsSection() {
  const supabase = await createClient();
  const [{ data: conteosRaw }, alertas] = await Promise.all([
    supabase.rpc("conteos_dashboard"),
    getAlertasActuales(),
  ]);

  const c = conteosRaw as Conteos | null;
  const pendientes = alertasAbiertas(alertas);

  const n = (v: number | undefined) => v != null ? <CountUp to={v} /> : "—";

  const stats = [
    { label: "Propietarios",        value: n(c?.propietarios),        icon: Users,        color: "blue"   as const },
    { label: "Predios",             value: n(c?.predios),             icon: MapPin,       color: "green"  as const },
    { label: "Vehículos",           value: n(c?.vehiculos),           icon: Car,          color: "purple" as const },
    { label: "Concesiones Mineras", value: n(c?.concesiones_mineras), icon: Gem,          color: "yellow" as const },
    { label: "Personal",            value: n(c?.personal),            icon: UserCheck,    color: "blue"   as const },
    { label: "Procesos Judiciales", value: n(c?.procesos),            icon: Gavel,        color: "red"    as const },
    { label: "Documentos",          value: n(c?.documentos),          icon: FolderOpen,   color: "green"  as const },
    {
      label: "Alertas activas",
      value: <CountUp to={pendientes.length} />,
      icon: AlertTriangle,
      color: pendientes.length > 0 ? "red" as const : "green" as const,
    },
  ];

  return (
    <FadeIn>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/35">
        Resumen general
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>
    </FadeIn>
  );
}
