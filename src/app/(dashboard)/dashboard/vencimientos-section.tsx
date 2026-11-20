import { createClient } from "@/lib/supabase/server";
import { FadeIn } from "@/components/ui/fade-in";
import { getAlertasActuales } from "@/lib/alertas-server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { VencimientosWidget } from "@/components/ui/vencimientos-widget";
import { EntityDonut } from "@/components/ui/entity-donut";
import { CalendarClock } from "lucide-react";
import type { OrigenAlerta } from "@/lib/alertas";

const ORIGENES_EDITABLES: OrigenAlerta[] = ["contrato", "vehiculo", "personal", "documento"];

type Conteos = {
  propietarios: number; predios: number; vehiculos: number;
  concesiones_mineras: number; personal: number; procesos: number; documentos: number;
};

export async function VencimientosSection() {
  const supabase = await createClient();

  const [alertas, vencimientosEditables, { data: conteosRaw }] = await Promise.all([
    getAlertasActuales(),
    Promise.all(
      ORIGENES_EDITABLES.map(async (o) => ((await puedeAdministrarEntidad(o)) ? [o] : []))
    ).then((r) => r.flat()),
    supabase.rpc("conteos_dashboard"),
  ]);

  const conteos = conteosRaw as Conteos | null;

  const distribucion = [
    { label: "Propietarios",        value: conteos?.propietarios        ?? 0, color: "#3987e5" },
    { label: "Predios",             value: conteos?.predios             ?? 0, color: "#d95926" },
    { label: "Vehículos",           value: conteos?.vehiculos           ?? 0, color: "#199e70" },
    { label: "Concesiones Mineras", value: conteos?.concesiones_mineras ?? 0, color: "#c98500" },
    { label: "Personal",            value: conteos?.personal            ?? 0, color: "#d55181" },
    { label: "Procesos Judiciales", value: conteos?.procesos            ?? 0, color: "#008300" },
    { label: "Documentos",          value: conteos?.documentos          ?? 0, color: "#9085e9" },
  ];

  return (
    <FadeIn delay={0.08}>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="glass-panel p-5 lg:col-span-2">
        <div className="mb-4 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-white/40" />
          <h3 className="text-sm font-semibold text-white/85">
            Vencimientos (30 días vencidos · 60 próximos)
          </h3>
        </div>
        <VencimientosWidget alertas={alertas} editables={vencimientosEditables} />
      </div>

      <div className="glass-panel p-5">
        <h3 className="mb-4 text-sm font-semibold text-white/85">Distribución de entidades</h3>
        <EntityDonut segments={distribucion} />
      </div>
    </div>
    </FadeIn>
  );
}
