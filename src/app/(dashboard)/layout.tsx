import { redirect } from "next/navigation";
import { getPerfil, getUsuario } from "@/lib/auth/perfil";
import { RolProvider } from "@/lib/auth/rol-context";
import { AlertasProvider } from "@/lib/alertas-context";
import { getAlertasActuales } from "@/lib/alertas-server";
import { Sidebar } from "@/components/layout/sidebar";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { RouteTransitionOverlay } from "@/components/layout/route-transition-overlay";
import { LectorFloatingChat } from "@/components/lector-ia/lector-floating-chat";
import { LectorConversationProvider } from "@/lib/lector-ia/conversation-context";
import { SubidasProvider } from "@/components/ui/subidas-globales";
import { getLectorSession, getLectorStoredFiles } from "@/lib/lector-ia/server";
import { listarTiposCustom } from "@/app/(dashboard)/documentos/tipos-custom";
import { PropiedadesEliminadasProvider } from "@/components/ui/propiedades-eliminadas-context";
import { cargarPropiedadesNativasEliminadas } from "@/lib/propiedades-nativas";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, perfil] = await Promise.all([getUsuario(), getPerfil()]);

  if (!user) redirect("/login");

  // Alta segura: crear_perfil() registra la cuenta sin rol y desactivada.
  // mi_rol() devuelve NULL en la base y todas las políticas RLS niegan, así
  // que la UI debe reflejar lo mismo en vez de mostrar un dashboard vacío.
  if (!perfil?.activo || !perfil.rol) {
    return (
      <div className="relative flex h-[100dvh] min-w-0 items-center justify-center overflow-hidden p-6">
        <AuroraBackground />
        <div className="glass-panel relative z-10 max-w-sm rounded-2xl p-6 text-center">
          <p className="text-sm font-semibold text-white">Cuenta pendiente de activación</p>
          <p className="mt-2 text-xs text-white/50">
            Tu cuenta todavía no tiene un rol asignado. Pídele a un administrador que la active desde Supabase.
          </p>
        </div>
      </div>
    );
  }

  // getLectorStoredFiles depende de la sesión, pero no de alertas/tiposCustom/
  // propiedadesEliminadas. Al encadenar desde la misma promesa arranca en
  // cuanto la sesión está disponible, eliminando el tercer await secuencial.
  const lectorSessionPromise = getLectorSession();
  // Sin await: la campana la resuelve en el cliente y el resto de la página no
  // la espera (ver `AlertasProvider`).
  const alertas = getAlertasActuales();
  const [lectorSession, tiposCustom, propiedadesEliminadas, lectorStoredFiles] = await Promise.all([
    lectorSessionPromise,
    listarTiposCustom(),
    createClient().then(cargarPropiedadesNativasEliminadas),
    lectorSessionPromise.then((session) =>
      session ? getLectorStoredFiles(session.supabase) : []
    ),
  ]);

  return (
    <RolProvider rol={perfil.rol} permisos={perfil.permisos}>
      <PropiedadesEliminadasProvider inicial={propiedadesEliminadas}>
        <AlertasProvider alertas={alertas}>
          <SubidasProvider>
            <LectorConversationProvider>
              <div className="relative flex h-[100dvh] min-w-0 overflow-hidden">
                <AuroraBackground />
                <Sidebar
                  rol={perfil.rol}
                  permisos={perfil.permisos}
                  userEmail={user.email ?? undefined}
                  usuarioId={user.id}
                  lectorIaEnabled={Boolean(lectorSession)}
                  tiposCustom={tiposCustom.filter((tipo) => tipo.visible_sidebar)}
                />
                <main className="app-main scrollbar-glass relative z-10 min-w-0 flex-1 overflow-y-auto pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0">
                  {children}
                </main>
              </div>
              {lectorSession && (
                <LectorFloatingChat access={lectorSession.access} storedFiles={lectorStoredFiles} />
              )}
            </LectorConversationProvider>
          </SubidasProvider>
          <RouteTransitionOverlay />
        </AlertasProvider>
      </PropiedadesEliminadasProvider>
    </RolProvider>
  );
}
