-- ============================================================
-- INVERSIONES CAVALA — Schema inicial
-- Sprint 1: Migración desde Notion
-- ============================================================
--
-- ⚠️  OBSOLETO — NO DESCRIBE LA BASE ACTUAL.
--
-- Este archivo es el diseño del Sprint 1 y quedó congelado. Varias tablas que
-- define no existen en producción (p. ej. `procesos_judiciales`, reemplazada por
-- la tabla única `procesos`, ver más abajo). El esquema vigente está en
-- supabase/esquema-produccion.sql (foto generada con
-- `node scripts/volcar-esquema.mjs`) más las migraciones posteriores.
-- No usar este archivo como referencia para escribir consultas ni migraciones.

-- Extensiones
create extension if not exists "uuid-ossp";
create extension if not exists "unaccent";

-- ============================================================
-- MÓDULO 1: ENTIDADES Y RELACIONES
-- ============================================================

create table propietarios (
  id          uuid primary key default uuid_generate_v4(),
  nombre      text not null,
  dni         text unique,
  ruc         text unique,
  telefono    text,
  email       text,
  direccion   text,
  notas       text,
  notion_id   text unique,            -- referencia origen para auditoría
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table predios (
  id              uuid primary key default uuid_generate_v4(),
  nombre          text not null,
  partida_registral text,
  ubicacion       text,
  area_m2         numeric,
  propietario_id  uuid references propietarios(id) on delete set null,
  notas           text,
  notion_id       text unique,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table vehiculos (
  id             uuid primary key default uuid_generate_v4(),
  placa          text not null unique,
  marca          text,
  modelo         text,
  anio           int,
  propietario_id uuid references propietarios(id) on delete set null,
  notas          text,
  notion_id      text unique,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create table concesiones_mineras (
  id             uuid primary key default uuid_generate_v4(),
  nombre         text not null,
  codigo_minero  text unique,
  hectareas      numeric,
  ubicacion      text,
  propietario_id uuid references propietarios(id) on delete set null,
  estado         text check (estado in ('activa','suspendida','extinguida')) default 'activa',
  notas          text,
  notion_id      text unique,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create table personal (
  id           uuid primary key default uuid_generate_v4(),
  nombre       text not null,
  dni          text unique,
  cargo        text,
  area         text,
  telefono     text,
  email        text,
  fecha_ingreso date,
  activo       boolean default true,
  notas        text,
  notion_id    text unique,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table oficinas_registrales (
  id         uuid primary key default uuid_generate_v4(),
  nombre     text not null,
  codigo     text unique,
  region     text,
  direccion  text,
  telefono   text,
  notas      text,
  notion_id  text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- MÓDULO 2: PROCESOS JUDICIALES
-- ============================================================

create type materia_judicial as enum (
  'Civil',
  'Penal',
  'Laboral',
  'Constitucional',
  'Administrativo',
  'Comercial',
  'Familia',
  'Contencioso Administrativo',
  'Direccion de Trabajo'
);

-- ⚠️  NADA DE ESTE BLOQUE EXISTE EN PRODUCCIÓN.
-- En la base real hay una sola tabla `procesos` (materia como discriminador) y
-- `estado` es `text` con el vocabulario propio de cada materia — no este enum.
-- Ver supabase/migrations/20260916160000_estado_procesos_vocabulario_real.sql.
create type estado_proceso as enum ('activo','cerrado','archivado','apelacion');

create table procesos_judiciales (
  id               uuid primary key default uuid_generate_v4(),
  expediente       text not null,
  materia          materia_judicial not null,
  estado           estado_proceso default 'activo',
  juzgado          text,
  instancia        text,
  demandante       text,
  demandado        text,
  abogado          text,
  fecha_inicio     date,
  fecha_vencimiento date,               -- para alertas
  propietario_id   uuid references propietarios(id) on delete set null,
  notas            text,
  notion_id        text unique,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create table actuaciones (
  id          uuid primary key default uuid_generate_v4(),
  proceso_id  uuid not null references procesos_judiciales(id) on delete cascade,
  tipo        text not null,           -- escrito, resolución, cédula, etc.
  descripcion text,
  fecha       date,
  notion_id   text unique,
  created_at  timestamptz default now()
);

-- ============================================================
-- MÓDULO 3: DOCUMENTOS (metadata → R2 guarda el binario)
-- ============================================================

create type tipo_documento as enum (
  'Partida registral',
  'Escritura publica',
  'Contrato',
  'Resolucion',
  'Escrito',
  'Acta',
  'Informe',
  'Poder',
  'Certificado',
  'Otro'
);

create table documentos (
  id              uuid primary key default uuid_generate_v4(),
  nombre          text not null,
  tipo            tipo_documento default 'Otro',
  r2_key          text not null unique,     -- path en el bucket R2
  content_type    text not null default 'application/pdf',
  size_bytes      bigint,
  -- Relaciones opcionales (un doc puede pertenecer a múltiples entidades)
  propietario_id  uuid references propietarios(id) on delete set null,
  predio_id       uuid references predios(id) on delete set null,
  vehiculo_id     uuid references vehiculos(id) on delete set null,
  concesion_id    uuid references concesiones_mineras(id) on delete set null,
  proceso_id      uuid references procesos_judiciales(id) on delete set null,
  actuacion_id    uuid references actuaciones(id) on delete set null,
  -- Metadata extra
  descripcion     text,
  fecha_documento date,
  notas           text,
  notion_id       text unique,
  uploaded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- CONTRATOS (tipos adicionales fuera de Procesos)
-- ============================================================

create table contratos (
  id             uuid primary key default uuid_generate_v4(),
  tipo           text not null,           -- servicio, concesion, arrendamiento, etc.
  descripcion    text,
  fecha_inicio   date,
  fecha_fin      date,
  monto          numeric,
  moneda         text default 'PEN',
  propietario_id uuid references propietarios(id) on delete set null,
  documento_id   uuid references documentos(id) on delete set null,
  notas          text,
  notion_id      text unique,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ============================================================
-- EVENTOS
-- ============================================================

create table eventos (
  id          uuid primary key default uuid_generate_v4(),
  titulo      text not null,
  descripcion text,
  fecha       date not null,
  hora        time,
  alerta_dias int default 7,            -- días antes para alertar
  proceso_id  uuid references procesos_judiciales(id) on delete set null,
  contrato_id uuid references contratos(id) on delete set null,
  notas       text,
  notion_id   text unique,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- AUDITORÍA DE MIGRACIÓN
-- ============================================================

create table migracion_log (
  id         uuid primary key default uuid_generate_v4(),
  entidad    text not null,
  notion_id  text,
  accion     text not null,             -- 'insert','update','skip','error'
  detalle    text,
  created_at timestamptz default now()
);

-- ============================================================
-- TRIGGERS: updated_at automático
-- ============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'propietarios','predios','vehiculos','concesiones_mineras',
    'personal','oficinas_registrales','procesos_judiciales',
    'documentos','contratos','eventos'
  ] loop
    execute format(
      'create trigger trg_%s_updated_at before update on %s
       for each row execute function set_updated_at()', t, t
    );
  end loop;
end;
$$;

-- ============================================================
-- RLS (Row Level Security) — base
-- ============================================================

alter table propietarios          enable row level security;
alter table predios               enable row level security;
alter table vehiculos             enable row level security;
alter table concesiones_mineras   enable row level security;
alter table personal              enable row level security;
alter table oficinas_registrales  enable row level security;
alter table procesos_judiciales   enable row level security;
alter table actuaciones           enable row level security;
alter table documentos            enable row level security;
alter table contratos             enable row level security;
alter table eventos               enable row level security;

-- Política base: solo usuarios autenticados
create policy "auth_only" on propietarios         for all to authenticated using (true) with check (true);
create policy "auth_only" on predios              for all to authenticated using (true) with check (true);
create policy "auth_only" on vehiculos            for all to authenticated using (true) with check (true);
create policy "auth_only" on concesiones_mineras  for all to authenticated using (true) with check (true);
create policy "auth_only" on personal             for all to authenticated using (true) with check (true);
create policy "auth_only" on oficinas_registrales for all to authenticated using (true) with check (true);
create policy "auth_only" on procesos_judiciales  for all to authenticated using (true) with check (true);
create policy "auth_only" on actuaciones          for all to authenticated using (true) with check (true);
create policy "auth_only" on documentos           for all to authenticated using (true) with check (true);
create policy "auth_only" on contratos            for all to authenticated using (true) with check (true);
create policy "auth_only" on eventos              for all to authenticated using (true) with check (true);
