-- ============================================================
-- Cierre de vencimientos
-- ============================================================
-- Un contrato, SOAT o póliza vencido seguía en "Ya vencidos", la campana y el
-- correo durante 30 días aunque ya se supiera qué pasó con él. Igual que una
-- diligencia, ahora se cierra con un resultado y deja de avisar.
-- Diseño: docs/DISENO-CIERRE-VENCIMIENTOS.md.
--
-- La clave es (alerta_id, fecha): el cierre vale sólo para ESE vencimiento. Si
-- la fecha cambia (SOAT renovado, vencimiento corregido), la alerta nueva no
-- está cerrada y vuelve a avisar.

create table if not exists public.vencimientos_cierres (
  -- Mismo id que arma src/lib/alertas.ts: "contrato-<uuid>", "soat-<uuid>",
  -- "documento-<uuid>", "propiedad-<uuid>-<uuid>"…
  alerta_id          text not null,
  fecha              date not null,
  -- Tipo singular de la entidad dueña de la fecha (contrato, vehiculo,
  -- personal, documento, predio…): el que entienden area_entidad y
  -- acceso_entidad.
  entidad_tipo       text not null,
  entidad_id         uuid not null,
  resultado          text not null,
  nota               text,
  cerrado_por        uuid default auth.uid() references public.perfiles(id) on delete set null,
  -- Se guarda al cerrar, como actor_nombre en historial: leerlo no depende de
  -- poder ver perfiles ajenos.
  cerrado_por_nombre text,
  cerrado_en         timestamptz not null default now(),
  primary key (alerta_id, fecha),
  constraint vencimientos_cierres_resultado_valido
    check (resultado in ('RENOVADO','PRORROGADO','CONCLUIDO','RESUELTO','OTRO')),
  constraint vencimientos_cierres_nota_corta
    check (nota is null or char_length(nota) <= 500),
  constraint vencimientos_cierres_otro_con_nota
    check (resultado <> 'OTRO' or nullif(btrim(nota), '') is not null),
  constraint vencimientos_cierres_entidad_conocida
    check (public.area_entidad(entidad_tipo) is not null)
);

comment on table public.vencimientos_cierres is
  'Qué pasó con un vencimiento (contrato, SOAT, póliza…). Mientras no hay fila, sigue avisando.';

create index if not exists idx_vencimientos_cierres_fecha on public.vencimientos_cierres (fecha);
create index if not exists idx_vencimientos_cierres_entidad on public.vencimientos_cierres (entidad_tipo, entidad_id);

alter table public.vencimientos_cierres enable row level security;

-- Mismo criterio que historial y vínculos: se ve el cierre de lo que se ve, y
-- lo cierra (o lo reabre) quien puede editar el registro. No hay UPDATE:
-- cambiar el resultado es reabrir y volver a cerrar.
drop policy if exists vencimientos_cierres_lectura on public.vencimientos_cierres;
create policy vencimientos_cierres_lectura on public.vencimientos_cierres
  as permissive for select to authenticated
  using ((select public.es_admin()) or public.acceso_entidad(entidad_tipo, entidad_id));

drop policy if exists vencimientos_cierres_alta on public.vencimientos_cierres;
create policy vencimientos_cierres_alta on public.vencimientos_cierres
  as permissive for insert to authenticated
  with check (
    cerrado_por = auth.uid()
    and ((select public.es_admin()) or public.acceso_entidad(entidad_tipo, entidad_id, true))
  );

drop policy if exists vencimientos_cierres_baja on public.vencimientos_cierres;
create policy vencimientos_cierres_baja on public.vencimientos_cierres
  as permissive for delete to authenticated
  using ((select public.es_admin()) or public.acceso_entidad(entidad_tipo, entidad_id, true));

revoke all on table public.vencimientos_cierres from anon;
grant select, insert, delete on table public.vencimientos_cierres to authenticated;
grant all on table public.vencimientos_cierres to service_role;
