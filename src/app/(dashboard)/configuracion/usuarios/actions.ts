"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRol } from "@/lib/auth/perfil";
import { enviarCorreo } from "@/lib/email/enviar";
import { emailInvitacion } from "@/lib/email/plantillas";
import { construirEnlaceConfirmacion } from "@/lib/auth/enlace-confirmacion";
import { esUuid } from "@/lib/contratos/adendas";
import { normalizarPermisos, puedeAdministrarSeccion, SECCIONES, type Permisos, type Rol } from "@/lib/auth/roles";

type Resultado = { ok: boolean; error?: string; advertencia?: string };

const ROLES = new Set<Rol>(["administrador", "tesoreria", "soporte_documentario"]);
const CATEGORIAS_CORREO = ["vencimiento", "diligencia", "actualizacion", "informativo"] as const;

function rolValido(rol: unknown): rol is Rol {
  return typeof rol === "string" && ROLES.has(rol as Rol);
}

function correoNormalizado(correo: string): string | null {
  const valor = correo.trim().toLowerCase();
  if (valor.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) return null;
  return valor;
}

function nombreNormalizado(nombre?: string): string | null {
  const valor = nombre?.trim().replace(/\s+/g, " ") ?? "";
  return valor || null;
}

async function verificarAdmin(): Promise<Resultado | null> {
  const rol = await getRol();
  if (rol !== "administrador") return { ok: false, error: "No autorizado" };
  return null;
}

async function getUsuarioActualId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function listarUsuarios() {
  const denied = await verificarAdmin();
  if (denied) return [];
  let admin;
  try { admin = createAdminClient(); } catch { throw new Error("Falta configurar el servicio de administración de usuarios"); }

  const [actualId, { data: perfiles, error: perfilesError }, { data: authData, error: authError }, { data: permisos, error: permisosError }] = await Promise.all([
    getUsuarioActualId(),
    admin
      .from("perfiles")
      .select("id, correo, nombre, rol, activo, notificaciones_email, correo_categorias")
      .order("nombre", { ascending: true, nullsFirst: false }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("permisos_usuario").select("usuario_id, seccion, nivel"),
  ]);

  if (perfilesError || authError) throw new Error("No se pudo cargar el directorio de usuarios");
  if (permisosError && permisosError.code !== "42P01" && permisosError.code !== "PGRST205") {
    throw new Error("No se pudieron cargar los permisos");
  }

  const confirmados = new Set(
    (authData?.users ?? [])
      .filter((u) => u.email_confirmed_at)
      .map((u) => u.id)
  );
  const permisosPorUsuario = new Map<string, Permisos>();
  for (const permiso of permisos ?? []) {
    const acumulados = permisosPorUsuario.get(permiso.usuario_id) ?? {};
    acumulados[permiso.seccion as typeof SECCIONES[number]] = permiso.nivel;
    permisosPorUsuario.set(permiso.usuario_id, acumulados);
  }

  return (perfiles ?? []).map((p) => ({
    ...p,
    confirmado: confirmados.has(p.id),
    esActual: p.id === actualId,
    permisos: normalizarPermisos(p.rol as Rol | null, permisosPorUsuario.get(p.id)),
    permisosDisponibles: !permisosError,
  }));
}

export async function guardarPermisosUsuario(userId: string, permisos: Permisos): Promise<Resultado> {
  const denied = await verificarAdmin();
  if (denied) return denied;
  if (!esUuid(userId) || !permisos || typeof permisos !== "object" || Array.isArray(permisos)
    || Object.entries(permisos).some(([seccion, nivel]) => {
      const area = seccion as typeof SECCIONES[number];
      return !SECCIONES.includes(area)
        || !["administrar", "visualizar", "sin_acceso"].includes(nivel)
        || (nivel === "administrar" && !puedeAdministrarSeccion(area));
    })) {
    return { ok: false, error: "Los permisos enviados no son válidos" };
  }
  const supabase = await createClient();
  const { data: perfil, error: perfilError } = await supabase.from("perfiles").select("rol").eq("id", userId).maybeSingle();
  if (perfilError || !rolValido(perfil?.rol)) return { ok: false, error: "El usuario no tiene un rol válido" };
  const normalizados = normalizarPermisos(perfil.rol, permisos);
  const { error } = await supabase.rpc("guardar_permisos_usuario", { p_usuario: userId, p_permisos: normalizados });
  if (error) return { ok: false, error: error.code === "PGRST202" ? "Falta aplicar la migración de permisos por área" : error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cambiarRol(userId: string, nuevoRol: Rol): Promise<Resultado> {
  const denied = await verificarAdmin();
  if (denied) return denied;
  if (!esUuid(userId) || !rolValido(nuevoRol)) return { ok: false, error: "Datos de usuario inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cambiar_rol_usuario", { p_usuario: userId, p_rol: nuevoRol });
  if (error) return {
    ok: false,
    error: error.code === "PGRST202" ? "Falta aplicar la actualización de gestión de roles" : error.message,
  };
  revalidatePath("/configuracion/usuarios");
  return { ok: true };
}

export async function toggleActivo(userId: string, activo: boolean): Promise<Resultado> {
  const denied = await verificarAdmin();
  if (denied) return denied;
  if (!esUuid(userId) || typeof activo !== "boolean") return { ok: false, error: "Datos de usuario inválidos" };

  if (!activo) {
    const actualId = await getUsuarioActualId();
    if (actualId === userId) {
      return { ok: false, error: "No puedes desactivar tu propia cuenta" };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("perfiles")
    .update({ activo })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracion/usuarios");
  return { ok: true };
}

export async function toggleNotificacionesEmail(userId: string, activo: boolean): Promise<Resultado> {
  const denied = await verificarAdmin();
  if (denied) return denied;
  if (!esUuid(userId) || typeof activo !== "boolean") return { ok: false, error: "Datos de usuario inválidos" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("perfiles")
    .update({ notificaciones_email: activo })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracion/usuarios");
  return { ok: true };
}

export async function actualizarCategoriasCorreo(
  userId: string,
  categorias: Record<string, boolean>
): Promise<Resultado> {
  const denied = await verificarAdmin();
  if (denied) return denied;
  if (!esUuid(userId)) return { ok: false, error: "Usuario inválido" };
  const categoriasNormalizadas = Object.fromEntries(
    CATEGORIAS_CORREO.map((categoria) => [categoria, categorias?.[categoria] === true])
  );
  const supabase = await createClient();
  const { error } = await supabase
    .from("perfiles")
    .update({ correo_categorias: categoriasNormalizadas })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracion/usuarios");
  return { ok: true };
}

export async function editarNombreUsuario(userId: string, nombre: string): Promise<Resultado> {
  const denied = await verificarAdmin();
  if (denied) return denied;
  if (!esUuid(userId)) return { ok: false, error: "Usuario inválido" };
  const nombreLimpio = nombreNormalizado(nombre);
  if (nombreLimpio && nombreLimpio.length > 120) return { ok: false, error: "El nombre no puede pasar de 120 caracteres" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("perfiles")
    .update({ nombre: nombreLimpio })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracion/usuarios");
  return { ok: true };
}

export async function enviarResetContrasena(userId: string): Promise<Resultado> {
  const denied = await verificarAdmin();
  if (denied) return denied;
  if (!esUuid(userId)) return { ok: false, error: "Usuario inválido" };

  let admin;
  try { admin = createAdminClient(); } catch {
    return { ok: false, error: "Configuración de servicio incompleta" };
  }

  const { data: perfil } = await admin
    .from("perfiles")
    .select("correo, nombre")
    .eq("id", userId)
    .single();

  if (!perfil?.correo) return { ok: false, error: "Usuario sin correo registrado" };

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(userId);
  if (authError || !authUser.user) return { ok: false, error: "No se encontró el usuario en autenticación" };
  const confirmado = !!authUser?.user?.email_confirmed_at;

  // No confirmado → re-enviar invitación; confirmado → recovery link
  const tipoLink = confirmado ? "recovery" : "invite";

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: tipoLink,
    email: perfil.correo,
    options: { redirectTo: `${appUrl}/update-password` },
  });
  if (linkError) return { ok: false, error: linkError.message };

  const enlace = construirEnlaceConfirmacion({
    appUrl,
    tokenHash: linkData.properties.hashed_token,
    type: tipoLink,
  });

  const envio = await enviarCorreo({
    to: [perfil.correo],
    subject: confirmado
      ? "Restablecer contraseña — Cavala"
      : "Tu invitación al sistema de gestión Cavala",
    html: emailInvitacion({
      nombre: perfil.nombre ?? null,
      enlace,
      tipo: confirmado ? "recuperacion" : "invitacion",
    }),
  });

  if (!envio.enviado) {
    return { ok: false, error: `No se pudo enviar el correo (${envio.motivo ?? "proveedor no configurado"}). Verifica la configuración de correo.` };
  }
  return { ok: true };
}

export async function invitarUsuario(correo: string, rol: Rol, nombre?: string): Promise<Resultado> {
  const denied = await verificarAdmin();
  if (denied) return denied;
  const correoLimpio = correoNormalizado(correo);
  if (!correoLimpio) return { ok: false, error: "Correo inválido" };
  if (!rolValido(rol)) return { ok: false, error: "Rol inválido" };
  const nombreLimpio = nombreNormalizado(nombre);
  if (nombreLimpio && nombreLimpio.length > 120) return { ok: false, error: "El nombre no puede pasar de 120 caracteres" };

  const supabase = await createClient();
  const { data: existente } = await supabase
    .from("perfiles")
    .select("id")
    .eq("correo", correoLimpio)
    .maybeSingle();

  if (existente) return { ok: false, error: "Ese correo ya tiene cuenta" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Configuración de servicio incompleta (SUPABASE_SERVICE_ROLE_KEY)" };
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  // generateLink crea el usuario sin enviar email; nosotros lo enviamos con el proveedor configurado.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: correoLimpio,
    options: {
      data: { rol, nombre: nombreLimpio },
      redirectTo: `${appUrl}/update-password`,
    },
  });

  if (error) {
    if (error.message.includes("already")) return { ok: false, error: "Ese correo ya existe en auth" };
    return { ok: false, error: error.message };
  }

  if (!data.user) return { ok: false, error: "No se pudo crear el usuario" };

  const enlace = construirEnlaceConfirmacion({
    appUrl,
    tokenHash: data.properties.hashed_token,
    type: "invite",
  });

  const { error: perfilError } = await admin.from("perfiles").upsert({
    id: data.user.id,
    correo: correoLimpio,
    nombre: nombreLimpio,
    rol,
    activo: true,
    notificaciones_email: true,
    correo_categorias: { vencimiento: true, diligencia: true, actualizacion: true, informativo: true },
  });
  if (perfilError) {
    const { error: rollbackError } = await admin.auth.admin.deleteUser(data.user.id);
    return {
      ok: false,
      error: rollbackError
        ? "Se creó la cuenta, pero falló su perfil. Elimínala desde Supabase antes de reintentar."
        : "No se pudo crear el perfil del usuario. La cuenta parcial fue revertida.",
    };
  }

  const envio = await enviarCorreo({
    to: [correoLimpio],
    subject: "Tu invitación al sistema de gestión Cavala",
    html: emailInvitacion({ nombre: nombreLimpio, enlace }),
  });

  revalidatePath("/configuracion/usuarios");
  if (!envio.enviado) {
    return {
      ok: true,
      advertencia: `Usuario creado, pero el correo no se pudo enviar (${envio.motivo ?? "proveedor no configurado"}). Revisa la configuración de correo y usa "Re-enviar invitación".`,
    };
  }
  return { ok: true };
}

export async function eliminarUsuario(userId: string): Promise<Resultado> {
  const denied = await verificarAdmin();
  if (denied) return denied;
  if (!esUuid(userId)) return { ok: false, error: "Usuario inválido" };

  const actualId = await getUsuarioActualId();
  if (actualId === userId) return { ok: false, error: "No puedes eliminar tu propia cuenta" };

  let admin;
  try { admin = createAdminClient(); } catch {
    return { ok: false, error: "Configuración de servicio incompleta" };
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/configuracion/usuarios");
  return { ok: true };
}
