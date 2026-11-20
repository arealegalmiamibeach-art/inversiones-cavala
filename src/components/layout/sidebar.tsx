"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Scale,
  LayoutDashboard,
  Users,
  Gavel,
  FolderOpen,
  Files,
  ScrollText,
  ChevronDown,
  Car,
  MapPin,
  Gem,
  UserCheck,
  Landmark,
  FileText,
  LogOut,
  PanelLeft,
  Trash2,
  UserRound,
  UsersRound,
  CalendarCog,
  Bot,
  X,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/(auth)/login/actions";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/layout/notification-bell";
import { PapeleraPanel } from "@/components/ui/papelera-panel";
import { TIPOS_NAVEGACION } from "@/app/(dashboard)/documentos/tipos";
import { MATERIAS_CATALOGO } from "@/lib/procesos/materias";
import { FAMILIA_LABEL, ORDEN_TIPOS } from "@/app/(dashboard)/contratos/opciones";
import { esAdmin, nivelAcceso, ROL_LABEL, type Permisos, type Rol, type Seccion } from "@/lib/auth/roles";

type NavChild = { label: string; href: string; icon: LucideIcon; seccion?: Seccion; exact?: boolean };
type NavLeaf = { label: string; href: string; icon: LucideIcon; seccion: Seccion; children?: undefined };
type NavGroupItem = { label: string; icon: LucideIcon; seccion?: Seccion; children: NavChild[] };
type NavItem = NavLeaf | NavGroupItem;

const navItemsBase: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    seccion: "dashboard",
  },
  {
    label: "Entidades",
    icon: Users,
    children: [
      { label: "Propietarios", href: "/entidades/propietarios", icon: Users, seccion: "propietarios" },
      { label: "Predios", href: "/entidades/predios", icon: MapPin, seccion: "predios" },
      { label: "Vehículos", href: "/entidades/vehiculos", icon: Car, seccion: "vehiculos" },
      { label: "Concesiones Mineras", href: "/entidades/concesiones", icon: Gem, seccion: "concesiones" },
      { label: "Personal", href: "/entidades/personal", icon: UserCheck, seccion: "personal" },
      { label: "Oficinas Registrales", href: "/entidades/oficinas", icon: Landmark, seccion: "oficinas" },
    ],
  },
  {
    label: "Procesos Judiciales",
    icon: Gavel,
    seccion: "procesos",
    children: [
      { label: "Resumen por materia", href: "/procesos", icon: Gavel, exact: true },
      { label: "Todos los procesos", href: "/procesos/materia/todas", icon: Scale },
      ...MATERIAS_CATALOGO.map((materia) => ({
        label: materia.etiqueta,
        href: `/procesos/materia/${materia.slug}`,
        icon: materia.icono,
      })),
      { label: "Reporte imprimible", href: "/procesos/reporte", icon: FileText },
    ],
  },
  {
    label: "Documentos",
    icon: FolderOpen,
    seccion: "documentos",
    children: [
      { label: "Todos los documentos", href: "/documentos", icon: FolderOpen, exact: true },
      { label: "Copias literales", href: "/documentos/copias-literales", icon: Files },
      { label: "Tipos documentales", href: "/documentos/tipos", icon: Files, exact: true },
      ...TIPOS_NAVEGACION.map((tipo) => ({
        label: tipo.label,
        href: `/documentos/tipos/${tipo.value}`,
        icon: FileText,
      })),
    ],
  },
  {
    label: "Contratos",
    icon: ScrollText,
    seccion: "contratos",
    children: [
      { label: "Resumen por tipo", href: "/contratos", icon: ScrollText, exact: true },
      { label: "Todos los contratos", href: "/contratos/tipo/todos", icon: ScrollText },
      ...ORDEN_TIPOS.map((tipo) => ({
        label: FAMILIA_LABEL[tipo] ?? tipo,
        href: `/contratos/tipo/${tipo}`,
        icon: FileText,
      })),
    ],
  },
];

/** undefined = sin gate (hereda del grupo, o el grupo mismo no restringe). */
function visible(rol: Rol | null, permisos: Permisos, seccion?: Seccion): boolean {
  return seccion === undefined || nivelAcceso(rol, seccion, permisos) !== "sin_acceso";
}

/**
 * Filtra la navegación por rol. Los hijos de "Entidades" tienen su propia
 * `seccion` (cada uno es un permiso distinto); los de "Documentos" heredan
 * la del grupo (todos son la misma tabla `documentos`, sólo cambia el
 * filtro aplicado dentro de la página). Un grupo sin hijos visibles
 * desaparece entero, no se muestra vacío.
 */
function navParaRol(rol: Rol | null, permisos: Permisos): NavItem[] {
  return navItemsBase.reduce<NavItem[]>((acc, item) => {
    if (item.children) {
      const children = item.children.filter((child) => visible(rol, permisos, child.seccion ?? item.seccion));
      if (children.length > 0) acc.push({ ...item, children });
      return acc;
    }
    if (visible(rol, permisos, item.seccion)) acc.push(item);
    return acc;
  }, []);
}

const COLLAPSE_KEY = "cavala:sidebar-collapsed";

type SidebarProps = {
  rol: Rol | null;
  permisos?: Permisos;
  userEmail?: string;
  usuarioId?: string;
  lectorIaEnabled?: boolean;
  /** Tipos de documento personalizados creados desde "Tipos documentales" (ya filtrados por `visible_sidebar` en el layout): se agregan al final de "Documentos". Los creados desde el "+" de una ficha de entidad quedan fuera. */
  tiposCustom?: { slug: string; nombre: string }[];
};

export function Sidebar({ rol, permisos = {}, userEmail, usuarioId, lectorIaEnabled = false, tiposCustom = [] }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileGroup, setMobileGroup] = useState<"entidades" | "documentos" | null>(null);
  const [mobileAccount, setMobileAccount] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const initial = userEmail?.[0]?.toUpperCase() ?? "?";
  const navBase: NavItem[] = lectorIaEnabled
    ? [...navParaRol(rol, permisos), { label: "Lector IA", href: "/lector-ia", icon: Bot, seccion: "documentos" }]
    : navParaRol(rol, permisos);
  // Los tipos predefinidos viven en código (`TIPOS_NAVEGACION`); los
  // personalizados se crean en runtime desde "Tipos documentales" y no están
  // en ese arreglo fijo, así que se anexan aparte a los hijos ya filtrados
  // por rol.
  const navItems: NavItem[] = tiposCustom.length === 0
    ? navBase
    : navBase.map((item) =>
        item.label === "Documentos" && item.children
          ? {
              ...item,
              children: [
                ...item.children,
                ...tiposCustom.map((tipo) => ({
                  label: tipo.nombre,
                  href: `/documentos/tipos/${tipo.slug}`,
                  icon: FileText,
                })),
              ],
            }
          : item
      );
  const entidades = navItems.find((item) => item.label === "Entidades")?.children ?? [];
  const documentos = navItems.find((item) => item.label === "Documentos")?.children ?? [];
  const puedeDashboard = navItems.some((item) => item.label === "Dashboard");
  const puedeEntidades = entidades.length > 0;
  const puedeProcesos = navItems.some((item) => item.label === "Procesos Judiciales");
  const puedeDocumentos = documentos.length > 0;
  const puedeContratos = navItems.some((item) => item.label === "Contratos");

  useEffect(() => {
    setMobileGroup(null);
    setMobileAccount(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen && !mobileAccount) return;
    function onClickAfuera(event: MouseEvent) {
      if (accountOpen && !accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountOpen(false);
        setMobileAccount(false);
      }
    }

    document.addEventListener("mousedown", onClickAfuera);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickAfuera);
      document.removeEventListener("keydown", onEscape);
    };
  }, [accountOpen, mobileAccount]);

  // El estado colapsado se recuerda entre recargas. Se lee tras el montaje
  // para no romper la hidratación (el server siempre renderiza expandido).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* localStorage no disponible: se queda expandido */
    }
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });

  return (
    <>
    <aside
      className={cn(
        // z-20 (main es z-10): deja que los tooltips del modo colapsado se
        // dibujen por encima del contenido cuando sobresalen del borde.
        "relative z-20 hidden h-[100dvh] shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0b11] transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[4.75rem]" : "w-64"
      )}
    >
      {/* Barra superior: nombre + toggle a la derecha (estilo ChatGPT/Grok) */}
      <div
        className={cn(
          "flex items-center gap-2 border-b border-white/[0.06] px-3 py-3",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        {!collapsed && (
          <div className="min-w-0 pl-1.5">
            <p className="truncate text-sm font-bold leading-tight text-white">Inversiones</p>
            <p className="truncate text-xs font-medium leading-tight text-brand-300">Cavala S.A.C.</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Abrir barra lateral" : "Cerrar barra lateral"}
          className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-none active:bg-white/[0.14]"
        >
          <PanelLeft className="h-[18px] w-[18px]" />
          <TooltipBubble
            label={collapsed ? "Abrir barra lateral" : "Cerrar barra lateral"}
            side={collapsed ? "right" : "bottom"}
          />
        </button>
      </div>

      {/* Notificaciones: acción global, siempre visible sobre la navegación. */}
      <div className={cn("border-b border-white/[0.06] py-2", collapsed ? "px-2" : "px-3")}>
        <div className="group relative">
          <NotificationBell
            usuarioId={usuarioId}
            variant="sidebar"
            collapsed={collapsed}
            placement="right-start"
          />
          {collapsed && <TooltipBubble label="Notificaciones" side="right" />}
        </div>
      </div>

      {/* Nav */}
      <nav
        className={cn(
          "scrollbar-glass flex-1 py-4 space-y-1",
          // Colapsado: sólo ~5 iconos, no hace falta scroll y así los
          // tooltips laterales no quedan recortados. Expandido: scroll normal.
          collapsed ? "overflow-visible px-2" : "overflow-y-auto overflow-x-hidden px-3"
        )}
      >
        {navItems.map((item) => {
          if (item.children) {
            return <NavGroup key={item.label} item={item} pathname={pathname} collapsed={collapsed} />;
          }
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <NavLink
              key={item.href}
              href={item.href!}
              label={item.label}
              icon={item.icon}
              active={isActive}
              collapsed={collapsed}
            />
          );
        })}
      </nav>

      {/* Footer: cuenta; papelera queda deliberadamente al último. */}
      <div className="mt-auto border-t border-white/[0.06]">
        <div className={cn(collapsed ? "p-2" : "p-3")}>
          <div ref={accountRef} className="relative">
            <button
              type="button"
              onClick={() => setAccountOpen((open) => !open)}
              aria-expanded={accountOpen}
              aria-haspopup="dialog"
              className={cn(
                "group relative flex w-full items-center rounded-xl bg-white/[0.035] text-left transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none",
                collapsed ? "justify-center py-2" : "gap-2.5 px-2.5 py-2"
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-[11px] font-bold text-white">
                {initial}
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-white/75">{userEmail ?? "Usuario"}</span>
                  {rol && <span className="block truncate text-[9px] uppercase tracking-wide text-white/30">{ROL_LABEL[rol]}</span>}
                </span>
              )}
              {collapsed && !accountOpen && <TooltipBubble label={userEmail ?? "Usuario"} side="right" />}
            </button>

            {accountOpen && (
              <section
                role="dialog"
                aria-label="Opciones de usuario"
                className={cn(
                  "absolute z-[80] overflow-hidden rounded-xl border border-white/[0.12] bg-[#11131c] shadow-glass-lg",
                  collapsed ? "bottom-0 left-full ml-2 w-64" : "bottom-full left-0 mb-1 w-full"
                )}
              >
                <div className="flex items-start gap-2.5 border-b border-white/[0.08] p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-xs font-bold text-white">
                    {initial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-white/80">{userEmail ?? "Usuario"}</p>
                    {rol && <p className="mt-0.5 text-[9px] uppercase leading-4 tracking-wide text-white/35">{ROL_LABEL[rol]}</p>}
                  </div>
                  <button type="button" onClick={() => setAccountOpen(false)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.07] hover:text-white" aria-label="Cerrar opciones de usuario">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="p-1.5">
                  <Link
                    href="/configuracion/perfil"
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] focus-visible:text-white focus-visible:outline-none"
                  >
                    <UserRound className="h-4 w-4 shrink-0 text-white/40" />
                    Mi perfil
                  </Link>
                  {esAdmin(rol) && (
                    <Link
                      href="/configuracion/usuarios"
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] focus-visible:text-white focus-visible:outline-none"
                    >
                      <UsersRound className="h-4 w-4 shrink-0 text-white/40" />
                      Gestionar usuarios
                    </Link>
                  )}
                  {esAdmin(rol) && (
                    <Link
                      href="/configuracion/fechas"
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] focus-visible:text-white focus-visible:outline-none"
                    >
                      <CalendarCog className="h-4 w-4 shrink-0 text-white/40" />
                      Fechas y avisos
                    </Link>
                  )}
                  <form action={logout}>
                    <button type="submit" className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] focus-visible:text-white focus-visible:outline-none">
                      <LogOut className="h-4 w-4 shrink-0 text-white/40" />
                      Salir
                    </button>
                  </form>
                </div>
              </section>
            )}
          </div>
        </div>

        {esAdmin(rol) && (
          <div className={cn("border-t border-white/[0.06]", collapsed ? "p-2" : "px-3 py-2")}>
            <PapeleraPanel>
              {(abrir) => (
                <button
                  type="button"
                  onClick={abrir}
                  className={cn(
                    "group relative flex w-full items-center gap-2.5 rounded-xl text-sm font-medium text-white/50 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] focus-visible:text-white focus-visible:outline-none",
                    collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2"
                  )}
                >
                  <Trash2 className="h-4 w-4 shrink-0 text-white/35 transition-colors group-hover:text-white/70" />
                  {!collapsed && "Papelera"}
                  {collapsed && <TooltipBubble label="Papelera" side="right" />}
                </button>
              )}
            </PapeleraPanel>
          </div>
        )}
      </div>
    </aside>

    {mobileGroup && (
      <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label={mobileGroup === "entidades" ? "Entidades" : "Documentos"}>
        <button type="button" aria-label="Cerrar navegación" onClick={() => setMobileGroup(null)} className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
        <section className="absolute inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] max-h-[min(70dvh,34rem)] overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0b0d16]/[0.98] shadow-[0_-18px_70px_rgba(0,0,0,.52)] backdrop-blur-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">{mobileGroup === "entidades" ? "Entidades" : "Documentos"}</p>
              <p className="mt-0.5 text-[10px] text-white/50">Selecciona una sección</p>
            </div>
            <button type="button" onClick={() => setMobileGroup(null)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/70" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="scrollbar-glass grid max-h-[calc(min(70dvh,34rem)-4rem)] grid-cols-2 gap-2 overflow-y-auto p-3">
            {(mobileGroup === "entidades" ? entidades : documentos).map((child) => {
              const Icon = child.icon;
              const active = child.exact ? pathname === child.href : pathname === child.href || pathname.startsWith(child.href + "/");
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onPointerEnter={() => router.prefetch(child.href)}
                  onFocus={() => router.prefetch(child.href)}
                  onTouchStart={() => router.prefetch(child.href)}
                  className={cn("flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-xs font-medium", active ? "border-brand-400/30 bg-brand-500/15 text-white" : "border-white/[0.08] bg-white/[0.035] text-white/75")}
                >
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", active ? "bg-brand-500/20 text-brand-200" : "bg-white/[0.05] text-white/50")}><Icon className="h-4 w-4" /></span>
                  <span className="line-clamp-2 leading-4">{child.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    )}

    {mobileAccount && (
      <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Cuenta">
        <button type="button" aria-label="Cerrar cuenta" onClick={() => setMobileAccount(false)} className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
        <section className="absolute inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0b0d16]/[0.98] p-3 shadow-[0_-18px_70px_rgba(0,0,0,.52)] backdrop-blur-2xl">
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Cuenta</p>
            <button type="button" onClick={() => setMobileAccount(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/50 transition-colors hover:bg-white/[0.07] hover:text-white" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-white/[0.08] pb-2">
            <NotificationBell usuarioId={usuarioId} variant="sidebar" placement="top-end" />
          </div>

          <div className="mt-2 flex w-full items-center gap-3 rounded-xl bg-white/[0.04] p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-bold text-white">
              {initial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white/85">{userEmail ?? "Usuario"}</span>
              {rol && <span className="block truncate text-[9px] uppercase tracking-wide text-white/35">{ROL_LABEL[rol]}</span>}
            </span>
          </div>

          <Link
            href="/configuracion/perfil"
            className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white"
          >
            <UserRound className="h-4 w-4 text-white/35" />
            Mi perfil
          </Link>

          {esAdmin(rol) && (
            <Link
              href="/configuracion/usuarios"
              className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              <UsersRound className="h-4 w-4 text-white/35" />
              Gestionar usuarios
            </Link>
          )}

          {esAdmin(rol) && (
            <Link
              href="/configuracion/fechas"
              className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              <CalendarCog className="h-4 w-4 text-white/35" />
              Fechas y avisos
            </Link>
          )}

          <form action={logout} className="mt-1">
            <button type="submit" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white">
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </form>

          {esAdmin(rol) && (
            <div className="mt-2 border-t border-white/[0.08] pt-2">
              <PapeleraPanel>
                {(abrir) => (
                  <button type="button" onClick={abrir} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-white/50 transition-colors hover:bg-white/[0.07] hover:text-white">
                    <Trash2 className="h-4 w-4 text-white/35" />
                    Papelera
                  </button>
                )}
              </PapeleraPanel>
            </div>
          )}
        </section>
      </div>
    )}

    <nav className="fixed inset-x-2 bottom-2 z-[70] flex rounded-2xl border border-white/[0.12] bg-[#0b0d16]/[0.94] px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_18px_60px_rgba(0,0,0,.55)] backdrop-blur-2xl lg:hidden" aria-label="Navegación principal">
      {puedeDashboard && (
        <MobileNavLink href="/dashboard" label="Inicio" icon={LayoutDashboard} active={pathname.startsWith("/dashboard")} />
      )}
      {puedeEntidades && (
        <MobileNavButton label="Entidades" icon={Users} active={pathname.startsWith("/entidades")} onClick={() => { setMobileAccount(false); setMobileGroup((value) => value === "entidades" ? null : "entidades"); }} />
      )}
      {puedeProcesos && (
        <MobileNavLink href="/procesos" label="Procesos" icon={Gavel} active={pathname.startsWith("/procesos")} />
      )}
      {puedeDocumentos && (
        <MobileNavButton label="Docs" icon={FolderOpen} active={pathname.startsWith("/documentos")} onClick={() => { setMobileAccount(false); setMobileGroup((value) => value === "documentos" ? null : "documentos"); }} />
      )}
      {puedeContratos && (
        <MobileNavLink href="/contratos" label="Contratos" icon={ScrollText} active={pathname.startsWith("/contratos")} />
      )}
      {lectorIaEnabled && (
        <MobileNavLink href="/lector-ia" label="Lector IA" icon={Bot} active={pathname.startsWith("/lector-ia")} />
      )}
      <MobileNavButton label="Cuenta" icon={UserRound} active={mobileAccount} onClick={() => { setMobileGroup(null); setMobileAccount((value) => !value); }} />
    </nav>
    </>
  );
}

/**
 * Cápsula de tooltip estilo ChatGPT. Se coloca como hijo de un contenedor
 * que ya sea `group relative` (un botón o link) y aparece al hacer hover o
 * al enfocar con teclado. `bottom` = debajo, alineado a la derecha (toggle
 * de la barra superior); `right` = al costado (items del sidebar colapsado).
 * Fade-in con un retardo corto; fade-out inmediato.
 */
function TooltipBubble({ label, side = "bottom" }: { label: string; side?: "bottom" | "right" }) {
  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-50 whitespace-nowrap rounded-lg bg-[#2f2f2f] px-2.5 py-1.5 text-xs font-medium text-white shadow-[0_6px_20px_rgba(0,0,0,0.45)]",
        "opacity-0 transition-opacity delay-0 duration-150 group-hover:opacity-100 group-hover:delay-300 group-focus-visible:opacity-100",
        side === "bottom" ? "right-0 top-full mt-2" : "left-full top-1/2 ml-2 -translate-y-1/2"
      )}
    >
      {label}
    </span>
  );
}

function MobileNavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  const router = useRouter();
  const precargar = () => { if (!active) router.prefetch(href); };
  return <Link href={href} onPointerEnter={precargar} onFocus={precargar} onTouchStart={precargar} className={cn("flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-medium", active ? "text-brand-200" : "text-white/50")}><Icon className="h-[18px] w-[18px]" /><span className="max-w-full truncate px-1">{label}</span></Link>;
}

function MobileNavButton({ label, icon: Icon, active, onClick }: { label: string; icon: LucideIcon; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-medium", active ? "text-brand-200" : "text-white/50")}><Icon className="h-[18px] w-[18px]" /><span className="max-w-full truncate px-1">{label}</span></button>;
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  indent = false,
  collapsed = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  indent?: boolean;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const precargar = () => { if (!active) router.prefetch(href); };
  return (
    <Link
      href={href}
      onPointerEnter={precargar}
      onFocus={precargar}
      onTouchStart={precargar}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none",
        collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2",
        indent && !collapsed && "pl-8",
        active
          ? cn(
              "bg-white/[0.06] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:bg-white/[0.09]",
              !collapsed &&
                "before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-brand-400 before:shadow-glow"
            )
          : "text-white/50 hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] focus-visible:text-white"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-brand-300" : "text-white/35 group-hover:text-white/70"
        )}
      />
      {!collapsed && label}
      {collapsed && <TooltipBubble label={label} side="right" />}
    </Link>
  );
}

function NavGroup({
  item,
  pathname,
  collapsed = false,
}: {
  item: NavGroupItem;
  pathname: string;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const isGroupActive = item.children?.some(
    (c) => pathname === c.href || pathname.startsWith(c.href + "/")
  );
  // Se abre sola al entrar a una página de esta sección, pero una vez abierta
  // el toggle manual manda: cerrarla no debe "rebotar" abierta de nuevo solo
  // porque seguís en una página de ese grupo (antes `open || isGroupActive`
  // lo impedía). Sólo se vuelve a auto-abrir si `isGroupActive` pasa de
  // false a true (entraste al grupo desde afuera).
  const [open, setOpen] = useState(() => Boolean(isGroupActive));
  useEffect(() => {
    if (isGroupActive) setOpen(true);
  }, [isGroupActive]);
  const expanded = open;

  // Colapsado: el grupo se reduce a un único icono que enlaza con su primera
  // sección. Al expandir de nuevo, `isGroupActive` lo vuelve a abrir solo.
  if (collapsed) {
    const target = item.children[0]?.href ?? "#";
    const Icon = item.icon;
    return (
      <Link
        href={target}
        onPointerEnter={() => router.prefetch(target)}
        onFocus={() => router.prefetch(target)}
        onTouchStart={() => router.prefetch(target)}
        className={cn(
          "group relative flex items-center justify-center rounded-xl px-0 py-2.5 transition-colors focus-visible:outline-none",
          isGroupActive
            ? "bg-white/[0.06] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:bg-white/[0.09]"
            : "text-white/50 hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] focus-visible:text-white"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            isGroupActive ? "text-brand-300" : "text-white/35 group-hover:text-white/70"
          )}
        />
        <TooltipBubble label={item.label} side="right" />
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onPointerEnter={() => {
          const principal = item.children[0]?.href;
          if (principal) router.prefetch(principal);
        }}
        onFocus={() => {
          const principal = item.children[0]?.href;
          if (principal) router.prefetch(principal);
        }}
        aria-expanded={expanded}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
          isGroupActive
            ? "text-white hover:bg-white/[0.06]"
            : "text-white/45 hover:bg-white/[0.06] hover:text-white"
        )}
      >
        {item.icon && (
          <item.icon
            className={cn(
              "h-4 w-4 shrink-0 transition-colors",
              isGroupActive ? "text-brand-300" : "text-white/30 group-hover:text-white/60"
            )}
          />
        )}
        {item.label}
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 text-white/40 transition-transform group-hover:text-white/70",
            expanded && "rotate-180"
          )}
        />
      </button>
      {expanded && (
        <div className="mt-0.5 space-y-0.5">
          {item.children?.map((child) => {
            const active = child.exact
              ? pathname === child.href
              : pathname === child.href || pathname.startsWith(child.href + "/");
            return (
              <NavLink
                key={child.href}
                href={child.href}
                label={child.label}
                icon={child.icon}
                active={active}
                indent
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
