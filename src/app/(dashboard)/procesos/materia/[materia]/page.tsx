import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { materiaInfo, materiaPorSlug, SLUG_TODAS } from "@/lib/procesos/materias";
import { cargarOpcionesColumna } from "@/lib/opciones-columna";
import { resumirMateria } from "@/lib/procesos/resumen";
import { cargarRelacionesEntidad } from "@/lib/relaciones/contratos";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { cargarEstadosProcesos } from "@/lib/procesos/estados";
import { ProcesosList } from "../../procesos-list";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { cargarEventosPorProcesos } from "@/lib/procesos/eventos";

const CAMPOS = "id, materia, expediente, asunto, estado, juzgado, abogado, estudio, diligencia, descripcion, extra";

export default async function ProcesosPorMateriaPage({ params }: { params: Promise<{ materia: string }> }) {
  const { materia: slugRuta } = await params;
  const slug = decodificar(slugRuta);
  const esTodas = slug === SLUG_TODAS;

  const supabase = await createClient();
  const opcionesMateria = await cargarOpcionesColumna(supabase, "procesos");

  // Las materias del código tienen slug propio; una agregada desde el
  // catálogo editable ("Editar propiedad" → Materia) usa su valor tal cual
  // como slug. Antes esa tarjeta del índice llevaba a un 404.
  const materiaConocida = materiaPorSlug(slug);
  const enCatalogo = (opcionesMateria.materia ?? []).some((opcion) => opcion.valor === slug);
  const info = esTodas ? null : materiaConocida ?? materiaInfo(slug);

  // Igual que el índice: se trae la materia completa y todo el filtrado
  // (texto, estado, rango de fechas de diligencia) corre en el cliente.
  const { data, error } = await fetchAllRows((from, to) => {
    let consulta = supabase.from("procesos").select(CAMPOS).order("expediente").order("id");
    if (info) consulta = consulta.eq("materia", info.clave);
    return consulta.range(from, to);
  });
  if (error) throw new Error("No se pudieron cargar los procesos de esta materia");
  const procesos = data ?? [];
  // Igual que las familias de contratos: una materia que no es del código ni
  // del catálogo sólo es 404 si además no tiene ningún proceso.
  if (info && !materiaConocida && !enCatalogo && procesos.length === 0) notFound();

  const idsProcesos = procesos.map((proceso) => proceso.id);
  const [adjuntosPorId, relacionesPorProceso, propiedadesPersonalizadas, estadosProcesos, eventosPorProceso] = await Promise.all([
    contarArchivosPorEntidad(supabase, "proceso", idsProcesos),
    cargarRelacionesEntidad(supabase, "proceso", idsProcesos),
    cargarPropiedadesPersonalizadas(supabase, "proceso", idsProcesos, info?.clave),
    cargarEstadosProcesos(supabase),
    cargarEventosPorProcesos(supabase, idsProcesos),
  ]);
  const resumen = resumirMateria(procesos, undefined, eventosPorProceso);
  const etiquetasMateria = Object.fromEntries((opcionesMateria.materia ?? []).map((opcion) => [opcion.valor, opcion.etiqueta]));
  const titulo = info ? (etiquetasMateria[info.clave] ?? info.etiqueta) : "Todos los procesos";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <nav className="flex items-center gap-1.5 text-xs text-white/45">
          <Link href="/procesos" className="hover:text-white/80">Procesos judiciales</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-white/75">{titulo}</span>
        </nav>

        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-white">{titulo}</h2>
          <span className="text-xs text-white/50">
            {resumen.total.toLocaleString("es-PE")} proceso{resumen.total === 1 ? "" : "s"} ·{" "}
            {resumen.enCurso} en curso ({resumen.porcentajeEnCurso}%)
          </span>
        </div>

        <ProcesosList
          procesos={procesos}
          eventosPorProceso={eventosPorProceso}
          adjuntosPorId={adjuntosPorId}
          relacionesPorProceso={relacionesPorProceso}
          propiedadesPersonalizadas={propiedadesPersonalizadas.definiciones}
          valoresPropiedadesPorProceso={propiedadesPersonalizadas.valoresPorEntidad}
          estadosProcesos={estadosProcesos}
          mostrarFiltroMateria={esTodas}
          materiaFija={info?.clave}
          storageKey={`procesos-${slug}`}
          revalidar={`/procesos/materia/${encodeURIComponent(slug)}`}
        />
      </div>
    </div>
  );
}

function decodificar(valor: string): string {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}
