import "server-only";

/**
 * Envío de correo por la API de Resend (https://resend.com). Sin SDK: una
 * llamada `fetch` basta y no suma dependencias.
 *
 * Si falta `RESEND_API_KEY` no lanza: registra en consola y devuelve
 * `{ enviado: false }`. Así el cron se puede probar antes de configurar el
 * proveedor, y un problema de correo nunca tumba el resto del job.
 */

const ENDPOINT = "https://api.resend.com/emails";

export type ResultadoCorreo = { enviado: boolean; id?: string; motivo?: string };

export async function enviarCorreo(opts: {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<ResultadoCorreo> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "Inversiones Cavala <onboarding@resend.dev>";

  const destinatarios = opts.to.map((d) => d.trim()).filter(Boolean);
  if (destinatarios.length === 0) return { enviado: false, motivo: "sin destinatarios" };

  if (!apiKey) {
    console.warn(`[correo] RESEND_API_KEY no configurada — no se envía "${opts.subject}" a ${destinatarios.join(", ")}`);
    return { enviado: false, motivo: "RESEND_API_KEY no configurada" };
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: destinatarios,
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      console.error(`[correo] Resend respondió ${res.status}: ${texto}`);
      return { enviado: false, motivo: `Resend ${res.status}` };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { enviado: true, id: data.id };
  } catch (error) {
    console.error("[correo] fallo al llamar a Resend:", error);
    return { enviado: false, motivo: "error de red" };
  }
}
