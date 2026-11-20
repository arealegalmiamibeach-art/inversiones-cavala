"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Bell,
  CalendarClock,
  Car,
  Check,
  CheckCheck,
  CircleCheck,
  ClipboardList,
  FileText,
  Gavel,
  MapPin,
  Paperclip,
  ScrollText,
  UserRound,
} from "lucide-react";
import { useAlertas } from "@/lib/alertas-context";
import { createClient } from "@/lib/supabase/client";
import {
  agruparPorCategoria,
  cargarNotificaciones,
  notificacionesGuardadas,
  CATEGORIAS_NOTIFICACION,
  contarNoLeidas,
  fechaRelativa,
  guardarLeidas,
  leerLeidas,
  type CategoriaNotificacion,
  type IconoNotificacion,
  type Notificacion,
} from "@/lib/notificaciones";
import { cn } from "@/lib/utils";

const ICONOS: Record<IconoNotificacion, typeof Bell> = {
  contrato: ScrollText,
  vehiculo: Car,
  personal: UserRound,
  documento: FileText,
  proceso: Gavel,
  predio: MapPin,
  archivo: Paperclip,
  evento: CalendarClock,
  revision: ClipboardList,
};

const ESTILO_CATEGORIA: Record<CategoriaNotificacion, string> = {
  urgente: "bg-red-500/12 text-red-300",
  diligencia: "bg-violet-500/12 text-violet-300",
  novedad: "bg-brand-500/12 text-brand-300",
  revision: "bg-amber-500/12 text-amber-300",
};

const ESTILO_NIVEL: Record<Notificacion["nivel"], string> = {
  critico: "text-red-300",
  proximo: "text-amber-300",
  normal: "text-white/45",
  info: "text-white/40",
};

type NotificationBellProps = {
  usuarioId?: string;
  variant?: "icon" | "sidebar";
  collapsed?: boolean;
  placement?: "bottom-end" | "right-end" | "right-start" | "top-end";
};

export function NotificationBell({
  usuarioId,
  variant = "icon",
  collapsed = false,
  placement = "bottom-end",
}: NotificationBellProps = {}) {
  const alertas = useAlertas();
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<{
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  } | null>(null);
  const [montado, setMontado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [items, setItems] = useState<Notificacion[]>([]);
  const [leidas, setLeidas] = useState<Record<string, number>>({});
  const [usuario, setUsuario] = useState<string | undefined>(usuarioId);
  const [pestana, setPestana] = useState<CategoriaNotificacion>("urgente");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMontado(true), []);

  // El id de usuario sólo se usa para separar el "leído" de cada cuenta en
  // este navegador; si el layout llega a pasarlo como prop, no se consulta.
  useEffect(() => {
    if (usuarioId) return;
    let vigente = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (vigente) setUsuario(data.user?.id);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [usuarioId]);

  useEffect(() => {
    setLeidas(leerLeidas(usuario));
  }, [usuario]);

  const cargar = useCallback(
    async (forzar = false) => {
      // Las alertas llegan del layout sin bloquear la página; hasta entonces
      // la campana espera (sin esto calcularía las alertas por su cuenta).
      if (alertas === null) return;
      const supabase = createClient();
      try {
        const datos = await cargarNotificaciones(supabase, { alertas, forzar, usuarioId: usuario });
        setItems(datos);
      } catch {
        setItems([]);
      } finally {
        setCargando(false);
      }
    },
    [alertas, usuario]
  );

  // Primero lo guardado (pinta el contador al instante tras una recarga) y la
  // carga real cuando el navegador queda libre, para no competir con la
  // hidratación de la página por la red y el hilo principal.
  useEffect(() => {
    if (alertas === null) return;
    const guardadas = notificacionesGuardadas(alertas, usuario);
    if (guardadas) {
      setItems(guardadas);
      setCargando(false);
    }
    const programar = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1500));
    const cancelar = window.cancelIdleCallback ?? window.clearTimeout;
    const id = programar(() => void cargar(), { timeout: 4000 });
    return () => cancelar(id);
  }, [alertas, usuario, cargar]);

  // Al abrir se revalida (la carga interna reutiliza su caché si sigue fresca).
  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  // Refresco periódico: la campana ya no depende de que el usuario navegue para
  // enterarse de un vencimiento o una diligencia nueva. Se pausa con la pestaña
  // oculta para no consultar de fondo sin necesidad.
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar(true);
    }, 5 * 60_000);
    return () => window.clearInterval(intervalo);
  }, [cargar]);

  useEffect(() => {
    if (!abierto) return;
    function onClickAfuera(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setAbierto(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    function onScroll(e: Event) {
      // capture:true intercepta cualquier scroll de la página, incluido el
      // scroll interno del propio menú (overflow-y-auto) — no cerrarlo por eso.
      if (menuRef.current?.contains(e.target as Node)) return;
      setAbierto(false);
    }
    document.addEventListener("mousedown", onClickAfuera);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClickAfuera);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [abierto]);

  function alternar() {
    if (!abierto && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      if (placement === "right-end") {
        setPosicion({
          left: r.right + 8,
          bottom: window.innerHeight - r.bottom,
        });
      } else if (placement === "right-start") {
        setPosicion({
          top: r.top,
          left: r.right + 8,
        });
      } else if (placement === "top-end") {
        setPosicion({
          right: window.innerWidth - r.right,
          bottom: window.innerHeight - r.top + 8,
        });
      } else {
        setPosicion({ top: r.bottom + 8, right: window.innerWidth - r.right });
      }
    }
    setAbierto((a) => !a);
  }

  const marcarLeida = useCallback(
    (id: string) => {
      setLeidas((previas) => {
        if (previas[id]) return previas;
        const siguiente = { ...previas, [id]: Date.now() };
        guardarLeidas(usuario, siguiente);
        return siguiente;
      });
    },
    [usuario]
  );

  const marcarTodo = useCallback(() => {
    setLeidas((previas) => {
      const ahora = Date.now();
      const siguiente = { ...previas };
      for (const item of items) if (!siguiente[item.id]) siguiente[item.id] = ahora;
      guardarLeidas(usuario, siguiente);
      return siguiente;
    });
  }, [items, usuario]);

  const grupos = useMemo(() => agruparPorCategoria(items), [items]);
  // Sin montar todavía no hay localStorage: contar 0 evita el parpadeo de la
  // burbuja con notificaciones que el usuario ya había leído.
  const sinLeer = montado ? contarNoLeidas(items, leidas) : 0;

  // Abrir en la primera pestaña que tenga algo pendiente.
  useEffect(() => {
    if (!abierto) return;
    setPestana((actual) => {
      if (grupos[actual].length > 0) return actual;
      return CATEGORIAS_NOTIFICACION.find((c) => grupos[c.id].length > 0)?.id ?? actual;
    });
  }, [abierto, grupos]);

  const visibles = grupos[pestana];

  const menu = posicion && (
    <div
      ref={menuRef}
      style={posicion}
      className="fixed z-[90] flex max-h-[min(70vh,32rem)] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#11131c] shadow-glass-lg"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Notificaciones</p>
        {sinLeer > 0 && (
          <button
            type="button"
            onClick={marcarTodo}
            className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium text-white/45 transition-colors hover:bg-white/5 hover:text-white/80"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar todo como leído
          </button>
        )}
      </div>

      <div className="scrollbar-glass flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 px-2 py-2">
        {CATEGORIAS_NOTIFICACION.map(({ id, label }) => {
          const pendientes = contarNoLeidas(grupos[id], leidas);
          const activa = pestana === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPestana(id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                activa ? "bg-white/10 text-white" : "text-white/45 hover:bg-white/5 hover:text-white/70"
              )}
            >
              {label}
              <span
                className={cn(
                  "min-w-4 rounded-full px-1 text-[10px] font-bold leading-4 tabular-nums",
                  pendientes > 0
                    ? id === "urgente"
                      ? "bg-red-500/25 text-red-200"
                      : "bg-white/15 text-white/80"
                    : "bg-white/5 text-white/30"
                )}
              >
                {grupos[id].length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="scrollbar-glass min-h-0 flex-1 overflow-y-auto">
        {cargando ? (
          <ul className="divide-y divide-white/5">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-white/5" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-white/5" />
                </div>
              </li>
            ))}
          </ul>
        ) : visibles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <CircleCheck className="h-7 w-7 text-white/15" />
            <p className="text-xs text-white/40">Todo al día</p>
            <p className="text-[11px] text-white/25">Nada pendiente en esta sección.</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {visibles.map((item) => {
              const Icono = ICONOS[item.icono];
              const leida = !!leidas[item.id];
              const relativo = fechaRelativa(item.fecha, item.dias);
              return (
                <li key={item.id} className="group relative">
                  <Link
                    href={item.href}
                    onClick={() => {
                      marcarLeida(item.id);
                      setAbierto(false);
                    }}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/5",
                      leida && "opacity-45"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        ESTILO_CATEGORIA[item.categoria]
                      )}
                    >
                      <Icono className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium text-white/90">{item.titulo}</p>
                        {relativo && (
                          <span
                            className={cn(
                              "shrink-0 pr-6 text-[11px] font-semibold tabular-nums",
                              ESTILO_NIVEL[item.nivel]
                            )}
                          >
                            {relativo}
                          </span>
                        )}
                      </div>
                      {item.detalle && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/45">{item.detalle}</p>
                      )}
                    </div>
                  </Link>
                  {!leida && (
                    <button
                      type="button"
                      onClick={() => marcarLeida(item.id)}
                      title="Marcar como leído"
                      aria-label="Marcar como leído"
                      className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-white/10 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={alternar}
        aria-label={sinLeer === 0 ? "Notificaciones" : `Notificaciones, ${sinLeer} sin leer`}
        title={sinLeer === 0 ? "Sin notificaciones nuevas" : `${sinLeer} notificación${sinLeer === 1 ? "" : "es"} sin leer`}
        className={cn(
          "relative flex items-center rounded-xl text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-400/50",
          variant === "icon"
            ? "h-10 w-10 justify-center border border-white/10 bg-white/5 sm:h-9 sm:w-9"
            : collapsed
              ? "h-auto w-full justify-center px-0 py-2.5"
              : "h-auto w-full gap-2.5 px-3 py-2 text-sm font-medium",
          abierto && "bg-white/10 text-white"
        )}
      >
        <Bell className="h-4 w-4 shrink-0" />
        {variant === "sidebar" && !collapsed && <span>Notificaciones</span>}
        {sinLeer > 0 && (
          <span
            className={cn(
              "flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-glow",
              variant === "sidebar" && !collapsed ? "ml-auto" : "absolute -right-1 -top-1"
            )}
          >
            {sinLeer > 99 ? "99+" : sinLeer}
          </span>
        )}
      </button>
      {abierto && montado && createPortal(menu, document.body)}
    </>
  );
}
