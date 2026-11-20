import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Banknote, Calendar, Network, ScrollText, Tag } from "lucide-react";
import { PropertyPill } from "@/components/ui/property-pill";
import { EditableText } from "@/components/ui/editable-text";
import { DocumentosYRelaciones } from "@/components/ui/documentos-relaciones";
import { EliminarRegistro } from "@/components/ui/eliminar-registro";
import { NotionBlockEditor } from "@/components/ui/notion-block-editor";
import { HistorialPanel } from "@/components/ui/historial-panel";
import { TIPO_OPCIONES, MONEDA_OPCIONES, ESTADO_BASE_OPCIONES, etiquetaFamilia } from "../opciones";
import { cargarCategoriasEntidad } from "@/lib/relaciones/agrupar";
import { cargarRelacionesContratos } from "@/lib/relaciones/contratos";
import { propiedadesContrato } from "@/lib/contratos/propiedades";
import { calcularVigencia } from "@/lib/contratos/vigencia";
import { cargarMapaAdendas, esUuid, leerMarcaAdenda } from "@/lib/contratos/adendas";
import { contarArchivosPorEntidad } from "@/lib/archivos/counts";
import { AdendasPanel, type AdendaResumen } from "../adendas-panel";
import { RelacionesContratoPropiedades } from "@/components/ui/relaciones-contrato-propiedades";
import { VigenciaIndicador } from "../vigencia-indicador";
import { CampoLegalizado } from "../legalizado";
import { EntityPropertyList, EntityPropertyRow } from "@/components/ui/entity-sheet";
import { FilasPropiedadesPersonalizadas } from "@/components/ui/propiedades-personalizadas";
import { cargarPropiedadesPersonalizadas } from "@/lib/propiedades/personalizadas";
import { FranjaVencimiento } from "@/components/ui/cierre-vencimiento";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { COLUMNAS_CIERRE, claveCierre, mapaDeCierres, type FilaCierre } from "@/lib/vencimientos/cierres";

type FilaContrato = {
  id: string;
  nombre: string;
  monto: number | null;
  moneda: string | null;
  fecha_inicio: string | null;
  fecha_vencimiento: string | null;
  extra: Record<string, unknown> | null;
};

export default async function ContratoFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const supabase = await createClient();

  const [{ data: contrato, error: contratoError }, categoriasPorId, relacionesPorContrato, { data: estadosData }] = await Promise.all([
    supabase.from("contratos").select("*").eq("id", id).single(),
    cargarCategoriasEntidad(supabase, "contrato", [id]),
    cargarRelacionesContratos(supabase, [id]),
    supabase.from("contratos").select("estado").not("estado", "is", null),
  ]);

  if (contratoError && contratoError.code !== "PGRST116") throw new Error("No se pudo cargar el contrato");
  if (!contrato) notFound();
  // Las propiedades personalizadas pertenecen al tipo (familia) del contrato.
  const propiedadesPersonalizadas = await cargarPropiedadesPersonalizadas(supabase, "contrato", [id], contrato.tipo ?? "");
  const categorias = categoriasPorId[id] ?? [];
  const relaciones = relacionesPorContrato[id] ?? [];

  // Árbol de adendas: hijos de este contrato y, si el contrato mismo es una
  // adenda, el documento del que cuelga.
  const mapaAdendas = await cargarMapaAdendas(supabase, [{ id: contrato.id, extra: contrato.extra }]);
  const hijosIds = mapaAdendas.hijosPorPadre[contrato.id] ?? [];
  const padreId = mapaAdendas.padrePorHijo[contrato.id] ?? null;

  const [{ data: hijos }, { data: padre }, adjuntosPorHijo] = await Promise.all([
    hijosIds.length
      ? supabase
          .from("contratos")
          .select("id, nombre, monto, moneda, fecha_inicio, fecha_vencimiento, extra")
          .in("id", hijosIds)
          .order("nombre")
      : Promise.resolve({ data: [] as FilaContrato[] }),
    padreId
      ? supabase.from("contratos").select("id, nombre").eq("id", padreId).maybeSingle()
      : Promise.resolve({ data: null as { id: string; nombre: string } | null }),
    contarArchivosPorEntidad(supabase, "contrato", hijosIds),
  ]);

  const adendas: AdendaResumen[] = ((hijos ?? []) as FilaContrato[]).map((hijo) => {
    const marca = leerMarcaAdenda(hijo.extra);
    return {
      id: hijo.id,
      nombre: hijo.nombre,
      clase: marca.clase,
      creadaEnApp: marca.creadaEnApp,
      fecha_inicio: hijo.fecha_inicio,
      fecha_vencimiento: hijo.fecha_vencimiento,
      monto: hijo.monto,
      moneda: hijo.moneda,
      adjuntos: adjuntosPorHijo[hijo.id] ?? 0,
    };
  });

  const estadoOpciones = Array.from(
    new Set((estadosData ?? []).map((c) => (c.estado as string).trim()).filter((e) => e.length > 0 && e.length <= 30))
  )
    .sort()
    .map((e) => {
      const v = e.toLowerCase();
      const className = v.includes("vigente")
        ? "bg-emerald-500/15 text-emerald-300"
        : v.includes("vencido")
          ? "bg-red-500/15 text-red-300"
          : v.includes("cesad")
            ? "bg-white/10 text-white/50"
            : "bg-white/10 text-white/60";
      return { value: e, label: e, className };
    });

  const propiedadesImportadas = propiedadesContrato(contrato.extra);

  const { dias } = calcularVigencia(contrato.fecha_vencimiento);
  const urgente = dias !== null && dias <= 15;

  // Qué pasó con este vencimiento, si ya se registró (mismo id que la alerta).
  const alertaVencimiento = `contrato-${contrato.id}`;
  const [cierreRes, puedeCerrarVencimiento] = contrato.fecha_vencimiento && dias !== null && dias <= 30
    ? await Promise.all([
        supabase
          .from("vencimientos_cierres")
          .select(COLUMNAS_CIERRE)
          .eq("alerta_id", alertaVencimiento)
          .eq("fecha", contrato.fecha_vencimiento),
        puedeAdministrarEntidad("contrato"),
      ])
    : [null, false];
  const cierreVencimiento = cierreRes && !cierreRes.error
    ? mapaDeCierres(cierreRes.data as FilaCierre[] | null).get(claveCierre(alertaVencimiento, contrato.fecha_vencimiento)) ?? null
    : null;
  const notasIniciales = typeof (contrato.extra as Record<string, unknown> | null)?.notas === "string"
    ? ((contrato.extra as Record<string, unknown>).notas as string)
    : "";

  const formatFecha = (f: string | null) =>
    f ? new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }) : null;

  const rutaFamilia = `/contratos/tipo/${contrato.tipo ?? "todos"}`;

  return (
    <div className="flex flex-col h-full">
      <Header title={contrato.nombre} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1320px] px-6 py-8 sm:px-8 sm:py-10">

          <div className="mb-6 flex items-center justify-between gap-3">
            <Link href={rutaFamilia} className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/80">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver a {etiquetaFamilia(contrato.tipo)}
            </Link>
            <HistorialPanel tabla="contratos" registroId={contrato.id} titulo={contrato.nombre} />
          </div>

          {/* Alerta vencimiento */}
          {contrato.fecha_vencimiento && dias !== null && dias <= 30 && (
            <FranjaVencimiento
              alertaId={alertaVencimiento}
              fecha={contrato.fecha_vencimiento}
              cierre={cierreVencimiento}
              puedeCerrar={puedeCerrarVencimiento}
              urgente={urgente}
            >
              {dias <= 0
                ? <>Contrato <strong>vencido</strong> el {formatFecha(contrato.fecha_vencimiento)}</>
                : <>Contrato vence en <strong>{dias} días</strong> — {formatFecha(contrato.fecha_vencimiento)}</>
              }
            </FranjaVencimiento>
          )}

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <EntityPropertyList ordenKey="contrato" entidadTipo="contrato">
              <EntityPropertyRow icon={<ScrollText className="h-3.5 w-3.5" />} label="Nombre">
                <EditableText tabla="contratos" id={contrato.id} campo="nombre" valorInicial={contrato.nombre} revalidar={`/contratos/${id}`} placeholder="Sin nombre" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Tipo" campo="tipo">
                <PropertyPill tabla="contratos" id={contrato.id} campo="tipo" valor={contrato.tipo} opciones={TIPO_OPCIONES} revalidar={`/contratos/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Estado" campo="estado">
                <PropertyPill tabla="contratos" id={contrato.id} campo="estado" valor={contrato.estado} opciones={estadoOpciones.length > 0 ? estadoOpciones : ESTADO_BASE_OPCIONES} revalidar={`/contratos/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Moneda" campo="moneda">
                <PropertyPill tabla="contratos" id={contrato.id} campo="moneda" valor={contrato.moneda} opciones={MONEDA_OPCIONES} revalidar={`/contratos/${id}`} />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Banknote className="h-3.5 w-3.5" />} label="Monto" campo="monto">
                <EditableText tabla="contratos" id={contrato.id} campo="monto" valorInicial={contrato.monto?.toString()} revalidar={`/contratos/${id}`} inputType="number" min={0} step="0.01" placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Calendar className="h-3.5 w-3.5" />} label="Inicio" campo="inicio">
                <EditableText tabla="contratos" id={contrato.id} campo="fecha_inicio" valorInicial={contrato.fecha_inicio} revalidar={`/contratos/${id}`} inputType="date" placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Calendar className="h-3.5 w-3.5" />} label={contrato.tipo === "arrendamiento" ? "Fecha de término" : "Fecha de vencimiento"} campo="vencimiento">
                <EditableText tabla="contratos" id={contrato.id} campo="fecha_vencimiento" valorInicial={contrato.fecha_vencimiento} revalidar={`/contratos/${id}`} inputType="date" placeholder="—" />
              </EntityPropertyRow>
              {contrato.tipo === "arrendamiento" && (
                <EntityPropertyRow icon={<Calendar className="h-3.5 w-3.5" />} label="Vigencia" campo="vigencia">
                  <VigenciaIndicador fecha={contrato.fecha_vencimiento} />
                </EntityPropertyRow>
              )}
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Plazo" campo="plazo">
                <EditableText tabla="contratos" id={contrato.id} campo="plazo" valorInicial={contrato.plazo} revalidar={`/contratos/${id}`} placeholder="—" />
              </EntityPropertyRow>
              <EntityPropertyRow icon={<Tag className="h-3.5 w-3.5" />} label="Legalizado" campo="legalizado">
                <CampoLegalizado id={contrato.id} valor={contrato.legalizado} revalidar={`/contratos/${id}`} />
              </EntityPropertyRow>
              {propiedadesImportadas.map((propiedad) => (
                <EntityPropertyRow key={propiedad.clave} icon={<Tag className="h-3.5 w-3.5" />} label={propiedad.label} campo={`extra:${propiedad.label}`} align="start">
                  <EditableText tabla="contratos" id={contrato.id} campo={`extra.${propiedad.clave}`} valorInicial={propiedad.valor} revalidar={`/contratos/${id}`} multiline placeholder="—" />
                </EntityPropertyRow>
              ))}
              <RelacionesContratoPropiedades id={contrato.id} tipo={contrato.tipo} relaciones={relaciones} />
              <FilasPropiedadesPersonalizadas
                entidadTipo="contrato"
                subtipo={contrato.tipo ?? undefined}
                subtipoLabel={contrato.tipo ? etiquetaFamilia(contrato.tipo) : undefined}
                entidadId={contrato.id}
                propiedades={propiedadesPersonalizadas.definiciones}
                valores={propiedadesPersonalizadas.valoresPorEntidad[contrato.id] ?? {}}
              />
            </EntityPropertyList>

            <div className="space-y-2">
              <DocumentosYRelaciones entidadTipo="contrato" entidadId={contrato.id} categorias={categorias} titulo="Documentos y relaciones" permitirCrearTipo />
              {/* Adendas y resoluciones: sección plegable propia, mismo patrón que las categorías de arriba — ver adendas-panel.tsx */}
              <AdendasPanel
                contratoId={contrato.id}
                contratoNombre={contrato.nombre}
                adendas={adendas}
                padre={padre ?? null}
              />
            </div>
          </div>

          <div className="mt-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">Notas</h3>
            <NotionBlockEditor
              tabla="contratos"
              id={contrato.id}
              campo="extra.notas"
              valorInicial={notasIniciales}
              revalidar={`/contratos/${id}`}
            />
          </div>

          <div className="mt-8 border-t border-white/[0.06] pt-6">
            <EliminarRegistro clave="contratos" id={contrato.id} nombre={contrato.nombre} />
          </div>

        </div>
      </div>
    </div>
  );
}
