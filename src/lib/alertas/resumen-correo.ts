import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alertasAbiertas, getAlertas, nivelAlerta, type Alerta } from "@/lib/alertas";
import {
  diasHasta,
  diligenciasEnVentana,
  hoyISO,
} from "@/lib/procesos/diligencias";
import {
  cargarProcesosDeEventos,
  descomponerIniciaEn,
  normalizarEstado,
} from "@/lib/procesos/eventos";
import { MATERIAS } from "@/app/(dashboard)/procesos/opciones";
import { filtrarAlertas, idContratoDeHref, puedeRecibirDiligencias } from "@/lib/alertas/alcance-correo";
import type { Acceso } from "@/lib/auth/roles";

/** Ventana de las diligencias/audiencias en el correo (los vencimientos usan la de `alertas.ts`, 60 días). */
export const DIAS_DILIGENCIAS_CORREO = 15;

/** Hasta cuánto atrás se rescata una diligencia que sigue sin cerrar. */
const DIAS_SIN_CERRAR = 365;

type LineaCorreo = {
  fecha: string;
  dias: number;
  etiqueta: string;
  detalle: string;
  href: string | null;
  critico: boolean;
  /** Perfil al que está asignada la diligencia, si lo tiene. */
  responsableId?: string | null;
};

export type ResumenCorreo = {
  asunto: string;
  html: string;
  vencimientos: number;
  diligencias: number;
  vacio: boolean;
};

/**
 * Datos crudos del resumen. Se consultan UNA vez por ejecución del cron y se
 * maquetan por destinatario: antes cada grupo de preferencias repetía todas
 * las consultas.
 */
export type DatosResumen = {
  hoy: string;
  alertas: Alerta[];
  diligencias: LineaCorreo[];
  /** id de contrato → tipo. Tesorería sólo recibe avisos de tres tipos. */
  tiposContrato: ReadonlyMap<string, string>;
};

function baseUrl(): string {
  const explicita = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicita) return explicita.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "";
}

function fechaLarga(fechaISO: string): string {
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
  const [a, m, d] = fechaISO.split("-").map(Number);
  return `${d} de ${meses[(m ?? 1) - 1]} de ${a}`;
}

function textoDias(dias: number): string {
  if (dias < 0) return `hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`;
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  return `en ${dias} días`;
}

async function lineasDiligencias(supabase: SupabaseClient, hoy: string): Promise<LineaCorreo[]> {
  const base = baseUrl();
  const lineas: LineaCorreo[] = [];

  // 1) Diligencias reales (tabla `eventos`, sólo las marcadas para notificar).
  //
  // `eliminado_en is null` va explícito porque el cron usa la service-role key
  // y se salta la RLS que esconde la papelera: sin esto seguía avisando de
  // diligencias ya eliminadas hasta que se purgaban, 30 días después.
  //
  // La ventana incluye lo ya pasado que siga PENDIENTE: una audiencia a la que
  // nadie fue tiene que seguir apareciendo hasta que alguien la cierre.
  const desde = new Date(Date.now() - DIAS_SIN_CERRAR * 86_400_000);
  // Hasta el máximo de "Avisar con" (90): el filtro por `dias_aviso` de cada una recorta después.
  const hasta = new Date(Date.now() + 90 * 86_400_000);
  const { data: eventos } = await supabase
    .from("eventos")
    .select("id, titulo, inicia_en, tipo_diligencia, responsable, responsable_id, estado, dias_aviso, notificar")
    .is("eliminado_en", null)
    .gte("inicia_en", desde.toISOString())
    .lte("inicia_en", hasta.toISOString())
    .or(`inicia_en.gte.${new Date().toISOString()},estado.eq.PENDIENTE`)
    .order("inicia_en");

  const procesoPorEvento = await cargarProcesosDeEventos(
    supabase,
    (eventos ?? []).map((e) => e.id as string)
  );

  for (const evento of eventos ?? []) {
    if (!evento.inicia_en || evento.notificar === false) continue;
    const { fecha, hora } = descomponerIniciaEn(evento.inicia_en as string);
    const dias = diasHasta(fecha, hoy);
    const sinCerrar = dias < 0 && normalizarEstado(evento.estado) === "PENDIENTE";

    // Cada diligencia decide con cuánta anticipación quiere avisar. Lo que ya
    // pasó y sigue sin cerrar entra siempre.
    const aviso = typeof evento.dias_aviso === "number" ? evento.dias_aviso : 10;
    if (!sinCerrar && dias > aviso) continue;

    const proceso = procesoPorEvento.get(evento.id as string);
    const materia = proceso?.materia ? MATERIAS[proceso.materia] ?? proceso.materia : null;
    const contexto = [
      proceso?.expediente,
      materia,
      hora !== "00:00" ? `${hora} h` : null,
      evento.tipo_diligencia,
      evento.responsable,
      sinCerrar ? "PASÓ SIN CERRAR" : null,
    ].filter(Boolean).join(" · ");

    lineas.push({
      fecha,
      dias,
      etiqueta: (evento.titulo as string) || (evento.tipo_diligencia as string) || "Diligencia",
      detalle: contexto,
      href: proceso && base ? `${base}/procesos/${proceso.id}` : null,
      critico: sinCerrar || dias <= 3,
      responsableId: (evento.responsable_id as string | null) ?? null,
    });
  }

  // 2) Fechas detectadas en el texto libre del expediente (sin diligencia real
  //    registrada ese día en ese proceso).
  const registradas = new Set(
    (eventos ?? []).flatMap((e) => {
      const proceso = procesoPorEvento.get(e.id as string);
      if (!proceso || !e.inicia_en) return [];
      return [`${proceso.id}|${descomponerIniciaEn(e.inicia_en as string).fecha}`];
    })
  );

  const { data: procesos } = await supabase
    .from("procesos")
    .select("id, expediente, materia, diligencia, descripcion")
    .is("eliminado_en", null)
    .not("diligencia", "is", null)
    .limit(500);

  for (const proceso of procesos ?? []) {
    for (const d of diligenciasEnVentana(proceso, DIAS_DILIGENCIAS_CORREO, hoy)) {
      if (registradas.has(`${proceso.id}|${d.fechaISO}`)) continue;
      const materia = proceso.materia ? MATERIAS[proceso.materia] ?? proceso.materia : null;
      const dias = diasHasta(d.fechaISO, hoy);
      lineas.push({
        fecha: d.fechaISO,
        dias,
        etiqueta: (proceso.expediente as string) || "Proceso sin expediente",
        detalle: [materia, "detectada en el expediente", d.texto.slice(0, 80)].filter(Boolean).join(" · "),
        href: base ? `${base}/procesos/${proceso.id}` : null,
        critico: dias <= 3,
      });
    }
  }

  return lineas.sort((a, b) => a.dias - b.dias);
}

function tabla(titulo: string, lineas: LineaCorreo[]): string {
  if (lineas.length === 0) return "";
  const filas = lineas.map((l) => {
    const color = l.critico ? "#b91c1c" : l.dias <= 30 ? "#b45309" : "#334155";
    const nombre = l.href
      ? `<a href="${l.href}" style="color:#1d4ed8;text-decoration:underline;">${escapar(l.etiqueta)}</a>`
      : escapar(l.etiqueta);
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-weight:600;color:${color};">${textoDias(l.dias)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;white-space:nowrap;color:#64748b;">${fechaLarga(l.fecha)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">
          <div style="color:#0f172a;font-weight:600;">${nombre}</div>
          ${l.detalle ? `<div style="color:#64748b;font-size:12px;margin-top:2px;">${escapar(l.detalle)}</div>` : ""}
        </td>
      </tr>`;
  }).join("");

  return `
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#475569;margin:24px 0 8px;">${titulo}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tbody>${filas}</tbody>
    </table>`;
}

function escapar(texto: string): string {
  return texto.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

/**
 * Tipo de cada contrato que aparece en los avisos. Por tandas: un `in` con
 * cientos de uuids desborda el largo de la URL de PostgREST.
 */
async function tiposDeContrato(supabase: SupabaseClient, alertas: Alerta[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(
    alertas.map((a) => idContratoDeHref(a.href)).filter((id): id is string => id !== null)
  ));
  const tipos = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase.from("contratos").select("id, tipo").in("id", ids.slice(i, i + 100));
    for (const fila of (data ?? []) as { id: string; tipo: string | null }[]) {
      if (fila.tipo) tipos.set(fila.id, fila.tipo);
    }
  }
  return tipos;
}

/** Una sola tanda de consultas para todo el envío del día. */
export async function cargarDatosResumen(supabase: SupabaseClient): Promise<DatosResumen> {
  const hoy = hoyISO();
  const [todas, diligencias] = await Promise.all([
    getAlertas(supabase),
    lineasDiligencias(supabase, hoy),
  ]);
  // Un vencimiento cerrado (se renovó, no se renueva…) ya no se avisa.
  const alertas = alertasAbiertas(todas);
  return { hoy, alertas, diligencias, tiposContrato: await tiposDeContrato(supabase, alertas) };
}

function lineaDesdeAlerta(a: Alerta, base: string): LineaCorreo {
  return {
    fecha: a.fecha,
    dias: a.dias,
    etiqueta: a.nombre || a.etiqueta,
    detalle: a.vencido ? `${a.etiqueta} — ya venció` : a.etiqueta,
    href: base ? `${base}${a.href}` : null,
    critico: nivelAlerta(a.dias) === "critico",
  };
}

/**
 * Maqueta el resumen para un destinatario. Es pura: no consulta nada.
 *
 * `perfilId` antepone lo que está asignado a esa persona. Antes el correo era
 * el mismo resumen global para todos y nadie respondía por ninguna diligencia
 * en concreto.
 *
 * `acceso` recorta el resumen a las áreas que esa persona puede abrir en la
 * app. Sin él sale completo: es el caso de los CC, que no tienen cuenta.
 */
export function renderizarResumen(
  datos: DatosResumen,
  opciones: { categorias?: Record<string, boolean>; perfilId?: string | null; acceso?: Acceso } = {}
): ResumenCorreo {
  const base = baseUrl();
  const incluyeVencimiento = opciones.categorias?.vencimiento !== false;
  const incluyeDiligencia = opciones.categorias?.diligencia !== false;

  const { acceso } = opciones;
  const alertasVisibles = acceso ? filtrarAlertas(datos.alertas, acceso, datos.tiposContrato) : datos.alertas;
  const diligenciasVisibles = !acceso || puedeRecibirDiligencias(acceso) ? datos.diligencias : [];

  const vencimientos = incluyeVencimiento ? alertasVisibles.map((a) => lineaDesdeAlerta(a, base)) : [];
  const diligencias = incluyeDiligencia ? diligenciasVisibles : [];

  const mias = opciones.perfilId
    ? diligencias.filter((l) => l.responsableId === opciones.perfilId)
    : [];
  const clavesMias = new Set(mias.map((l) => `${l.fecha}|${l.etiqueta}`));
  const restoDiligencias = diligencias.filter((l) => !clavesMias.has(`${l.fecha}|${l.etiqueta}`));

  const sinCerrar = restoDiligencias.filter((l) => l.dias < 0);
  const proximas = restoDiligencias.filter((l) => l.dias >= 0);
  const yaVencidos = vencimientos.filter((l) => l.dias < 0);
  const porVencer = vencimientos.filter((l) => l.dias >= 0);

  const total = vencimientos.length + diligencias.length;
  const vacio = total === 0;
  const criticos = [...vencimientos, ...diligencias].filter((l) => l.critico).length;

  const partes: string[] = [];
  if (mias.length > 0) partes.push(`${mias.length} a tu cargo`);
  if (vencimientos.length > 0) partes.push(`${vencimientos.length} vencimiento(s)`);
  if (diligencias.length - mias.length > 0) partes.push(`${diligencias.length - mias.length} diligencia(s)`);

  const asunto = vacio
    ? "Cavala — sin pendientes"
    : `Cavala — ${partes.join(", ")}${criticos ? ` · ${criticos} urgente(s)` : ""}`;

  const cuerpo = vacio
    ? `<p style="color:#334155;">No hay pendientes en las categorías que tienes habilitadas.</p>`
    : tabla("A tu cargo", mias) +
      tabla("Diligencias que pasaron sin cerrar", sinCerrar) +
      tabla("Diligencias y audiencias", proximas) +
      tabla("Ya vencidos", yaVencidos) +
      tabla("Vencimientos próximos (60 días)", porVencer);

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#ffffff;">
    <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin:0;">Inversiones Cavala · Gestión legal</p>
    <h1 style="font-size:20px;color:#0f172a;margin:6px 0 2px;">Resumen del ${fechaLarga(datos.hoy)}</h1>
    ${cuerpo}
    ${base ? `<p style="margin-top:24px;"><a href="${base}/dashboard" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;">Abrir el sistema</a></p>` : ""}
    <p style="color:#94a3b8;font-size:11px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px;">
      Correo automático según tus preferencias de notificación. Una diligencia deja de aparecer cuando se cierra en su expediente.
    </p>
  </div>`;

  return { asunto, html, vencimientos: vencimientos.length, diligencias: diligencias.length, vacio };
}
