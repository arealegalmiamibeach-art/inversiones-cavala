"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Loader2, LockKeyhole, RotateCcw, Save, Search, ShieldCheck, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  nivelAcceso,
  nivelBaseRol,
  normalizarPermisos,
  puedeAdministrarSeccion,
  SECCIONES,
  type NivelAcceso,
  type Permisos,
  type Rol,
  type Seccion,
} from "@/lib/auth/roles";
import { guardarPermisosUsuario, type listarUsuarios } from "./actions";

type Usuario = Awaited<ReturnType<typeof listarUsuarios>>[number];
const AREAS = {
  dashboard: ["Dashboard", "Resumen de las áreas autorizadas"],
  riesgo: ["Análisis de riesgo", "Informes con datos de las áreas autorizadas"],
  propietarios: ["Propietarios", "Personas y empresas"],
  predios: ["Predios", "Inmuebles y partidas"],
  vehiculos: ["Vehículos", "Flota y vencimientos"],
  concesiones: ["Concesiones mineras", "Derechos y registros mineros"],
  personal: ["Personal", "Información del equipo"],
  oficinas: ["Oficinas registrales", "Directorio de oficinas"],
  procesos: ["Procesos judiciales", "Expedientes y diligencias"],
  documentos: ["Documentos", "Biblioteca y archivos adjuntos"],
  contratos: ["Contratos", "Contratos, adendas y resoluciones"],
} as const;
const NIVELES = [
  { valor: "administrar", nombre: "Administrar", descripcion: "Ver, crear, editar y eliminar", icono: ShieldCheck },
  { valor: "visualizar", nombre: "Visualizar", descripcion: "Consulta sin cambios", icono: Eye },
  { valor: "sin_acceso", nombre: "Sin acceso", descripcion: "Área oculta para el usuario", icono: EyeOff },
] as const;
const ROL_NOMBRE: Record<Rol, string> = { administrador: "Administrador", tesoreria: "Tesorería y contabilidad", soporte_documentario: "Soporte documentario" };

function nombreNivel(nivel: NivelAcceso) {
  return NIVELES.find((item) => item.valor === nivel)?.nombre ?? nivel;
}

export function PermisosEditor({ usuarios, seleccionado, onSeleccionar, onGuardado, onDirty }: {
  usuarios: Usuario[];
  seleccionado: string | null;
  onSeleccionar: (id: string) => void;
  onGuardado: (id: string, permisos: Permisos) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const usuario = usuarios.find((u) => u.id === seleccionado);
  const [busqueda, setBusqueda] = useState("");
  const visibles = usuarios.filter((u) => `${u.nombre ?? ""} ${u.correo ?? ""}`.toLocaleLowerCase("es").includes(busqueda.toLocaleLowerCase("es")));

  return (
    <section className="records-card overflow-hidden">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">Acceso por persona y área</h2>
        <p className="mt-1 text-xs leading-5 text-white/45">Selecciona una persona para revisar su acceso efectivo y definir excepciones a su rol.</p>
      </div>
      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-white/10 bg-white/[0.02] p-3 lg:border-b-0 lg:border-r">
          <label className="relative mb-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
            <span className="sr-only">Buscar persona para editar permisos</span>
            <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar persona…" className="view-control pl-9" />
          </label>
          <div className="scrollbar-glass flex gap-1 overflow-x-auto lg:max-h-[720px] lg:flex-col lg:overflow-y-auto">
            {visibles.map((u) => (
              <button key={u.id} type="button" onClick={() => onSeleccionar(u.id)} aria-pressed={u.id === seleccionado}
                className={cn("flex min-w-48 items-center gap-2.5 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 lg:min-w-0", u.id === seleccionado ? "border-brand-400/25 bg-brand-500/10" : "border-transparent hover:bg-white/[0.04]")}>
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", u.id === seleccionado ? "bg-brand-500/20 text-brand-200" : "bg-white/[0.06] text-white/55")}>{(u.nombre?.[0] ?? u.correo?.[0] ?? "?").toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-white/85">{u.nombre || u.correo || "Sin nombre"}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-white/40">{ROL_NOMBRE[u.rol as Rol] ?? "Sin rol"}</span>
                </span>
                {u.id === seleccionado && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />}
              </button>
            ))}
            {visibles.length === 0 && <p className="px-3 py-6 text-xs text-white/40">No hay personas que coincidan.</p>}
          </div>
        </aside>
        {usuario ? (
          <PermisosPersona key={usuario.id} usuario={usuario} onGuardado={onGuardado} onDirty={onDirty} />
        ) : (
          <div className="flex min-h-80 flex-col items-center justify-center gap-3 p-6 text-white/40">
            <UsersRound className="h-7 w-7" /><p className="text-sm">Selecciona una persona para gestionar su acceso.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PermisosPersona({ usuario, onGuardado, onDirty }: {
  usuario: Usuario;
  onGuardado: (id: string, permisos: Permisos) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const permisosIniciales = normalizarPermisos(usuario.rol as Rol | null, usuario.permisos);
  const [guardados, setGuardados] = useState<Permisos>(permisosIniciales);
  const [draft, setDraft] = useState<Permisos>(permisosIniciales);
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ error: boolean; texto: string } | null>(null);
  const cambios = SECCIONES.filter((s) => draft[s] !== guardados[s]).length;
  const admin = usuario.rol === "administrador";
  const bloqueado = admin || !usuario.rol || !usuario.permisosDisponibles;
  const visibles = SECCIONES.filter((s) => nivelAcceso(usuario.rol as Rol, s, draft) !== "sin_acceso").length;
  const personalizados = Object.keys(draft).length;

  useEffect(() => { onDirty(cambios > 0); }, [cambios, onDirty]);
  useEffect(() => {
    if (!cambios) return;
    const avisar = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [cambios]);

  function actualizarNivel(seccion: Seccion, nivel: NivelAcceso) {
    setDraft((actual) => {
      const siguiente = { ...actual };
      if (nivel === nivelBaseRol(usuario.rol as Rol | null, seccion)) delete siguiente[seccion];
      else siguiente[seccion] = nivel;
      return siguiente;
    });
    setMensaje(null);
  }

  function restaurarArea(seccion: Seccion) {
    setDraft((actual) => {
      const siguiente = { ...actual };
      delete siguiente[seccion];
      return siguiente;
    });
    setMensaje(null);
  }

  function guardar() {
    startTransition(async () => {
      try {
        const res = await guardarPermisosUsuario(usuario.id, draft);
        if (!res.ok) { setMensaje({ error: true, texto: res.error ?? "No se pudieron guardar los permisos" }); return; }
        setGuardados(draft);
        onGuardado(usuario.id, draft);
        onDirty(false);
        setMensaje({ error: false, texto: "Permisos guardados. El nuevo acceso se aplicará en la próxima solicitud del usuario." });
        router.refresh();
      } catch { setMensaje({ error: true, texto: "No se pudo guardar. Tus cambios siguen aquí; vuelve a intentarlo." }); }
    });
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{usuario.nombre || "Sin nombre"}</h3>
          <p className="mt-1 break-all text-[11px] text-white/45">{usuario.correo}</p>
          <p className="mt-2 text-[10px] text-white/40">
            Rol: {usuario.rol ? ROL_NOMBRE[usuario.rol as Rol] : "Sin rol"} · {visibles} de {SECCIONES.length} áreas visibles · {personalizados ? `${personalizados} excepción${personalizados === 1 ? "" : "es"} personal${personalizados === 1 ? "" : "es"}` : "Sin excepciones"}
          </p>
        </div>
        <button type="button" disabled={bloqueado || pending || !Object.keys(draft).length} onClick={() => { setDraft({}); setMensaje(null); }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] text-white/50 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-35">
          <RotateCcw className="h-3.5 w-3.5" /> Restaurar valores del rol
        </button>
      </div>

      {bloqueado && <p className="flex items-start gap-2 border-b border-white/[0.08] bg-white/[0.025] px-5 py-3 text-xs leading-5 text-white/55"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />{admin ? "Los administradores conservan el control total del sistema. Para limitar esta cuenta, asígnale otro rol desde el directorio." : !usuario.rol ? "Asigna un rol a esta persona desde el directorio para configurar sus permisos." : "El editor estará disponible cuando se aplique la migración de permisos por área."}</p>}
      {!usuario.activo && <p className="px-5 pt-3 text-xs text-amber-200/80">Cuenta inactiva. Estos permisos se aplicarán cuando la reactives.</p>}

      <div className="divide-y divide-white/[0.06] sm:hidden">
        <p className="px-4 py-3 text-[11px] leading-5 text-white/45">La opción marcada es el acceso efectivo. Al elegir el valor original del rol se elimina la excepción personal.</p>
        {SECCIONES.map((seccion) => (
          <fieldset key={seccion} disabled={bloqueado || pending} className="min-w-0 px-4 py-3">
            <legend className="sr-only">{AREAS[seccion][0]}</legend>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-white/80">{AREAS[seccion][0]}</p>
                <p className="mt-0.5 text-[9px] text-white/35">{draft[seccion] ? "Excepción personal" : `Heredado: ${nombreNivel(nivelBaseRol(usuario.rol as Rol | null, seccion))}`}</p>
              </div>
              {draft[seccion] && <button type="button" onClick={() => restaurarArea(seccion)} className="rounded px-2 py-1 text-[9px] text-brand-300 hover:bg-brand-500/10">Usar rol</button>}
            </div>
            <div className={cn("grid gap-1.5", puedeAdministrarSeccion(seccion) ? "grid-cols-3" : "grid-cols-2")}>
              {NIVELES.filter(({ valor }) => valor !== "administrar" || puedeAdministrarSeccion(seccion)).map(({ valor, nombre }) => {
                const elegido = nivelAcceso(usuario.rol as Rol, seccion, draft) === valor;
                return <label key={valor} className={cn("relative flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-lg border px-1 text-[10px]", elegido ? "border-brand-400/40 bg-brand-500/15 text-brand-200" : "border-white/10 text-white/45", bloqueado && "opacity-50")}>
                  <input type="radio" name={`movil-${usuario.id}-${seccion}`} value={valor} checked={elegido} aria-label={`${AREAS[seccion][0]}: ${nombre}`}
                    onChange={() => actualizarNivel(seccion, valor)}
                    className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
                  {elegido && <Check className="h-3 w-3 shrink-0" />}
                  <span>{nombre}</span>
                  <span className="pointer-events-none absolute inset-0 rounded-lg peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300" />
                </label>;
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="scrollbar-glass hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[560px] table-fixed text-left">
          <caption className="sr-only">Niveles de acceso por área de {usuario.nombre || usuario.correo}. Elige una opción por fila.</caption>
          <thead>
            <tr className="border-b border-white/[0.08] bg-white/[0.025]">
              <th scope="col" className="w-[34%] px-5 py-4 text-[10px] font-medium uppercase tracking-wider text-white/40">Área del sistema</th>
              {NIVELES.map(({ valor, nombre, descripcion, icono: Icono }) => (
                <th key={valor} scope="col" className="px-2 py-4 text-center">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/75"><Icono className="h-3.5 w-3.5 text-white/45" />{nombre}</span>
                  <span className="mx-auto mt-1 block max-w-28 text-[9px] font-normal leading-4 text-white/40">{descripcion}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {SECCIONES.map((seccion) => {
              const nivel = nivelAcceso(usuario.rol as Rol, seccion, draft);
              return (
                <tr key={seccion} className={cn("transition-colors hover:bg-white/[0.02]", draft[seccion] !== guardados[seccion] && "bg-brand-500/[0.04]")}>
                  <th scope="row" className="px-5 py-3 text-left font-normal">
                    <span className="flex items-center gap-2 text-xs font-medium text-white/80">{AREAS[seccion][0]}{draft[seccion] !== guardados[seccion] && <span className="h-1.5 w-1.5 rounded-full bg-brand-400" aria-label="Modificado" />}</span>
                    <span className="mt-0.5 block text-[10px] text-white/35">{AREAS[seccion][1]}</span>
                    <span className={cn("mt-1 inline-flex items-center gap-1 text-[9px]", draft[seccion] ? "text-brand-300" : "text-white/30")}>
                      {draft[seccion] ? "Excepción personal" : `Heredado: ${nombreNivel(nivelBaseRol(usuario.rol as Rol | null, seccion))}`}
                    </span>
                    {draft[seccion] && <button type="button" disabled={bloqueado || pending} onClick={() => restaurarArea(seccion)} className="ml-2 rounded px-1 py-0.5 text-[9px] text-white/40 hover:bg-white/5 hover:text-white/70 disabled:opacity-40">Usar rol</button>}
                  </th>
                  {NIVELES.map(({ valor, nombre }) => {
                    if (valor === "administrar" && !puedeAdministrarSeccion(seccion)) {
                      return <td key={valor} className="px-2 text-center text-xs text-white/15" aria-label={`${AREAS[seccion][0]} es un área informativa`}>—</td>;
                    }
                    return (
                      <td key={valor} className="px-2 text-center">
                        <label className={cn("relative inline-flex h-11 w-12 items-center justify-center rounded-lg", bloqueado || pending ? "cursor-not-allowed" : "cursor-pointer hover:bg-white/[0.04]")}>
                          <input type="radio" name={`permiso-${usuario.id}-${seccion}`} value={valor} checked={nivel === valor} disabled={bloqueado || pending}
                            aria-label={`${AREAS[seccion][0]}: ${nombre}`}
                            onChange={() => actualizarNivel(seccion, valor)}
                            className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
                          <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#10121a]", nivel === valor ? valor === "sin_acceso" ? "border-white/30 bg-white/15 text-white/75" : "border-brand-400/60 bg-brand-500/25 text-brand-200" : "border-white/20 bg-white/[0.025]", bloqueado && "opacity-50")}>
                            {nivel === valor && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                          </span>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 border-t border-white/10 px-5 py-4">
        <p className="text-[10px] leading-5 text-white/40">Dashboard y Riesgo son informes de solo lectura y muestran únicamente datos de las áreas autorizadas. Los adjuntos requieren acceso a Documentos y al área del registro. Tesorería ve servicios, mutuos y arrendamientos al visualizar Contratos; Administrar amplía el acceso a todos los tipos.</p>
        {mensaje && <p role={mensaje.error ? "alert" : "status"} className={cn("rounded-lg border px-3 py-2.5 text-xs leading-5", mensaje.error ? "border-red-400/20 bg-red-500/10 text-red-200" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200")}>{mensaje.texto}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className={cn("text-[11px]", cambios ? "text-brand-200" : "text-white/35")}>{cambios ? `${cambios} área${cambios === 1 ? "" : "s"} con cambios sin guardar` : "Sin cambios pendientes"}</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={!cambios || pending} onClick={() => { setDraft(guardados); setMensaje(null); }} className="rounded-lg px-3 py-2 text-xs text-white/55 hover:bg-white/5 disabled:opacity-35">Descartar</button>
            <button type="button" disabled={bloqueado || !cambios || pending} onClick={guardar} className="glass-btn-primary !text-xs">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{pending ? "Guardando…" : "Guardar permisos"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
