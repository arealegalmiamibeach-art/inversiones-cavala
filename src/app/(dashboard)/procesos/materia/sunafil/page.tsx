import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { resumirMateria } from "@/lib/procesos/resumen";
import { cargarRelacionesEntidad } from "@/lib/relaciones/contratos";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { cargarEstadosProcesos } from "@/lib/procesos/estados";
import { SunafilList } from "../../sunafil-list";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { cargarEventosPorProcesos } from "@/lib/procesos/eventos";

const CAMPOS = "id, materia, expediente, asunto, estado, juzgado, abogado, estudio, diligencia, descripcion, extra";

export default async function SunafilPage() {
  const supabase = await createClient();

  const { data, error } = await fetchAllRows((from, to) =>
    supabase
      .from("procesos")
      .select(CAMPOS)
      .eq("materia", "sunafil")
      .order("expediente")
      .order("id")
      .range(from, to)
  );
  if (error) throw new Error("No se pudieron cargar los procesos de SUNAFIL");
  const procesos = data ?? [];

  const idsProcesos = procesos.map((p) => p.id);
  const [adjuntosPorId, relacionesPorProceso, propiedadesPersonalizadas, estadosProcesos, eventosPorProceso] = await Promise.all([
    contarArchivosPorEntidad(supabase, "proceso", idsProcesos),
    cargarRelacionesEntidad(supabase, "proceso", idsProcesos),
    cargarPropiedadesPersonalizadas(supabase, "proceso", idsProcesos, "sunafil"),
    cargarEstadosProcesos(supabase),
    cargarEventosPorProcesos(supabase, idsProcesos),
  ]);

  const resumen = resumirMateria(procesos, undefined, eventosPorProceso);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <nav className="flex items-center gap-1.5 text-xs text-white/45">
          <Link href="/procesos" className="transition-colors duration-200 hover:text-white/80">Procesos judiciales</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-white/75">SUNAFIL</span>
        </nav>

        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-white">SUNAFIL</h2>
          <span className="text-xs text-white/50">
            {resumen.total.toLocaleString("es-PE")} proceso{resumen.total === 1 ? "" : "s"} ·{" "}
            {resumen.enCurso} en curso ({resumen.porcentajeEnCurso}%)
          </span>
        </div>

        <SunafilList
          procesos={procesos}
          eventosPorProceso={eventosPorProceso}
          adjuntosPorId={adjuntosPorId}
          relacionesPorProceso={relacionesPorProceso}
          propiedadesPersonalizadas={propiedadesPersonalizadas.definiciones}
          valoresPropiedadesPorProceso={propiedadesPersonalizadas.valoresPorEntidad}
          estadosProcesos={estadosProcesos}
          revalidar="/procesos/materia/sunafil"
        />
      </div>
    </div>
  );
}
