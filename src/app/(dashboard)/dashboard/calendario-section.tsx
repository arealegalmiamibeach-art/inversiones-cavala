import { createClient } from "@/lib/supabase/server";
import { FadeIn } from "@/components/ui/fade-in";
import { CalendarioGeneral } from "@/components/ui/calendario-general";
import {
  normalizarContratos,
  normalizarVehiculos,
  normalizarPersonal,
  normalizarDocumentos,
  normalizarEventos,
  normalizarDiligenciasProcesos,
  normalizarPropiedadesFecha,
  aplicarConfigFechas,
  adjuntarCierres,
  claveDiaEnLima,
  type EventoCalendario,
} from "@/lib/calendario";
import { cargarFechasPersonalizadas } from "@/lib/calendario-server";
import { cargarConfigFechas } from "@/lib/fechas-config";
import { COLUMNAS_EVENTO, cargarProcesosDeEventos } from "@/lib/procesos/eventos";
import { cargarFeriados } from "@/lib/feriados-server";
import { hoyISOEnLima } from "@/lib/utils";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { COLUMNAS_CIERRE, mapaDeCierres, type FilaCierre } from "@/lib/vencimientos/cierres";
import { MATERIAS as MATERIA_LABEL } from "@/app/(dashboard)/procesos/opciones";
import type { OrigenAlerta } from "@/lib/alertas";

const ORIGENES_EDITABLES: OrigenAlerta[] = ["contrato", "vehiculo", "personal", "documento"];

export async function CalendarioSection() {
  const supabase = await createClient();

  const [
    { data: contratosFechas },
    { data: vehiculosFechas },
    { data: personalFechas },
    { data: documentosFechas },
    { data: eventosFechas },
    { data: procesosDiligencias },
    fechasPersonalizadas,
    configFechas,
    cierresRes,
    { data: procesosOpciones },
    { data: perfiles },
    puedeCrearDiligencias,
    feriados,
    vencimientosEditables,
  ] = await Promise.all([
    supabase.from("contratos").select("id, tipo, nombre, fecha_inicio, fecha_vencimiento, monto, moneda, estado").limit(2000),
    supabase.from("vehiculos").select("id, placa, marca_modelo, soat_vence, poliza_vence, revision_tecnica, responsable").limit(2000),
    supabase.from("personal").select("id, nombre, contrato_inicio, contrato_fin, cargo").limit(2000),
    supabase.from("documentos").select("id, nombre, tipo, fecha, detalle").not("fecha", "is", null).limit(3000),
    supabase.from("eventos").select(`${COLUMNAS_EVENTO}, extra`).limit(2000),
    supabase.from("procesos").select("id, materia, expediente, asunto, diligencia, estado, juzgado, abogado").not("diligencia", "is", null).limit(2000),
    cargarFechasPersonalizadas(supabase),
    cargarConfigFechas(supabase),
    supabase.from("vencimientos_cierres").select(COLUMNAS_CIERRE).limit(5000),
    supabase.from("procesos").select("id, expediente, asunto, materia").order("expediente").limit(1000),
    supabase.from("perfiles").select("id, nombre, correo").eq("activo", true).order("nombre"),
    puedeAdministrarEntidad("evento"),
    cargarFeriados(supabase),
    Promise.all(
      ORIGENES_EDITABLES.map(async (o) => ((await puedeAdministrarEntidad(o)) ? [o] : []))
    ).then((r) => r.flat()),
  ]);

  const procesoPorEvento = await cargarProcesosDeEventos(
    supabase,
    (eventosFechas ?? []).map((e) => e.id as string),
    { detalle: true }
  );

  const diligenciasRegistradas = new Set(
    (eventosFechas ?? []).flatMap((e) => {
      const proceso = procesoPorEvento.get(e.id as string);
      if (!proceso || !e.inicia_en) return [];
      return [`${proceso.id}|${claveDiaEnLima(e.inicia_en as string)}`];
    })
  );

  const eventosCalendario: EventoCalendario[] = adjuntarCierres(
    aplicarConfigFechas([
      ...normalizarContratos(contratosFechas ?? []),
      ...normalizarVehiculos(vehiculosFechas ?? []),
      ...normalizarPersonal(personalFechas ?? []),
      ...normalizarDocumentos(documentosFechas ?? []),
      ...normalizarEventos(eventosFechas ?? [], procesoPorEvento),
      ...normalizarDiligenciasProcesos(procesosDiligencias ?? [], {
        registradas: diligenciasRegistradas,
        desde: hoyISOEnLima(),
      }),
      ...normalizarPropiedadesFecha(fechasPersonalizadas),
    ], configFechas),
    mapaDeCierres(cierresRes.error ? [] : (cierresRes.data as FilaCierre[] | null))
  );

  const opcionesProcesos = (procesosOpciones ?? []).map((p) => ({
    id: p.id as string,
    etiqueta:
      (p.expediente as string | null) ||
      (p.asunto as string | null) ||
      MATERIA_LABEL[p.materia as string] ||
      "Proceso sin expediente",
  }));

  const responsables = (perfiles ?? []).map((p) => ({
    id: p.id as string,
    nombre: (p.nombre as string | null) || (p.correo as string | null) || "Sin nombre",
  }));

  return (
    <FadeIn delay={0.05}>
    <CalendarioGeneral
      eventos={eventosCalendario}
      procesos={opcionesProcesos}
      responsables={responsables}
      feriados={Array.from(feriados.keys())}
      puedeCrear={puedeCrearDiligencias}
      vencimientosEditables={vencimientosEditables}
    />
    </FadeIn>
  );
}
