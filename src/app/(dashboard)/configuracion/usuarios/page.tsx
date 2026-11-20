import { redirect } from "next/navigation";
import { UsersRound } from "lucide-react";
import { getRol } from "@/lib/auth/perfil";
import { listarUsuarios } from "./actions";
import { UsuariosPanel } from "./usuarios-panel";

export default async function UsuariosPage() {
  if (await getRol() !== "administrador") redirect("/dashboard");
  const usuarios = await listarUsuarios();

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-400/20 bg-gradient-to-br from-brand-500/20 to-brand-600/10 text-brand-300">
          <UsersRound className="h-5 w-5" />
        </div>
        <div>
          <p className="mb-1 text-[10px] text-white/40">Configuración / Equipo y accesos</p>
          <h1 className="text-base font-semibold text-white">Gestión de usuarios</h1>
          <p className="mt-0.5 text-xs text-white/50">Gestiona tu equipo y define qué puede hacer cada persona.</p>
        </div>
      </header>
      <UsuariosPanel usuariosInicial={usuarios} />
    </div>
  );
}
