"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Mail,
  MailX,
  ChevronDown,
  Check,
  X,
  Loader2,
  RefreshCw,
  Pencil,
  AlertTriangle,
  Clock,
  Trash2,
  Search,
  UsersRound,
  UserCheck,
  Send,
  Crown,
  BellRing,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROL_LABEL, type Rol } from "@/lib/auth/roles";
import { alcanceCorreo } from "@/lib/alertas/alcance-correo";
import { AlcanceCorreoUsuario } from "./alcance-correo-usuario";
import { PermisosEditor } from "./permisos-editor";
import {
  cambiarRol,
  toggleActivo,
  toggleNotificacionesEmail,
  actualizarCategoriasCorreo,
  invitarUsuario,
  listarUsuarios,
  enviarResetContrasena,
  editarNombreUsuario,
  eliminarUsuario,
} from "./actions";

type CategoriasCorreo = Record<string, boolean>;

const CATEGORIAS_CORREO: { key: string; label: string; descripcion: string }[] = [
  { key: "vencimiento", label: "Vencimientos", descripcion: "Contratos, SOAT, pólizas y revisiones técnicas por vencer" },
  { key: "diligencia", label: "Diligencias", descripcion: "Audiencias y diligencias judiciales próximas" },
  { key: "actualizacion", label: "Actualizaciones", descripcion: "Cambios en registros existentes" },
  { key: "informativo", label: "Informativos", descripcion: "Resúmenes generales y novedades" },
];

const ROLES: Rol[] = ["administrador", "tesoreria", "soporte_documentario"];

const ROL_ICONO: Record<Rol, typeof Shield> = {
  administrador: ShieldAlert,
  tesoreria: ShieldCheck,
  soporte_documentario: Shield,
};

const ROL_META: Record<Rol, {
  nombre: string;
  nivel: string;
  descripcion: string;
  detalle: string[];
  tono: string;
  icono: string;
}> = {
  administrador: {
    nombre: "Administrador",
    nivel: "Control total",
    descripcion: "Administra toda la información, la seguridad y el acceso del equipo.",
    detalle: [
      "Visualiza todas las áreas",
      "Crea, edita y elimina registros",
      "Gestiona usuarios, roles y permisos",
      "Accede a personal y archivos sensibles",
    ],
    tono: "border-violet-400/20 bg-violet-500/[0.08] text-violet-200",
    icono: "bg-violet-500/15 text-violet-300 ring-violet-400/20",
  },
  soporte_documentario: {
    nombre: "Soporte documentario",
    nivel: "Solo visualización",
    descripcion: "Consulta la información operativa y documental sin modificar registros.",
    detalle: [
      "Visualiza 9 áreas operativas",
      "Accede a documentos y contratos",
      "No accede a Dashboard ni Personal",
      "No puede crear, editar ni eliminar",
    ],
    tono: "border-sky-400/20 bg-sky-500/[0.08] text-sky-200",
    icono: "bg-sky-500/15 text-sky-300 ring-sky-400/20",
  },
  tesoreria: {
    nombre: "Tesorería y contabilidad",
    nivel: "Visualización limitada",
    descripcion: "Consulta únicamente la información económica necesaria para su trabajo.",
    detalle: [
      "Visualiza Vehículos y Contratos",
      "Ve servicios, mutuos y arrendamientos",
      "No accede a documentos ni archivos",
      "No puede crear, editar ni eliminar",
    ],
    tono: "border-amber-400/20 bg-amber-500/[0.08] text-amber-100",
    icono: "bg-amber-500/15 text-amber-300 ring-amber-400/20",
  },
};

type Usuario = Awaited<ReturnType<typeof listarUsuarios>>[number];
type EstadoUsuario = "activo" | "pendiente" | "inactivo";

function estadoUsuario(usuario: Usuario): EstadoUsuario {
  if (!usuario.activo) return "inactivo";
  return usuario.confirmado ? "activo" : "pendiente";
}

export function UsuariosPanel({ usuariosInicial }: { usuariosInicial: Usuario[] }) {
  const [usuarios, setUsuarios] = useState(usuariosInicial);
  const [invitando, setInvitando] = useState(false);
  const [correoNuevo, setCorreoNuevo] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [rolNuevo, setRolNuevo] = useState<Rol>("soporte_documentario");
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error" | "advertencia"; texto: string } | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [confirmarDesactivar, setConfirmarDesactivar] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState<string | null>(null);
  const [editandoNombre, setEditandoNombre] = useState<string | null>(null);
  const [nombreDraft, setNombreDraft] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState<Rol | "todos">("todos");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "activos" | "pendientes" | "inactivos">("todos");
  const [vista, setVista] = useState<"equipo" | "permisos">("equipo");
  const [usuarioPermisos, setUsuarioPermisos] = useState<string | null>(usuariosInicial.find((u) => u.rol !== "administrador")?.id ?? usuariosInicial[0]?.id ?? null);
  const [permisosDirty, setPermisosDirty] = useState(false);
  const correoRef = useRef<HTMLInputElement>(null);

  const resumen = useMemo(() => ({
    total: usuarios.length,
    activos: usuarios.filter((u) => estadoUsuario(u) === "activo").length,
    pendientes: usuarios.filter((u) => estadoUsuario(u) === "pendiente").length,
    administradores: usuarios.filter((u) => u.rol === "administrador" && estadoUsuario(u) === "activo").length,
  }), [usuarios]);

  const usuariosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es");
    return usuarios.filter((u) => {
      const coincideTexto = !termino || `${u.nombre ?? ""} ${u.correo ?? ""}`.toLocaleLowerCase("es").includes(termino);
      const coincideRol = filtroRol === "todos" || u.rol === filtroRol;
      const estado = estadoUsuario(u);
      const coincideEstado = filtroEstado === "todos"
        || (filtroEstado === "activos" && estado === "activo")
        || (filtroEstado === "pendientes" && estado === "pendiente")
        || (filtroEstado === "inactivos" && estado === "inactivo");
      return coincideTexto && coincideRol && coincideEstado;
    });
  }, [busqueda, filtroEstado, filtroRol, usuarios]);

  useEffect(() => {
    if (invitando) correoRef.current?.focus();
  }, [invitando]);

  useEffect(() => {
    if (!mensaje) return;
    const ms = mensaje.tipo === "advertencia" ? 12000 : 4000;
    const t = setTimeout(() => setMensaje(null), ms);
    return () => clearTimeout(t);
  }, [mensaje]);

  function ejecutar(accion: () => Promise<void>) {
    startTransition(async () => {
      try {
        await accion();
      } catch {
        setMensaje({ tipo: "error", texto: "No se pudo completar la acción. Revisa tu conexión e intenta nuevamente." });
      }
    });
  }

  async function cargarUsuarios() {
    const frescos = await listarUsuarios();
    setUsuarios(frescos);
  }

  function refrescar() {
    ejecutar(cargarUsuarios);
  }

  function handleInvitar() {
    if (!correoNuevo.trim()) return;
    ejecutar(async () => {
      const res = await invitarUsuario(correoNuevo.trim(), rolNuevo, nombreNuevo.trim() || undefined);
      if (res.ok) {
        if (res.advertencia) {
          setMensaje({ tipo: "advertencia", texto: res.advertencia });
        } else {
          setMensaje({ tipo: "ok", texto: `Invitación enviada a ${correoNuevo}` });
        }
        setCorreoNuevo("");
        setNombreNuevo("");
        setInvitando(false);
        await cargarUsuarios();
      } else {
        setMensaje({ tipo: "error", texto: res.error ?? "Error al invitar" });
      }
    });
  }

  function handleCambiarRol(userId: string, nuevoRol: Rol) {
    ejecutar(async () => {
      const res = await cambiarRol(userId, nuevoRol);
      if (res.ok) {
        setMensaje({ tipo: "ok", texto: "Rol actualizado. Las excepciones personales por área se conservaron." });
        await cargarUsuarios();
      }
      else setMensaje({ tipo: "error", texto: res.error ?? "Error" });
    });
  }

  function handleToggleActivo(userId: string, activo: boolean) {
    if (!activo && confirmarDesactivar !== userId) {
      setConfirmarDesactivar(userId);
      return;
    }
    setConfirmarDesactivar(null);
    ejecutar(async () => {
      const res = await toggleActivo(userId, activo);
      if (res.ok) {
        setMensaje({ tipo: "ok", texto: activo ? "Acceso reactivado" : "Acceso desactivado" });
        await cargarUsuarios();
      }
      else setMensaje({ tipo: "error", texto: res.error ?? "Error" });
    });
  }

  function handleResetContrasena(userId: string, confirmado: boolean) {
    ejecutar(async () => {
      const res = await enviarResetContrasena(userId);
      if (res.ok) setMensaje({ tipo: "ok", texto: confirmado ? "Correo de restablecimiento enviado" : "Invitación reenviada" });
      else setMensaje({ tipo: "error", texto: res.error ?? "Error" });
    });
  }

  function iniciarEditarNombre(userId: string, nombreActual: string | null) {
    setEditandoNombre(userId);
    setNombreDraft(nombreActual ?? "");
  }

  function handleGuardarNombre(userId: string) {
    ejecutar(async () => {
      const res = await editarNombreUsuario(userId, nombreDraft);
      if (res.ok) {
        setEditandoNombre(null);
        setMensaje({ tipo: "ok", texto: "Nombre actualizado" });
        await cargarUsuarios();
      } else {
        setMensaje({ tipo: "error", texto: res.error ?? "Error" });
      }
    });
  }

  function handleEliminar(userId: string) {
    setConfirmarEliminar(null);
    ejecutar(async () => {
      const res = await eliminarUsuario(userId);
      if (res.ok) {
        setMensaje({ tipo: "ok", texto: "Usuario eliminado" });
        await cargarUsuarios();
      }
      else setMensaje({ tipo: "error", texto: res.error ?? "Error al eliminar" });
    });
  }

  function handleToggleEmail(userId: string, activo: boolean) {
    ejecutar(async () => {
      const res = await toggleNotificacionesEmail(userId, activo);
      if (res.ok) {
        setMensaje({ tipo: "ok", texto: activo ? "Notificaciones activadas" : "Notificaciones desactivadas" });
        await cargarUsuarios();
      }
      else setMensaje({ tipo: "error", texto: res.error ?? "Error" });
    });
  }

  function handleToggleCategoria(userId: string, categorias: CategoriasCorreo, key: string) {
    const nuevas = { ...categorias, [key]: !categorias[key] };
    ejecutar(async () => {
      const res = await actualizarCategoriasCorreo(userId, nuevas);
      if (res.ok) {
        setMensaje({ tipo: "ok", texto: "Categorías de correo actualizadas" });
        await cargarUsuarios();
      }
      else setMensaje({ tipo: "error", texto: res.error ?? "Error" });
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ResumenCard
          icon={UsersRound}
          label="Usuarios totales"
          value={resumen.total}
          hint="Cuentas registradas"
          className="text-sky-300"
        />
        <ResumenCard
          icon={UserCheck}
          label="Activos"
          value={resumen.activos}
          hint="Con acceso confirmado"
          className="text-emerald-300"
        />
        <ResumenCard
          icon={Send}
          label="Invitaciones"
          value={resumen.pendientes}
          hint="Pendientes de aceptar"
          className="text-amber-300"
        />
        <ResumenCard
          icon={Crown}
          label="Administradores"
          value={resumen.administradores}
          hint="Con control total"
          className="text-violet-300"
        />
      </div>

      {/* Mensaje flash */}
      {mensaje && (
        <div
          role={mensaje.tipo === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm font-medium shadow-glass-sm",
            mensaje.tipo === "ok" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
            mensaje.tipo === "error" && "border-red-500/20 bg-red-500/10 text-red-300",
            mensaje.tipo === "advertencia" && "border-amber-500/20 bg-amber-500/10 text-amber-200"
          )}
        >
          {mensaje.tipo === "ok" && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
          {mensaje.tipo === "error" && <X className="mt-0.5 h-4 w-4 shrink-0" />}
          {mensaje.tipo === "advertencia" && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="leading-relaxed">{mensaje.texto}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
        <div className="flex gap-5" aria-label="Vistas de gestión de usuarios">
          {([{ id: "equipo", label: "Equipo", icono: UsersRound }, { id: "permisos", label: "Permisos por área", icono: ShieldCheck }] as const).map(({ id, label, icono: Icono }) => (
            <button key={id} type="button" aria-pressed={vista === id} onClick={() => {
              if (permisosDirty && id !== vista) { setMensaje({ tipo: "advertencia", texto: "Guarda o descarta los cambios de permisos antes de cambiar de vista." }); return; }
              setVista(id);
            }} className={cn("-mb-px inline-flex items-center gap-2 border-b-2 px-1 py-3 text-xs font-medium transition-colors", vista === id ? "border-brand-400 text-white" : "border-transparent text-white/40 hover:text-white/75")}>
              <Icono className="h-3.5 w-3.5" />{label}{id === "equipo" && <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/50">{usuarios.length}</span>}
            </button>
          ))}
        </div>
        {vista === "equipo" && <button type="button" onClick={() => setInvitando(!invitando)} className="glass-btn-primary mb-2 !text-xs"><UserPlus className="h-3.5 w-3.5" />Invitar usuario</button>}
      </div>
      {vista === "permisos" && <PermisosEditor usuarios={usuarios} seleccionado={usuarioPermisos} onDirty={setPermisosDirty}
        onSeleccionar={(id) => {
          if (permisosDirty && id !== usuarioPermisos) { setMensaje({ tipo: "advertencia", texto: "Guarda o descarta los cambios antes de seleccionar otra persona." }); return; }
          setUsuarioPermisos(id);
        }}
        onGuardado={(id, permisos) => setUsuarios((actuales) => actuales.map((u) => u.id === id ? { ...u, permisos } : u))}
      />}
      {vista === "equipo" && <>
      {invitando && <section className="records-card overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-400/20">
              <UserPlus className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white">Incorporar a una persona</h2>
              <p className="mt-1 max-w-xl text-xs leading-5 text-white/45">
                Envía una invitación segura y define el nivel de acceso desde el inicio.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setInvitando(!invitando)}
            aria-expanded={invitando}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold transition-all",
              invitando
                ? "border border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/10"
                : "bg-brand-500 text-white shadow-[0_10px_30px_-10px_rgba(59,130,246,.8)] hover:bg-brand-400"
            )}
          >
            {invitando ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {invitando ? "Cerrar" : "Invitar usuario"}
          </button>
        </div>

        {invitando && (
          <div className="border-t border-white/[0.08] bg-black/10 p-5">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_18rem]">
              <div>
                <label htmlFor="correo-invitacion" className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  Correo electrónico
                </label>
                <input
                  ref={correoRef}
                  id="correo-invitacion"
                  type="email"
                  required
                  maxLength={254}
                  value={correoNuevo}
                  onChange={(e) => setCorreoNuevo(e.target.value)}
                  placeholder="usuario@empresa.com"
                  onKeyDown={(e) => e.key === "Enter" && handleInvitar()}
                  className="view-control h-11 w-full rounded-xl px-3.5 text-xs"
                />
              </div>
              <div>
                <label htmlFor="nombre-invitacion" className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  Nombre completo <span className="normal-case tracking-normal text-white/25">(opcional)</span>
                </label>
                <input
                  id="nombre-invitacion"
                  type="text"
                  maxLength={120}
                  value={nombreNuevo}
                  onChange={(e) => setNombreNuevo(e.target.value)}
                  placeholder="Nombres y apellidos"
                  className="view-control h-11 w-full rounded-xl px-3.5 text-xs"
                />
              </div>
              <div>
                <label htmlFor="rol-invitacion" className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  Rol inicial
                </label>
                <select
                  id="rol-invitacion"
                  value={rolNuevo}
                  onChange={(e) => setRolNuevo(e.target.value as Rol)}
                  className="view-control h-11 w-full rounded-xl px-3.5 text-xs"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROL_META[r].nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-brand-300" />
                <p className="text-[11px] leading-5 text-white/50">
                  <span className="font-semibold text-white/80">{ROL_META[rolNuevo].nivel}:</span>{" "}
                  {ROL_META[rolNuevo].descripcion}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setInvitando(false); setCorreoNuevo(""); setNombreNuevo(""); }}
                  className="rounded-xl px-3.5 py-2.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleInvitar}
                  disabled={pending || !correoNuevo.trim()}
                  aria-busy={pending}
                  className="inline-flex min-w-28 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Enviar invitación
                </button>
              </div>
            </div>
          </div>
        )}
      </section>}

      <section className="records-card overflow-hidden">
        <div className="border-b border-white/[0.08] p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <UsersRound className="h-4 w-4 text-white/45" />
                <h2 className="text-sm font-semibold text-white">Directorio del equipo</h2>
              </div>
              <p className="mt-1 text-xs text-white/40">
                Cambia roles, suspende accesos y configura notificaciones por persona.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                <span className="sr-only">Buscar usuario</span>
                <input
                  type="search"
                  maxLength={120}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o correo"
                  className="view-control h-10 rounded-xl pl-9 pr-3 text-xs"
                />
              </label>
              <label>
                <span className="sr-only">Filtrar por rol</span>
                <select
                  value={filtroRol}
                  onChange={(e) => setFiltroRol(e.target.value as Rol | "todos")}
                  className="view-control h-10 min-w-40 rounded-xl text-xs"
                >
                  <option value="todos">Todos los roles</option>
                  {ROLES.map((r) => <option key={r} value={r}>{ROL_META[r].nombre}</option>)}
                </select>
              </label>
              <label>
                <span className="sr-only">Filtrar por estado</span>
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
                  className="view-control h-10 min-w-36 rounded-xl text-xs"
                >
                  <option value="todos">Todos los estados</option>
                  <option value="activos">Activos</option>
                  <option value="pendientes">Por confirmar</option>
                  <option value="inactivos">Inactivos</option>
                </select>
              </label>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
            <p className="text-[11px] text-white/35">
              Mostrando <span className="font-semibold text-white/65">{usuariosFiltrados.length}</span> de {usuarios.length} usuarios
            </p>
            <button
              type="button"
              onClick={refrescar}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/75 disabled:opacity-40"
            >
              <RefreshCw className={cn("h-3 w-3", pending && "animate-spin")} />
              Actualizar
            </button>
          </div>
        </div>

        <div className="scrollbar-glass overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.025] text-[10px] uppercase tracking-[0.12em] text-white/35">
                <th scope="col" className="px-5 py-3.5 font-semibold">Usuario</th>
                <th scope="col" className="px-4 py-3.5 font-semibold">Rol y permisos</th>
                <th scope="col" className="px-4 py-3.5 font-semibold text-center">Estado</th>
                <th scope="col" className="px-4 py-3.5 font-semibold text-center">Notificaciones</th>
                <th scope="col" className="w-24 px-4 py-3.5 text-center font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.055]">
              {usuariosFiltrados.map((u) => {
                const RolIcon = ROL_ICONO[u.rol as Rol] ?? Shield;
                const categorias = (u.correo_categorias ?? {
                  vencimiento: true, diligencia: true, actualizacion: true, informativo: true,
                }) as CategoriasCorreo;
                const abierto = expandido === u.id;
                const estado = estadoUsuario(u);
                const alcance = alcanceCorreo({ rol: u.rol as Rol | null, permisos: u.permisos });
                // Una categoría sin nada que enviar no se puede marcar: el cron la vaciaría igual.
                const sinAlcance: Record<string, string | undefined> = {
                  vencimiento: alcance.vencimientos.length === 0 ? "No tiene acceso a ningún área con vencimientos" : undefined,
                  diligencia: alcance.diligencias ? undefined : "No tiene acceso a Procesos judiciales",
                };

                return (
                  <UsuarioFila key={u.id}>
                    <tr className={cn("group transition-colors hover:bg-white/[0.035]", abierto && "bg-white/[0.025]")}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-medium text-white/70">
                            {(u.nombre?.[0] ?? u.correo?.[0] ?? "?").toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            {editandoNombre === u.id ? (
                              <div className="flex max-w-xs items-center gap-1">
                                <input
                                  type="text"
                                  aria-label={`Nombre de ${u.correo ?? "usuario"}`}
                                  maxLength={120}
                                  value={nombreDraft}
                                  onChange={(e) => setNombreDraft(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter" && !pending) handleGuardarNombre(u.id); if (e.key === "Escape") setEditandoNombre(null); }}
                                  autoFocus
                                  disabled={pending}
                                  className="view-control h-8 min-w-0 flex-1 text-xs"
                                  placeholder="Nombre completo"
                                />
                                <button type="button" onClick={() => handleGuardarNombre(u.id)} disabled={pending} aria-label="Guardar nombre" className="rounded-md p-2 text-brand-300 hover:bg-brand-500/10 disabled:opacity-40">
                                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                </button>
                                <button type="button" onClick={() => setEditandoNombre(null)} disabled={pending} aria-label="Cancelar edición del nombre" className="rounded-md p-2 text-white/40 hover:bg-white/5 hover:text-white disabled:opacity-40">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => iniciarEditarNombre(u.id, u.nombre)}
                                disabled={pending}
                                aria-label={`Editar nombre de ${u.nombre || u.correo || "usuario"}`}
                                className="group/nombre flex max-w-full items-center gap-2 rounded text-left text-xs font-semibold text-white/90 outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-40"
                              >
                                <span className="truncate">{u.nombre || "Sin nombre"}</span>
                                <Pencil className="h-3 w-3 shrink-0 text-white/35 opacity-0 transition-opacity group-hover/nombre:opacity-100 group-focus-visible/nombre:opacity-100" />
                              </button>
                            )}
                            <p className="mt-1 truncate text-[11px] text-white/40">{u.correo}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <RolDropdown
                          rol={u.rol as Rol}
                          icon={RolIcon}
                          disabled={pending || u.esActual}
                          onChange={(r) => handleCambiarRol(u.id, r)}
                        />
                        {u.rol === "administrador" ? (
                          <p className="mt-1.5 inline-flex items-center gap-1.5 px-1 py-1 text-[10px] text-white/35"><Crown className="h-3 w-3" />Acceso total definido por el rol</p>
                        ) : (
                          <button type="button" onClick={() => { setUsuarioPermisos(u.id); setVista("permisos"); }} className="mt-1.5 inline-flex items-center gap-1.5 rounded px-1 py-1 text-[10px] text-brand-300 hover:text-brand-200"><ShieldCheck className="h-3 w-3" />{Object.keys(u.permisos).length ? "Editar excepciones por área" : "Configurar excepciones por área"}</button>
                        )}
                      </td>

                      <td className="px-4 py-4 text-center">
                        {confirmarDesactivar === u.id ? (
                          <div className="inline-flex items-center gap-1">
                            <span className="text-[10px] text-amber-300/80 font-medium flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />¿Desactivar?
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleActivo(u.id, false)}
                              disabled={pending}
                              className="ml-1 rounded px-2 py-0.5 text-[10px] font-semibold bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-40"
                            >
                              Sí
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmarDesactivar(null)}
                              className="rounded px-2 py-0.5 text-[10px] font-semibold text-white/40 hover:text-white/70"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleActivo(u.id, !u.activo)}
                            disabled={pending || u.esActual}
                            title={u.esActual ? "No puedes desactivar tu propia cuenta" : u.activo ? "Desactivar acceso" : "Reactivar acceso"}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                              estado === "activo" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
                              estado === "pendiente" && "border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
                              estado === "inactivo" && "border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20",
                              "disabled:opacity-40"
                            )}
                          >
                            {estado === "pendiente" ? <Clock className="h-3 w-3" /> : <span className={cn("h-1.5 w-1.5 rounded-full", estado === "activo" ? "bg-emerald-400" : "bg-red-400")} />}
                            {estado === "activo" ? "Activo" : estado === "pendiente" ? "Por confirmar" : "Inactivo"}
                          </button>
                        )}
                      </td>

                      <td className="px-4 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleEmail(u.id, !u.notificaciones_email)}
                          disabled={pending}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition-colors",
                            u.notificaciones_email
                              ? "border-brand-500/20 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20"
                              : "border-white/10 bg-white/[0.03] text-white/35 hover:bg-white/[0.06] hover:text-white/60",
                            "disabled:opacity-40"
                          )}
                        >
                          {u.notificaciones_email ? <Mail className="h-3 w-3" /> : <MailX className="h-3 w-3" />}
                          {u.notificaciones_email ? "Activo" : "Inactivo"}
                        </button>
                      </td>

                      <td className="px-4 py-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmarEliminar(u.id);
                              setExpandido(u.id);
                            }}
                            disabled={pending || u.esActual}
                            title={u.esActual ? "No puedes eliminar tu propia cuenta" : "Eliminar usuario"}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                            aria-label={u.esActual ? "No puedes eliminar tu propia cuenta" : `Eliminar a ${u.nombre || u.correo || "usuario"}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandido(abierto ? null : u.id);
                              setConfirmarEliminar(null);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.025] text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white"
                            aria-label={abierto ? "Ocultar detalles" : "Ver detalles"}
                            aria-expanded={abierto}
                            aria-controls={`detalles-usuario-${u.id}`}
                          >
                            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", abierto && "rotate-180")} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {abierto && (
                      <tr>
                        <td colSpan={5} className="px-5 pb-4 pt-0">
                          <div id={`detalles-usuario-${u.id}`} className="max-w-2xl space-y-3 py-2 sm:ml-12">
                            {/* Panel de eliminación */}
                            {confirmarEliminar === u.id && (
                              <div className="rounded-xl border border-red-500/30 bg-red-500/[0.07] p-4">
                                <div className="flex items-start gap-3">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-500/30 bg-red-500/15 text-red-400">
                                    <AlertTriangle className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-red-300">Eliminar cuenta permanentemente</p>
                                    <p className="mt-1 text-xs leading-relaxed text-red-300/70">
                                      Se eliminará la cuenta de <span className="font-semibold text-red-200">{u.nombre || u.correo}</span> de forma irreversible.
                                      El usuario perderá todo acceso inmediatamente y no podrá recuperarse.
                                    </p>
                                    <div className="mt-3 flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleEliminar(u.id)}
                                        disabled={pending}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-40"
                                      >
                                        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                        Eliminar permanentemente
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmarEliminar(null)}
                                        className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-white/50 transition-colors hover:bg-white/[0.07] hover:text-white"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                              <p className="text-[11px] font-medium text-white/55">Categorías de correo</p>
                              <button
                                type="button"
                                onClick={() => handleResetContrasena(u.id, u.confirmado)}
                                disabled={pending}
                                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-40"
                              >
                                <RefreshCw className="h-3 w-3" />
                                {u.confirmado ? "Restablecer contraseña" : "Reenviar invitación"}
                              </button>
                            </div>

                            <div role="group" aria-label="Categorías de correo" className="grid max-w-lg grid-cols-2 gap-x-6 gap-y-1">
                              {CATEGORIAS_CORREO.map((cat) => {
                                const motivoBloqueo = sinAlcance[cat.key];
                                const marcada = !!categorias[cat.key] && !motivoBloqueo;
                                return (
                                  <button
                                    key={cat.key}
                                    type="button"
                                    role="checkbox"
                                    aria-checked={marcada}
                                    title={motivoBloqueo ?? cat.descripcion}
                                    onClick={() => handleToggleCategoria(u.id, categorias, cat.key)}
                                    disabled={pending || !u.notificaciones_email || !!motivoBloqueo}
                                    className="flex min-h-9 items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-35"
                                  >
                                    <span aria-hidden="true" className={cn(
                                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                      marcada
                                        ? "border-brand-400/40 bg-brand-500/15 text-brand-200"
                                        : "border-white/20 bg-transparent"
                                    )}>
                                      {marcada && <Check className="h-2.5 w-2.5" />}
                                    </span>
                                    <span className={cn("text-xs", marcada ? "text-white/75" : "text-white/45")}>{cat.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                            {!u.notificaciones_email && <p className="text-[10px] text-white/35">Activa las notificaciones de este usuario para cambiar sus categorías.</p>}
                            <AlcanceCorreoUsuario alcance={alcance} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </UsuarioFila>
                );
              })}
              {usuariosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.04] text-white/25 ring-1 ring-inset ring-white/[0.07]">
                      <Search className="h-4 w-4" />
                    </span>
                    <p className="mt-3 text-sm font-medium text-white/70">No encontramos usuarios</p>
                    <p className="mt-1 text-xs text-white/35">Prueba con otra búsqueda o cambia los filtros.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </>}
    </div>
  );
}

function ResumenCard({
  icon: Icon,
  label,
  value,
  hint,
  className,
}: {
  icon: typeof Shield;
  label: string;
  value: number;
  hint: string;
  className?: string;
}) {
  return (
    <div className="records-card relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">{label}</p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-white">{value}</p>
          <p className="mt-1 text-[10px] text-white/30">{hint}</p>
        </div>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-current/10 ring-1 ring-inset ring-current/15", className)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function UsuarioFila({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function RolDropdown({
  rol,
  icon: Icon,
  disabled,
  onChange,
}: {
  rol: Rol | null;
  icon: typeof Shield;
  disabled: boolean;
  onChange: (r: Rol) => void;
}) {
  return (
    <label className="relative flex min-w-52 items-center">
      <span className="sr-only">Rol del usuario</span>
      <Icon className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-white/40" />
      <select value={rol ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value as Rol)}
        title={rol ? ROL_LABEL[rol] : "Sin rol asignado"}
        className="view-control h-9 pl-9 text-[11px] disabled:opacity-40">
        {!rol && <option value="" disabled>Sin rol asignado</option>}
        {ROLES.map((r) => <option key={r} value={r}>{ROL_META[r].nombre}</option>)}
      </select>
    </label>
  );
}
