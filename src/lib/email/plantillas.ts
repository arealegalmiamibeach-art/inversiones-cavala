import "server-only";

function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caracter) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[caracter]!);
}

export function emailInvitacion({
  nombre,
  enlace,
  tipo = "invitacion",
}: {
  nombre?: string | null;
  enlace: string;
  tipo?: "invitacion" | "recuperacion";
}): string {
  const saludo = nombre ? `Hola, ${escaparHtml(nombre)}` : "Hola";
  const enlaceSeguro = escaparHtml(enlace);
  const recuperacion = tipo === "recuperacion";
  const titulo = recuperacion ? "Restablece tu contraseña" : "Tienes una invitación";
  const descripcion = recuperacion
    ? "Recibimos una solicitud para cambiar la contraseña de tu cuenta en el sistema de Inversiones Cavala."
    : "Un administrador te ha dado acceso al sistema de gestión legal y documental de Inversiones Cavala. Crea tu contraseña para activar la cuenta.";
  const accion = recuperacion ? "Cambiar mi contraseña" : "Crear mi contraseña";
  const ayuda = recuperacion
    ? "Este enlace es de un solo uso. Si no solicitaste el cambio, puedes ignorar este correo y tu contraseña seguirá igual."
    : "Este enlace es de un solo uso. Si no esperabas esta invitación, puedes ignorar este correo.";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${titulo} — Cavala</title>
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 16px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Logo / cabecera -->
        <tr>
          <td style="padding-bottom:28px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#1a2433;border-radius:12px;padding:10px 14px;">
                  <span style="color:#fff;font-size:13px;font-weight:600;letter-spacing:0.04em;">
                    CAVALA &mdash; Gestión legal documentaria
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Tarjeta principal -->
        <tr>
          <td style="background:#161c28;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:36px 32px;">

            <p style="margin:0 0 6px 0;color:#6ee7b7;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;">
              ${recuperacion ? "Seguridad de la cuenta" : "Acceso privado"}
            </p>
            <h1 style="margin:0 0 16px 0;color:#f0f6ff;font-size:24px;font-weight:700;line-height:1.25;letter-spacing:-0.02em;">
              ${saludo}. ${titulo}
            </h1>
            <p style="margin:0 0 28px 0;color:rgba(240,246,255,0.55);font-size:14px;line-height:1.6;">
              ${descripcion}
            </p>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#16a34a;border-radius:10px;">
                  <a href="${enlaceSeguro}"
                     style="display:inline-block;padding:13px 28px;color:#fff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.01em;">
                    ${accion}
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0 0;color:rgba(240,246,255,0.3);font-size:12px;line-height:1.5;">
              ${ayuda}
            </p>

            <!-- Enlace texto por si el botón no carga -->
            <p style="margin:12px 0 0 0;color:rgba(240,246,255,0.2);font-size:11px;word-break:break-all;">
              ${enlaceSeguro}
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding-top:20px;text-align:center;">
            <p style="margin:0;color:rgba(240,246,255,0.2);font-size:11px;">
              Inversiones Cavala &mdash; Sistema interno de gestión
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
