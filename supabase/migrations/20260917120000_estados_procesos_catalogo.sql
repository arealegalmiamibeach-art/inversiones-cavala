-- ============================================================
-- CATÁLOGO EDITABLE DE ESTADOS DE PROCESOS
-- ============================================================
-- Hasta ahora el vocabulario de `procesos.estado` vivía hardcodeado en
-- app/(dashboard)/procesos/opciones.ts: para agregar o quitar un estado
-- había que tocar código y redesplegar. Esta tabla lo saca de ahí sin tocar
-- `procesos.estado` (sigue siendo texto libre) — sólo el catálogo de
-- opciones válidas pasa a vivir en la base y ser editable desde la UI.
--
-- `materia`: si es NULL, la opción aplica a todas las materias (como hoy);
-- si tiene valor, sólo se ofrece en esa materia y en "Todos los procesos"
-- aparece seccionada bajo su nombre.

create table if not exists estados_procesos (
  id           uuid primary key default gen_random_uuid(),
  valor        text not null unique check (char_length(btrim(valor)) between 1 and 80),
  clase_color  text not null,
  color_punto  text not null,
  materia      text check (materia is null or materia in (
                 'administrativo', 'civil', 'penal', 'carpeta_fiscal',
                 'contencioso_administrativo', 'laboral', 'sunafil',
                 'conciliacion', 'constitucional', 'direccion_trabajo'
               )),
  creado_por   uuid references auth.users(id) on delete set null,
  creado_en    timestamptz not null default now()
);

create index if not exists estados_procesos_orden on estados_procesos (creado_en, id);

alter table estados_procesos enable row level security;

drop policy if exists "estados_procesos_lectura" on estados_procesos;
create policy "estados_procesos_lectura" on estados_procesos
  for select to authenticated using (true);

drop policy if exists "estados_procesos_escritura" on estados_procesos;
create policy "estados_procesos_escritura" on estados_procesos
  for all to authenticated using (puede_escribir()) with check (puede_escribir());

revoke all on estados_procesos from anon;
grant select, insert, update, delete on estados_procesos to authenticated;

-- Semilla: los 12 estados que ya existían en opciones.ts, con el mismo
-- texto y color, sin materia asignada (siguen aplicando a todos los
-- procesos exactamente como hoy hasta que alguien los reagrupe desde la UI).
insert into estados_procesos (valor, clase_color, color_punto) values
  ('ADMISORIA',              'bg-blue-500/15 text-blue-300',     '#3b82f6'),
  ('FORMALIZADA',            'bg-indigo-500/15 text-indigo-300', '#6366f1'),
  ('SANEAMIENTO',            'bg-sky-500/15 text-sky-300',       '#0ea5e9'),
  ('ALEGATOS APERTURA',      'bg-cyan-500/15 text-cyan-300',     '#06b6d4'),
  ('ACTUACIÓN PROBATORIA',   'bg-teal-500/15 text-teal-300',     '#14b8a6'),
  ('AUD. UNICA',             'bg-amber-500/15 text-amber-300',   '#f59e0b'),
  ('AUD.PRUEBAS',            'bg-amber-500/15 text-amber-300',   '#f59e0b'),
  ('SENTENCIA 1° INSTANCIA', 'bg-violet-500/15 text-violet-300', '#8b5cf6'),
  ('SENTENCIA 2° INSTANCIA', 'bg-purple-500/15 text-purple-300', '#a855f7'),
  ('IMPUGNACIÓN',            'bg-orange-500/15 text-orange-300', '#f97316'),
  ('CASACION',               'bg-rose-500/15 text-rose-300',     '#f43f5e'),
  ('ARCHIVADO',              'bg-white/10 text-white/50',        'rgba(255,255,255,0.35)')
on conflict (valor) do nothing;
