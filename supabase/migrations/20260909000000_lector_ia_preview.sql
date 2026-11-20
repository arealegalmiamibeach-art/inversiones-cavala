-- Preview comercial del Lector IA. El texto OCR y las conversaciones no se
-- guardan: estas tablas almacenan únicamente acceso, cupos y auditoría de uso.

create table if not exists public.lector_ia_accesos (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  activo boolean not null default true,
  inicia_en timestamptz not null default now(),
  termina_en timestamptz not null default (now() + interval '12 months'),
  max_documentos integer not null default 200 check (max_documentos >= 0),
  max_paginas integer not null default 1500 check (max_paginas >= 0),
  max_consultas integer not null default 1000 check (max_consultas >= 0),
  max_openai_usd numeric(10,4) not null default 3.5 check (max_openai_usd >= 0),
  max_xai_usd numeric(10,4) not null default 4.5 check (max_xai_usd >= 0),
  max_ocr_usd numeric(10,4) not null default 6 check (max_ocr_usd >= 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (termina_en > inicia_en)
);

create table if not exists public.lector_ia_uso (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('ocr', 'consulta', 'fallback', 'busqueda')),
  proveedor text not null check (proveedor in ('local', 'mistral', 'cerebras', 'groq', 'openai', 'xai', 'perplexity')),
  modelo text not null,
  documentos integer not null default 0 check (documentos >= 0),
  paginas integer not null default 0 check (paginas >= 0),
  consultas integer not null default 0 check (consultas >= 0),
  costo_estimado_usd numeric(12,6) not null default 0 check (costo_estimado_usd >= 0),
  creado_en timestamptz not null default now()
);

create index if not exists lector_ia_uso_usuario_fecha_idx
  on public.lector_ia_uso (usuario_id, creado_en desc);

alter table public.lector_ia_accesos enable row level security;
alter table public.lector_ia_uso enable row level security;

drop policy if exists lector_ia_acceso_propio on public.lector_ia_accesos;
create policy lector_ia_acceso_propio on public.lector_ia_accesos
  for select to authenticated using (usuario_id = auth.uid() or es_admin());

drop policy if exists lector_ia_acceso_admin on public.lector_ia_accesos;
create policy lector_ia_acceso_admin on public.lector_ia_accesos
  for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists lector_ia_uso_propio on public.lector_ia_uso;
create policy lector_ia_uso_propio on public.lector_ia_uso
  for select to authenticated using (usuario_id = auth.uid() or es_admin());

create or replace function public.registrar_uso_lector_ia(
  p_tipo text,
  p_proveedor text,
  p_modelo text,
  p_documentos integer default 0,
  p_paginas integer default 0,
  p_consultas integer default 0,
  p_costo_estimado_usd numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_access public.lector_ia_accesos%rowtype;
  v_docs integer;
  v_pages integer;
  v_queries integer;
  v_openai numeric;
  v_xai numeric;
  v_ocr numeric;
begin
  if v_uid is null then raise exception 'No autorizado'; end if;
  if p_tipo not in ('ocr', 'consulta', 'fallback', 'busqueda') then raise exception 'Tipo de uso inválido'; end if;
  if p_proveedor not in ('local', 'mistral', 'cerebras', 'groq', 'openai', 'xai', 'perplexity') then raise exception 'Proveedor inválido'; end if;
  if p_documentos < 0 or p_paginas < 0 or p_consultas < 0 or p_costo_estimado_usd < 0 then
    raise exception 'Uso inválido';
  end if;

  select * into v_access from public.lector_ia_accesos
   where usuario_id = v_uid for update;

  if not found or not v_access.activo or now() < v_access.inicia_en or now() > v_access.termina_en then
    raise exception 'Preview no disponible';
  end if;

  select
    coalesce(sum(documentos), 0), coalesce(sum(paginas), 0),
    coalesce(sum(consultas), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'openai'), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'xai'), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'mistral'), 0)
  into v_docs, v_pages, v_queries, v_openai, v_xai, v_ocr
  from public.lector_ia_uso where usuario_id = v_uid and creado_en >= v_access.inicia_en;

  if v_docs + p_documentos > v_access.max_documentos then raise exception 'Límite de documentos alcanzado'; end if;
  if v_pages + p_paginas > v_access.max_paginas then raise exception 'Límite de páginas alcanzado'; end if;
  if v_queries + p_consultas > v_access.max_consultas then raise exception 'Límite de consultas alcanzado'; end if;
  if p_proveedor = 'openai' and v_openai + p_costo_estimado_usd > v_access.max_openai_usd then raise exception 'Crédito OpenAI agotado'; end if;
  if p_proveedor = 'xai' and v_xai + p_costo_estimado_usd > v_access.max_xai_usd then raise exception 'Crédito xAI agotado'; end if;
  if p_proveedor = 'mistral' and v_ocr + p_costo_estimado_usd > v_access.max_ocr_usd then raise exception 'Cupo OCR agotado'; end if;

  insert into public.lector_ia_uso
    (usuario_id, tipo, proveedor, modelo, documentos, paginas, consultas, costo_estimado_usd)
  values
    (v_uid, p_tipo, p_proveedor, left(p_modelo, 120), p_documentos, p_paginas, p_consultas, p_costo_estimado_usd);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.registrar_uso_lector_ia(text, text, text, integer, integer, integer, numeric) from public;
grant execute on function public.registrar_uso_lector_ia(text, text, text, integer, integer, integer, numeric) to authenticated;

-- Ejemplo de activación (reemplazar el correo):
-- insert into public.lector_ia_accesos (usuario_id)
-- select id from auth.users where lower(email) = lower('cliente@empresa.com')
-- on conflict (usuario_id) do update set activo = true, inicia_en = now(),
-- termina_en = now() + interval '12 months';
