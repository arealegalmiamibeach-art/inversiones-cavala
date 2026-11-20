import "server-only";

type TipoConfirmacion = "invite" | "recovery";

export function construirEnlaceConfirmacion({
  appUrl,
  tokenHash,
  type,
}: {
  appUrl: string;
  tokenHash: string;
  type: TipoConfirmacion;
}): string {
  const enlace = new URL("/auth/confirm", appUrl);
  enlace.searchParams.set("token_hash", tokenHash);
  enlace.searchParams.set("type", type);
  enlace.searchParams.set("next", "/update-password");
  return enlace.toString();
}
