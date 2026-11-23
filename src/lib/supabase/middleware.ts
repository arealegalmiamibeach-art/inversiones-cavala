import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { nivelAcceso, seccionRuta, type Permisos, type Rol } from "@/lib/auth/roles";
import { HEADER_SESION, codificarSesion, type SesionHeader } from "@/lib/auth/sesion-header";
import { destinoSeguro } from "@/lib/auth/destino";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname.startsWith("/login");
  // Accessible without session (and NOT auto-redirected when authenticated)
  const isPublicAuthRoute =
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/update-password") ||
    pathname.startsWith("/auth/confirm");

  if (!user && !isLoginRoute && !isPublicAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Se recuerda adónde iba (p. ej. el enlace de una alerta del correo) para
    // llevarlo ahí después de iniciar sesión, en vez de al dashboard.
    const destino = `${pathname}${request.nextUrl.search}`;
    if (pathname !== "/" && !pathname.startsWith("/api/") && destinoSeguro(destino) === destino) {
      url.searchParams.set("next", destino);
    }
    return NextResponse.redirect(url);
  }

  // Only redirect away from /login, never from /update-password
  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    const [ruta, consulta = ""] = destinoSeguro(request.nextUrl.searchParams.get("next")).split("?");
    url.pathname = ruta;
    url.search = consulta ? `?${consulta}` : "";
    const response = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie);
    return response;
  }

  // El header de sesión que mande el navegador nunca se respeta: sólo vale el
  // que se arma aquí abajo con lo que se acaba de validar.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(HEADER_SESION);

  const seccion = seccionRuta(pathname);
  // Las rutas /api no renderizan layout: no pagan la consulta del perfil
  // salvo que la sección la exija para el control de acceso.
  if (user && (seccion || !pathname.startsWith("/api/"))) {
    const [{ data: perfil, error: errorPerfil }, { data: filas, error }] = await Promise.all([
      supabase.from("perfiles").select("id, correo, nombre, rol, activo").eq("id", user.id).maybeSingle(),
      supabase.from("permisos_usuario").select("seccion, nivel").eq("usuario_id", user.id),
    ]);
    const permisos = Object.fromEntries((filas ?? []).map((p) => [p.seccion, p.nivel])) as Permisos;
    const errorPermisos = error && error.code !== "42P01" && error.code !== "PGRST205";
    // Con cualquier error no se pasa nada: el servidor vuelve a consultar por
    // su cuenta (`getUsuario`/`getPerfil`), como antes de existir el header.
    if (!errorPerfil && !errorPermisos) {
      const sesion: SesionHeader = {
        usuario: { id: user.id, email: user.email ?? null },
        perfil: perfil ? { ...perfil, permisos } : null,
      };
      requestHeaders.set(HEADER_SESION, codificarSesion(sesion));
    }
    if (seccion && (errorPermisos || nivelAcceso(perfil?.activo ? perfil.rol as Rol : null, seccion, permisos) === "sin_acceso")) {
      const url = request.nextUrl.clone();
      url.pathname = "/configuracion/perfil";
      url.search = "?acceso=denegado";
      const response = NextResponse.redirect(url);
      for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie);
      return response;
    }
  }

  const respuesta = NextResponse.next({ request: { headers: requestHeaders } });
  for (const cookie of supabaseResponse.cookies.getAll()) respuesta.cookies.set(cookie);
  return respuesta;
}
