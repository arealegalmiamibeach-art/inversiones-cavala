import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cargarDatosResumen, renderizarResumen } from "@/lib/alertas/resumen-correo";
import { enviarCorreo } from "@/lib/email/enviar";
import { ROL_LABEL, SECCIONES, type Acceso, type NivelAcceso, type Permisos, type Rol } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PerfilCorreo = {
  id: string;
  correo: string | null;
  rol: string | null;
  notificaciones_email: boolean;
  correo_categorias: Record<string, boolean> | null;
};

const CATEGORIAS_DEFAULT: Record<string, boolean> = {
  vencimiento: true,
  diligencia: true,
  actualizacion: true,
  informativo: true,
};

function normalizarCategorias(categorias: Record<string, boolean> | null): Record<string, boolean> {
  return Object.fromEntries(
    Object.keys(CATEGORIAS_DEFAULT).map((categoria) => [
      categoria,
      typeof categorias?.[categoria] === "boolean"
        ? categorias[categoria]
        : CATEGORIAS_DEFAULT[categoria],
    ])
  );
}

const NIVELES: readonly string[] = ["administrar", "visualizar", "sin_acceso"];

function esRol(valor: unknown): valor is Rol {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(ROL_LABEL, valor);
}

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Fallar cerrado: `x-vercel-cron` es un header que cualquier cliente puede
  // falsificar. Vercel envía CRON_SECRET como Bearer cuando está configurado.
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function ejecutar(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  const { data: perfiles } = await supabase
    .from("perfiles")
    .select("id, correo, rol, notificaciones_email, correo_categorias")
    .eq("activo", true);

  const destinatariosActivos = ((perfiles ?? []) as PerfilCorreo[]).filter(
    (p) => p.correo && p.notificaciones_email
  );

  const correosActivos = new Set(destinatariosActivos.map((perfil) => perfil.correo!.trim().toLowerCase()));
  const cc = Array.from(new Set(
    (process.env.ALERTAS_CC ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  )).filter((correo) => !correosActivos.has(correo));

  // Este cliente se salta la RLS: lo que cada persona puede abrir en la app hay
  // que recortarlo aquí, con los mismos permisos por área que usa el layout.
  // Si no se pueden leer, no se manda nada: peor que un día sin correo es un
  // correo con datos de personal a quien no debe verlos.
  const { data: filasPermisos, error: errorPermisos } = await supabase
    .from("permisos_usuario")
    .select("usuario_id, seccion, nivel");
  if (errorPermisos && errorPermisos.code !== "42P01" && errorPermisos.code !== "PGRST205") {
    return NextResponse.json({ error: "No se pudieron cargar los permisos por área" }, { status: 500 });
  }
  const permisosPorUsuario = new Map<string, Permisos>();
  for (const fila of (filasPermisos ?? []) as { usuario_id: string; seccion: string; nivel: string }[]) {
    if (!(SECCIONES as string[]).includes(fila.seccion) || !NIVELES.includes(fila.nivel)) continue;
    const acumulados = permisosPorUsuario.get(fila.usuario_id) ?? {};
    acumulados[fila.seccion as (typeof SECCIONES)[number]] = fila.nivel as NivelAcceso;
    permisosPorUsuario.set(fila.usuario_id, acumulados);
  }

  // Las consultas se hacen una sola vez: la maquetación por destinatario es pura.
  const datos = await cargarDatosResumen(supabase);
  const resumenCompleto = renderizarResumen(datos);

  if (resumenCompleto.vacio && process.env.ALERTAS_SOLO_CON_PENDIENTES === "1") {
    return NextResponse.json({
      ok: true,
      enviado: false,
      motivo: "sin pendientes",
      destinatarios: destinatariosActivos.length + cc.length,
    });
  }

  let enviados = 0;
  let fallidos = 0;

  // Un correo por persona: cada quien ve primero las diligencias que tiene
  // asignadas. Antes se agrupaba por preferencias y todos recibían el mismo
  // resumen global, así que ninguna diligencia tenía dueño.
  for (const perfil of destinatariosActivos) {
    const acceso: Acceso = {
      rol: esRol(perfil.rol) ? perfil.rol : null,
      permisos: permisosPorUsuario.get(perfil.id) ?? {},
    };
    const resumen = renderizarResumen(datos, {
      categorias: normalizarCategorias(perfil.correo_categorias),
      perfilId: perfil.id,
      acceso,
    });
    if (resumen.vacio) continue;

    const envio = await enviarCorreo({
      to: [perfil.correo!],
      subject: resumen.asunto,
      html: resumen.html,
      replyTo: process.env.ALERTAS_REPLY_TO,
    });

    if (envio.enviado) enviados += 1;
    else fallidos += 1;
  }

  // Los CC reciben un único resumen completo. Antes se añadían a cada grupo
  // de preferencias y podían recibir el mismo cron varias veces por día.
  if (cc.length > 0) {
    const envio = await enviarCorreo({
      to: cc,
      subject: resumenCompleto.asunto,
      html: resumenCompleto.html,
      replyTo: process.env.ALERTAS_REPLY_TO,
    });
    if (envio.enviado) enviados += cc.length;
    else fallidos += cc.length;
  }

  return NextResponse.json({
    ok: true,
    destinatarios: destinatariosActivos.length + cc.length,
    enviados,
    fallidos,
    vencimientos: resumenCompleto.vencimientos,
    diligencias: resumenCompleto.diligencias,
  });
}

export async function GET(request: Request) {
  return ejecutar(request);
}

export async function POST(request: Request) {
  return ejecutar(request);
}
