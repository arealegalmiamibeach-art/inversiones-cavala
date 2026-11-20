"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreo } from "@/lib/email/enviar";
import { emailInvitacion } from "@/lib/email/plantillas";
import { construirEnlaceConfirmacion } from "@/lib/auth/enlace-confirmacion";

const ERROR_ENVIO = "No se pudo enviar el enlace. Inténtalo nuevamente en unos minutos.";
const ERROR_ESPERA = "Ya solicitaste un enlace hace un momento. Espera un minuto antes de pedir otro.";
// Sin el límite del correo de Supabase, esto evita usar el formulario para llenar un buzón.
// `recovery_sent_at` se marca al generar el enlace, aunque el envío falle: por eso el
// aviso es explícito y no un falso "revisa tu bandeja".
const ESPERA_ENTRE_ENVIOS_MS = 60_000;

export async function resetPassword(correo: string): Promise<{ ok: boolean; error?: string }> {
  const normalizado = typeof correo === "string" ? correo.trim().toLowerCase() : "";
  if (normalizado.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) {
    return { ok: false, error: "Ingresa un correo válido" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    console.error("[recuperar] falta SUPABASE_SERVICE_ROLE_KEY");
    return { ok: false, error: ERROR_ENVIO };
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  // resetPasswordForEmail usa el correo integrado de Supabase, que responde 500
  // ("Error sending recovery email"). El enlace se genera aquí y se envía con el
  // mismo proveedor que las invitaciones.
  const { data: perfil } = await admin
    .from("perfiles")
    .select("id, nombre")
    .eq("correo", normalizado)
    .maybeSingle();

  if (perfil) {
    const { data: authUser } = await admin.auth.admin.getUserById(perfil.id);
    const ultimoEnvio = authUser?.user?.recovery_sent_at;
    if (ultimoEnvio && Date.now() - Date.parse(ultimoEnvio) < ESPERA_ENTRE_ENVIOS_MS) {
      return { ok: false, error: ERROR_ESPERA };
    }
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: normalizado,
    options: { redirectTo: `${appUrl}/update-password` },
  });

  // Correo sin cuenta: misma respuesta que un envío real, para no revelar quién está registrado.
  if (linkError?.code === "user_not_found") return { ok: true };
  if (linkError || !linkData) {
    console.error("[recuperar] no se pudo generar el enlace:", linkError?.code, linkError?.message);
    return { ok: false, error: ERROR_ENVIO };
  }

  const envio = await enviarCorreo({
    to: [normalizado],
    subject: "Restablecer contraseña — Cavala",
    html: emailInvitacion({
      nombre: perfil?.nombre ?? null,
      enlace: construirEnlaceConfirmacion({
        appUrl,
        tokenHash: linkData.properties.hashed_token,
        type: "recovery",
      }),
      tipo: "recuperacion",
    }),
  });

  if (!envio.enviado) return { ok: false, error: ERROR_ENVIO };
  return { ok: true };
}
