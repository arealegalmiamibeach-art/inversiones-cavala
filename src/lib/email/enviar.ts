import "server-only";

import { enviarCorreo as enviarPorResend } from "@/lib/email/resend";
import { enviarPorSmtp, smtpConfigurado } from "@/lib/email/smtp";

/**
 * Versión de texto plano del HTML. Sin ella el correo viaja sólo como HTML y
 * los clientes que lo leen "como texto" (Outlook con esa opción, filtros
 * corporativos) lo convierten solos y dejan el vínculo como `[dirección]Título`
 * en vez de un hipervínculo. Con una parte de texto propia el destinatario ve
 * `Título` y su dirección, legibles.
 */
export function htmlATexto(html: string): string {
  const entidades: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, texto: string) => {
      const limpio = texto.replace(/<[^>]+>/g, "").trim();
      return !limpio || limpio === href ? href : `${limpio} (${href})`;
    })
    .replace(/<\/(tr|h[1-6]|p|div|table)>/gi, "\n")
    .replace(/<\/td>/gi, "  ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => entidades[e] ?? e)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ResultadoCorreo = { enviado: boolean; id?: string; motivo?: string };

/**
 * Usa Gmail/SMTP cuando existen credenciales SMTP. Resend queda como respaldo
 * temporal para que el cambio de proveedor pueda desplegarse sin interrumpir
 * los correos mientras se cargan los secretos en Vercel.
 */
export async function enviarCorreo(opts: {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<ResultadoCorreo> {
  const completo = { ...opts, text: opts.text ?? htmlATexto(opts.html) };
  if (smtpConfigurado()) return enviarPorSmtp(completo);
  return enviarPorResend(completo);
}
