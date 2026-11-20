import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rutaSegura } from "@/lib/auth/ruta-segura";

const TIPOS_PERMITIDOS = new Set(["invite", "recovery"] as const);
type TipoPermitido = "invite" | "recovery";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = rutaSegura(request.nextUrl.searchParams.get("next"), request.url);

  if (tokenHash && type && TIPOS_PERMITIDOS.has(type as TipoPermitido)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as TipoPermitido,
    });

    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL("/update-password?error=enlace-invalido", request.url));
}
