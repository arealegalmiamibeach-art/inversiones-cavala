import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { DashboardTabs } from "@/components/layout/dashboard-tabs";
import { DivergingBar, type FilaVencimiento } from "@/components/ui/charts/diverging-bar";
import { MatrizPatrimonio } from "@/components/ui/charts/matriz-patrimonio";
import { BarrasLitigios, type FilaMateria } from "@/components/ui/charts/barras-litigios";
import { AlertTriangle, ArrowRight, Landmark, Scale, FileWarning } from "lucide-react";
import { hoyISOEnLima, sumarDiasISO } from "@/lib/utils";

const DIAS_FUTURO = 90;

const MATERIA_LABEL: Record<string, string> = {
  administrativo: "Administrativo",
  civil: "Civil",
  penal: "Penal",
  carpeta_fiscal: "Carpeta Fiscal",
  contencioso_administrativo: "Contencioso Adm.",
  laboral: "Laboral",
  sunafil: "SUNAFIL",
  conciliacion: "Conciliación",
  constitucional: "Constitucional",
  direccion_trabajo: "Dirección de Trabajo",
};

function hoyISO() {
  return hoyISOEnLima();
}
function enDiasISO(dias: number) {
  return sumarDiasISO(hoyISOEnLima(), dias);
}

export default async function RiesgoPage() {
  const supabase = await createClient();

  const hoy = hoyISO();
  const futuro = enDiasISO(DIAS_FUTURO);

  const [
    { data: contratos },
    { data: vehiculos },
    { data: personal, error: errPersonal },
    { data: predios },
    { data: procesos },
    { data: vinculosPredioProceso },
    { data: archivosContrato },
    { count: docsSinFecha },
    { count: docsTotal },
  ] = await Promise.all([
    supabase.from("contratos").select("id, monto, moneda, fecha_vencimiento"),
    supabase.from("vehiculos").select("id, categoria, soat_vence, poliza_vence, revision_tecnica"),
    supabase.from("personal").select("id, contrato_fin, activo"),
    supabase.from("predios").select("id, registrado, a_nombre_de"),
    supabase.from("procesos").select("id, materia, descripcion"),
    supabase
      .from("vinculos")
      .select("origen_tipo, origen_id, destino_tipo, destino_id")
      .or(
        "and(origen_tipo.eq.predio,destino_tipo.eq.proceso),and(origen_tipo.eq.proceso,destino_tipo.eq.predio)"
      ),
    supabase.from("archivos").select("entidad_id").eq("entidad_tipo", "contrato"),
    supabase.from("documentos").select("*", { count: "exact", head: true }).is("fecha", null),
    supabase.from("documentos").select("*", { count: "exact", head: true }),
  ]);

  const sinAccesoPersonal = errPersonal?.code === "42501";

  // ─── Vencimientos: acumulado vencido vs próximo ───────────────────────────
  const vencido = (f: string | null | undefined) => !!f && f < hoy;
  const proximo = (f: string | null | undefined) => !!f && f >= hoy && f <= futuro;

  const cVencidos = (contratos ?? []).filter((c) => vencido(c.fecha_vencimiento));
  const cProximos = (contratos ?? []).filter((c) => proximo(c.fecha_vencimiento));
  const pVencidos = (personal ?? []).filter((p) => vencido(p.contrato_fin));
  const pProximos = (personal ?? []).filter((p) => proximo(p.contrato_fin));
  const soatVencidos = (vehiculos ?? []).filter((v) => vencido(v.soat_vence));
  const soatProximos = (vehiculos ?? []).filter((v) => proximo(v.soat_vence));
  const polVencidos = (vehiculos ?? []).filter((v) => vencido(v.poliza_vence));
  const polProximos = (vehiculos ?? []).filter((v) => proximo(v.poliza_vence));
  const revVencidos = (vehiculos ?? []).filter((v) => vencido(v.revision_tecnica));
  const revProximos = (vehiculos ?? []).filter((v) => proximo(v.revision_tecnica));

  const filasVenc: FilaVencimiento[] = [
    { label: "Contratos", vencidos: cVencidos.length, proximos: cProximos.length, href: "/contratos" },
    ...(sinAccesoPersonal
      ? []
      : [{ label: "Personal", vencidos: pVencidos.length, proximos: pProximos.length, href: "/entidades/personal" }]),
    { label: "SOAT", vencidos: soatVencidos.length, proximos: soatProximos.length, href: "/entidades/vehiculos" },
    { label: "Pólizas", vencidos: polVencidos.length, proximos: polProximos.length, href: "/entidades/vehiculos" },
    { label: "Revisión técnica", vencidos: revVencidos.length, proximos: revProximos.length, href: "/entidades/vehiculos" },
  ];

  const totalVencidos = filasVenc.reduce((s, f) => s + f.vencidos, 0);
  const totalProximos = filasVenc.reduce((s, f) => s + f.proximos, 0);

  // La columna `moneda` tiene default 'PEN' pero muchas filas la traen vacía
  // desde la migración: todo lo que no sea USD explícito cuenta como soles.
  const montoDe = (rows: typeof cVencidos, usd: boolean) =>
    rows
      .filter((c) => (usd ? c.moneda === "USD" : c.moneda !== "USD"))
      .reduce((s, c) => s + (Number(c.monto) || 0), 0);

  const montoVencidoPEN = montoDe(cVencidos, false);
  const montoVencidoUSD = montoDe(cVencidos, true);
  const montoTotalPEN = montoDe((contratos ?? []) as typeof cVencidos, false);
  const pctValorVencido = montoTotalPEN > 0 ? Math.round((montoVencidoPEN / montoTotalPEN) * 100) : 0;

  // ─── Patrimonio: registrado × titularidad ─────────────────────────────────
  const esTerceros = (v: string | null) => (v ?? "").includes("3ros");
  const P = predios ?? [];
  const registradoNuestro = P.filter((p) => p.registrado === true && !esTerceros(p.a_nombre_de)).length;
  const registradoTerceros = P.filter((p) => p.registrado === true && esTerceros(p.a_nombre_de)).length;
  const noRegNuestro = P.filter((p) => p.registrado !== true && !esTerceros(p.a_nombre_de)).length;
  const noRegTerceros = P.filter((p) => p.registrado !== true && esTerceros(p.a_nombre_de)).length;

  const prediosEnLitigio = new Set<string>();
  for (const v of vinculosPredioProceso ?? []) {
    if (v.origen_tipo === "predio") prediosEnLitigio.add(v.origen_id);
    if (v.destino_tipo === "predio") prediosEnLitigio.add(v.destino_id);
  }
  const enLitigioRiesgo = P.filter(
    (p) => prediosEnLitigio.has(p.id) && (p.registrado !== true || esTerceros(p.a_nombre_de))
  ).length;

  // ─── Litigios: volumen y salud del seguimiento ────────────────────────────
  // El seguimiento se mide sobre `descripcion` (la bitácora del expediente), no
  // sobre `estado`: solo cuatro materias manejan estado, así que contarlo dejaría
  // a las otras seis como "sin seguimiento" por definición.
  const agrupado: Record<string, { con: number; sin: number }> = {};
  for (const p of procesos ?? []) {
    const m = p.materia as string;
    agrupado[m] ??= { con: 0, sin: 0 };
    if (p.descripcion && String(p.descripcion).trim()) agrupado[m].con++;
    else agrupado[m].sin++;
  }
  const filasMateria: FilaMateria[] = Object.entries(agrupado).map(([m, v]) => ({
    label: MATERIA_LABEL[m] ?? m,
    conSeguimiento: v.con,
    sinSeguimiento: v.sin,
    href: `/procesos?materia=${m}`,
  }));
  const procesosSinSeguimiento = Object.values(agrupado).reduce((s, v) => s + v.sin, 0);
  const procesosTotal = (procesos ?? []).length;

  // ─── Pendientes de completar ──────────────────────────────────────────────
  const idsConArchivo = new Set((archivosContrato ?? []).map((a) => a.entidad_id));
  const contratosSinArchivo = (contratos ?? []).filter((c) => !idsConArchivo.has(c.id)).length;
  const vehiculosSinCategoria = (vehiculos ?? []).filter((v) => !v.categoria).length;

  const fmt = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 0 });
  const millones = (n: number) => `S/ ${(n / 1_000_000).toFixed(1)} M`;

  return (
    <div className="flex h-full flex-col">
      <Header title="Dashboard" />
      <DashboardTabs />

      <div className="scrollbar-glass viz flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-4">

        {/* ─── Hero: exposición acumulada ─────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="glass-panel relative overflow-hidden p-6 lg:col-span-2">
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full blur-[90px]"
              style={{ background: "var(--viz-critical)", opacity: 0.18 }}
            />
            <p className="text-xs font-semibold uppercase tracking-wider text-white/35">
              Exposición vencida
            </p>
            <p
              className="mt-2 text-5xl font-bold leading-none"
              style={{ color: "var(--viz-critical)" }}
            >
              {millones(montoVencidoPEN)}
            </p>
            <p className="mt-2 text-sm text-white/55">
              S/ {fmt(montoVencidoPEN)}
              {montoVencidoUSD > 0 && <> · US$ {fmt(montoVencidoUSD)}</>} en contratos ya vencidos
              {pctValorVencido > 0 && (
                <>
                  {" "}— <strong className="font-semibold text-white/80">{pctValorVencido}%</strong> del
                  valor de la cartera
                </>
              )}
            </p>
          </div>

          <div className="glass-panel flex flex-col justify-center p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/35">
              Compromisos vencidos
            </p>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-5xl font-bold leading-none" style={{ color: "var(--viz-critical)" }}>
                {totalVencidos}
              </span>
              <span className="text-sm text-white/45">
                vs {totalProximos} próximos
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/45">
              {totalProximos > 0 && totalVencidos > totalProximos ? (
                <>
                  Hay{" "}
                  <strong className="font-semibold text-white/70">
                    {(totalVencidos / totalProximos).toFixed(1)}×
                  </strong>{" "}
                  más compromisos vencidos que próximos a vencer.
                </>
              ) : (
                <>Suma de contratos, personal, SOAT y pólizas.</>
              )}
            </p>
          </div>
        </div>

        {/* ─── Termómetro de vencimientos ─────────────────────────────────── */}
        <div className="glass-panel p-5">
          <div className="mb-1 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-white/40" />
            <h3 className="text-sm font-semibold text-white/85">Termómetro de vencimientos</h3>
          </div>
          <p className="mb-4 text-xs text-white/40">
            Lo acumulado vencido a la izquierda, lo que vence en {DIAS_FUTURO} días a la derecha.
            Ambos brazos comparten la misma escala.
          </p>
          <DivergingBar filas={filasVenc} diasFuturo={DIAS_FUTURO} />
          {sinAccesoPersonal && (
            <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/35">
              Personal no se incluye: tu rol no tiene acceso a esa tabla.
            </p>
          )}
        </div>

        {/* ─── Patrimonio + Litigios ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="glass-panel p-5 lg:col-span-2">
            <div className="mb-1 flex items-center gap-2">
              <Landmark className="h-4 w-4 text-white/40" />
              <h3 className="text-sm font-semibold text-white/85">Riesgo registral del patrimonio</h3>
            </div>
            <p className="mb-4 text-xs text-white/40">Predios por estado registral y titularidad.</p>
            <MatrizPatrimonio
              registradoNuestro={registradoNuestro}
              registradoTerceros={registradoTerceros}
              noRegNuestro={noRegNuestro}
              noRegTerceros={noRegTerceros}
              enLitigioRiesgo={enLitigioRiesgo}
              total={P.length}
            />
          </div>

          <div className="glass-panel p-5 lg:col-span-3">
            <div className="mb-1 flex items-center gap-2">
              <Scale className="h-4 w-4 text-white/40" />
              <h3 className="text-sm font-semibold text-white/85">Cartera de litigios</h3>
            </div>
            <p className="mb-4 text-xs text-white/40">
              {procesosTotal} expedientes · {procesosSinSeguimiento} sin seguimiento registrado
            </p>
            <BarrasLitigios filas={filasMateria} />
          </div>
        </div>

        {/* ─── Pendientes accionables ─────────────────────────────────────── */}
        <div className="glass-panel p-5">
          <div className="mb-1 flex items-center gap-2">
            <FileWarning className="h-4 w-4 text-white/40" />
            <h3 className="text-sm font-semibold text-white/85">Pendientes de completar</h3>
          </div>
          <p className="mb-4 text-xs text-white/40">
            Vacíos que debilitan la trazabilidad. Cada uno lleva a su lista para completarlo.
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Pendiente n={procesosSinSeguimiento} de={procesosTotal} label="procesos sin seguimiento" href="/procesos" />
            <Pendiente n={contratosSinArchivo} de={(contratos ?? []).length} label="contratos sin archivo" href="/contratos/tipo/todos" />
            <Pendiente n={docsSinFecha ?? 0} de={docsTotal ?? 0} label="documentos sin fecha" href="/documentos" />
            <Pendiente n={vehiculosSinCategoria} de={(vehiculos ?? []).length} label="vehículos sin categoría" href="/entidades/vehiculos" />
          </div>
        </div>

      </div>
    </div>
  );
}

function Pendiente({ n, de, label, href }: { n: number; de: number; label: string; href: string }) {
  const pct = de > 0 ? Math.round((n / de) * 100) : 0;
  return (
    <Link
      href={href}
      className="group rounded-xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.07]"
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums text-white/90">{n}</span>
        <span className="text-xs text-white/35">de {de}</span>
      </div>
      <p className="mt-1 text-xs leading-snug text-white/55">{label}</p>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--viz-neutral)" }} />
      </div>
      <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-white/30 transition-colors group-hover:text-brand-300">
        Completar <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}
