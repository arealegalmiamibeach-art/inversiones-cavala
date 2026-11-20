import "server-only";

import nodemailer from "nodemailer";

export type ResultadoSmtp = { enviado: boolean; id?: string; motivo?: string };

function leerPuerto(valor: string | undefined): number {
  const puerto = Number(valor ?? "465");
  return Number.isInteger(puerto) && puerto > 0 && puerto <= 65_535 ? puerto : 465;
}

export function smtpConfigurado(): boolean {
  return Boolean(process.env.SMTP_USER || process.env.SMTP_PASS);
}

export async function enviarPorSmtp(opts: {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<ResultadoSmtp> {
  const user = process.env.SMTP_USER?.trim();
  // Google muestra la clave de aplicación agrupada con espacios. SMTP espera
  // únicamente sus 16 caracteres.
  const pass = process.env.SMTP_PASS?.replace(/\s/g, "");

  if (!user || !pass) {
    console.error("[correo] configuración SMTP incompleta");
    return { enviado: false, motivo: "configuración SMTP incompleta" };
  }

  const destinatarios = Array.from(
    new Set(opts.to.map((destinatario) => destinatario.trim().toLowerCase()).filter(Boolean))
  );
  if (destinatarios.length === 0) {
    return { enviado: false, motivo: "sin destinatarios" };
  }

  const port = leerPuerto(process.env.SMTP_PORT);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM?.trim() || `Inversiones Cavala <${user}>`,
      // Cuando hay varias personas, BCC evita revelar sus direcciones entre sí.
      ...(destinatarios.length === 1
        ? { to: destinatarios[0] }
        : { to: `Inversiones Cavala <${user}>`, bcc: destinatarios }),
      subject: opts.subject,
      html: opts.html,
      ...(opts.text ? { text: opts.text } : {}),
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });

    if (info.accepted.length === 0) {
      return { enviado: false, motivo: "Gmail rechazó los destinatarios" };
    }

    return { enviado: true, id: info.messageId };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "error SMTP";
    console.error(`[correo] fallo al enviar por Gmail SMTP (${code})`);
    return { enviado: false, motivo: code };
  }
}
