import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ScrollText } from "lucide-react";
import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { cargarRelacionesContratos } from "@/lib/relaciones/contratos";
import { propiedadesContrato } from "@/lib/contratos/propiedades";
import { cargarMapaAdendas } from "@/lib/contratos/adendas";
import { cargarOpcionesColumna } from "@/lib/opciones-columna";
import { ContratosList } from "../../contratos-list";
import { etiquetaFamilia, FAMILIA_DESCRIPCION, ORDEN_TIPOS } from "../../opciones";
import { BOTON_NUEVO_CLASE, CrearRegistro } from "@/components/ui/crear-registro";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";

const TODOS = "todos";

export default async function ContratosPorTipoPage({
  params,
  searchParams,
}: {
  params: Promise<{ tipo: string }>;
  searchParams: Promise<{ q?: string; estado?: string; vencimiento?: string; vencidos?: string }>;
}) {
  const { tipo: tipoRuta } = await params;
  const sp = await searchParams;

  const familia = decodeURIComponent(tipoRuta);
  const familiaFija = familia === TODOS || (ORDEN_TIPOS as readonly string[]).includes(familia);

  // Los filtros de la barra anterior ya no deben quedar aplicados de forma
  // invisible. Los enlaces guardados se limpian y abren la nueva vista.
  if (sp.q !== undefined || sp.estado !== undefined || sp.vencimiento !== undefined || sp.vencidos !== undefined) {
    redirect(`/contratos/tipo/${familia}`);
  }

  const supabase = await createClient();

  // Sin paginación visible: el árbol de adendas necesita padre e hijos en el
  // mismo arreglo para poder anidarlos, incluso si supera el límite de la API.
  const [{ data: contratos, error: contratosError }, { data: estadosData, error: estadosError }, opcionesTipo] = await Promise.all([
    fetchAllRows((from, to) => {
      let query = supabase
        .from("contratos")
        .select("id, tipo, nombre, monto, moneda, plazo, fecha_inicio, fecha_vencimiento, legalizado, estado, notion_origen, extra, creado_en, actualizado_en");
      if (familia !== TODOS) query = query.eq("tipo", familia);
      return query.order("nombre").order("id").range(from, to);
    }),
    fetchAllRows((from, to) =>
      supabase
        .from("contratos")
        .select("estado")
        .not("estado", "is", null)
        .order("estado")
        .range(from, to)
    ),
    cargarOpcionesColumna(supabase, "contratos"),
  ]);
  if (contratosError || estadosError) throw new Error("No se pudieron cargar los contratos de esta familia");

  // Etiqueta de Tipo: la del catálogo editable en cuanto alguien la renombra
  // desde "Editar propiedad"; mientras tanto, la del código.
  const etiquetasTipo = Object.fromEntries((opcionesTipo.tipo ?? []).map((opcion) => [opcion.valor, opcion.etiqueta]));

  const filas = contratos ?? [];
  // Una familia nueva (agregada desde el desplegable de "Tipo") no está en
  // ORDEN_TIPOS: sólo es 404 si además no tiene ningún contrato — así un
  // enlace a una familia vacía o ya quitada del catálogo no rompe la ruta.
  if (!familiaFija && filas.length === 0) notFound();
  const ids = filas.map((contrato) => contrato.id);

  const [adjuntosPorId, relacionesPorContrato, mapaAdendas, propiedadesIniciales] = await Promise.all([
    contarArchivosPorEntidad(supabase, "contrato", ids),
    cargarRelacionesContratos(supabase, ids),
    cargarMapaAdendas(supabase, filas),
    cargarPropiedadesPersonalizadas(supabase, "contrato", ids, familia === TODOS ? undefined : familia),
  ]);

  const estadosDisponibles = Array.from(
    new Set(
      (estadosData ?? [])
        .map((contrato) => (contrato.estado as string).trim())
        .filter((valor) => valor.length > 0 && valor.length <= 30)
    )
  ).sort();

  const propiedadesPorLabel = new Map<string, Set<string>>();
  for (const contrato of filas) {
    for (const propiedad of propiedadesContrato(contrato.extra)) {
      const claves = propiedadesPorLabel.get(propiedad.label) ?? new Set<string>();
      claves.add(propiedad.clave);
      propiedadesPorLabel.set(propiedad.label, claves);
    }
  }
  const propiedadesDisponibles = Array.from(propiedadesPorLabel.entries())
    .map(([label, claves]) => ({ label, claves: Array.from(claves) }))
    .sort((a, b) => a.label.localeCompare(b.label, "es-PE"));

  const titulo = familia === TODOS ? "Todos los contratos" : (etiquetasTipo[familia] ?? etiquetaFamilia(familia));

  return (
    <div className="flex h-full flex-col">
      <Header title={titulo} />
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/contratos" className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/80">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver al índice de contratos
          </Link>
          {familia !== TODOS && FAMILIA_DESCRIPCION[familia] && (
            <p className="text-[11px] text-white/50">{FAMILIA_DESCRIPCION[familia]}</p>
          )}
        </div>

        {filas.length === 0 ? (
          <div className="glass-empty">
            <ScrollText className="mb-3 h-10 w-10 text-white/15" />
            <p className="text-sm font-medium text-white/45">
              Esta familia todavía no tiene contratos
            </p>
            <CrearRegistro
              clave="contratos"
              className={`${BOTON_NUEVO_CLASE} mt-4`}
              valoresIniciales={familia === TODOS ? undefined : { tipo: familia }}
              camposOcultos={familia === TODOS ? [] : ["tipo"]}
            />
          </div>
        ) : (
          <ContratosList
            contratos={filas}
            estadosDisponibles={estadosDisponibles}
            count={filas.length}
            adjuntosPorId={adjuntosPorId}
            relacionesPorContrato={relacionesPorContrato}
            propiedadesDisponibles={propiedadesDisponibles}
            mapaAdendas={mapaAdendas}
            valoresBaseNuevo={familia === TODOS ? undefined : { tipo: familia }}
            propiedadesIniciales={propiedadesIniciales}
            subtipoPropiedades={familia === TODOS ? undefined : familia}
            subtipoPropiedadesLabel={familia === TODOS ? undefined : titulo}
          />
        )}
      </div>
    </div>
  );
}
