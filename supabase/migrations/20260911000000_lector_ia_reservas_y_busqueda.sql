-- Reservas transaccionales para no descontar solicitudes fallidas y para que
-- dos peticiones simultáneas no excedan los cupos. Sólo guarda métricas.

alter table public.lector_ia_accesos
  alter column max_ocr_usd set default 10;

update public.lector_ia_accesos
set max_ocr_usd = 10
where max_ocr_usd = 6;

alter table public.lector_ia_accesos
  add column if not exists max_busquedas_web integer not null default 100 check (max_busquedas_web >= 0),
  add column if not exists max_perplexity_usd numeric(10,4) not null default 1 check (max_perplexity_usd >= 0);

alter table public.lector_ia_uso
  add column if not exists busquedas integer not null default 0 check (busquedas >= 0);

create table if not exists public.lector_ia_reservas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('ocr', 'consulta', 'fallback', 'busqueda')),
  proveedor text not null check (proveedor in ('local', 'mistral', 'groq', 'openai', 'xai', 'perplexity')),
  modelo text not null,
  documentos integer not null default 0 check (documentos >= 0),
  paginas integer not null default 0 check (paginas >= 0),
  consultas integer not null default 0 check (consultas >= 0),
  busquedas integer not null default 0 check (busquedas >= 0),
  costo_estimado_usd numeric(12,6) not null default 0 check (costo_estimado_usd >= 0),
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null default (now() + interval '10 minutes')
);

create index if not exists lector_ia_reservas_usuario_expira_idx
  on public.lector_ia_reservas (usuario_id, expira_en);

alter table public.lector_ia_reservas enable row level security;

create or replace function public.reservar_uso_lector_ia(
  p_tipo text,
  p_proveedor text,
  p_modelo text,
  p_documentos integer default 0,
  p_paginas integer default 0,
  p_consultas integer default 0,
  p_busquedas integer default 0,
  p_costo_estimado_usd numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_access public.lector_ia_accesos%rowtype;
  v_id uuid;
  v_docs integer := 0;
  v_pages integer := 0;
  v_queries integer := 0;
  v_searches integer := 0;
  v_openai numeric := 0;
  v_xai numeric := 0;
  v_ocr numeric := 0;
  v_perplexity numeric := 0;
  v_month_start timestamptz := date_trunc('month', timezone('America/Lima', now())) at time zone 'America/Lima';
begin
  if v_uid is null then raise exception 'No autorizado'; end if;
  if p_tipo not in ('ocr', 'consulta', 'fallback', 'busqueda') then raise exception 'Tipo de uso inválido'; end if;
  if p_proveedor not in ('local', 'mistral', 'groq', 'openai', 'xai', 'perplexity') then raise exception 'Proveedor inválido'; end if;
  if p_documentos < 0 or p_paginas < 0 or p_consultas < 0 or p_busquedas < 0 or p_costo_estimado_usd < 0 then
    raise exception 'Uso inválido';
  end if;

  select * into v_access
  from public.lector_ia_accesos
  where usuario_id = v_uid
  for update;

  if not found or not v_access.activo or now() < v_access.inicia_en or now() > v_access.termina_en then
    raise exception 'Preview no disponible';
  end if;

  delete from public.lector_ia_reservas where expira_en <= now();

  select
    coalesce(sum(documentos), 0),
    coalesce(sum(paginas), 0),
    coalesce(sum(consultas), 0),
    coalesce(sum(busquedas) filter (where creado_en >= v_month_start), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'openai'), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'xai'), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'mistral' and creado_en >= v_month_start), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'perplexity' and creado_en >= v_month_start), 0)
  into v_docs, v_pages, v_queries, v_searches, v_openai, v_xai, v_ocr, v_perplexity
  from public.lector_ia_uso
  where usuario_id = v_uid and creado_en >= v_access.inicia_en;

  select
    v_docs + coalesce(sum(documentos), 0),
    v_pages + coalesce(sum(paginas), 0),
    v_queries + coalesce(sum(consultas), 0),
    v_searches + coalesce(sum(busquedas), 0),
    v_openai + coalesce(sum(costo_estimado_usd) filter (where proveedor = 'openai'), 0),
    v_xai + coalesce(sum(costo_estimado_usd) filter (where proveedor = 'xai'), 0),
    v_ocr + coalesce(sum(costo_estimado_usd) filter (where proveedor = 'mistral'), 0),
    v_perplexity + coalesce(sum(costo_estimado_usd) filter (where proveedor = 'perplexity'), 0)
  into v_docs, v_pages, v_queries, v_searches, v_openai, v_xai, v_ocr, v_perplexity
  from public.lector_ia_reservas
  where usuario_id = v_uid and expira_en > now();

  if v_docs + p_documentos > v_access.max_documentos then raise exception 'Límite de documentos alcanzado'; end if;
  if v_pages + p_paginas > v_access.max_paginas then raise exception 'Límite de páginas alcanzado'; end if;
  if v_queries + p_consultas > v_access.max_consultas then raise exception 'Límite de consultas alcanzado'; end if;
  if v_searches + p_busquedas > v_access.max_busquedas_web then raise exception 'Límite de consultas con fuentes alcanzado'; end if;
  if p_proveedor = 'openai' and v_openai + p_costo_estimado_usd > v_access.max_openai_usd then raise exception 'Crédito OpenAI agotado'; end if;
  if p_proveedor = 'xai' and v_xai + p_costo_estimado_usd > v_access.max_xai_usd then raise exception 'Crédito xAI agotado'; end if;
  if p_proveedor = 'mistral' and v_ocr + p_costo_estimado_usd > v_access.max_ocr_usd then raise exception 'Cupo mensual de lectura agotado'; end if;
  if p_proveedor = 'perplexity' and v_perplexity + p_costo_estimado_usd > v_access.max_perplexity_usd then raise exception 'Cupo de consultas con fuentes agotado'; end if;

  insert into public.lector_ia_reservas
    (usuario_id, tipo, proveedor, modelo, documentos, paginas, consultas, busquedas, costo_estimado_usd)
  values
    (v_uid, p_tipo, p_proveedor, left(p_modelo, 120), p_documentos, p_paginas, p_consultas, p_busquedas, p_costo_estimado_usd)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.finalizar_uso_lector_ia(
  p_reserva_id uuid,
  p_documentos integer default 0,
  p_paginas integer default 0,
  p_consultas integer default 0,
  p_busquedas integer default 0,
  p_costo_estimado_usd numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reserva public.lector_ia_reservas%rowtype;
begin
  if v_uid is null then raise exception 'No autorizado'; end if;
  select * into v_reserva
  from public.lector_ia_reservas
  where id = p_reserva_id and usuario_id = v_uid
  for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  if p_documentos < 0 or p_paginas < 0 or p_consultas < 0 or p_busquedas < 0 or p_costo_estimado_usd < 0
    or p_documentos > v_reserva.documentos or p_paginas > v_reserva.paginas
    or p_consultas > v_reserva.consultas or p_busquedas > v_reserva.busquedas
    or p_costo_estimado_usd > v_reserva.costo_estimado_usd then
    raise exception 'Uso final fuera de la reserva';
  end if;

  delete from public.lector_ia_reservas where id = p_reserva_id;
  insert into public.lector_ia_uso
    (usuario_id, tipo, proveedor, modelo, documentos, paginas, consultas, busquedas, costo_estimado_usd)
  values
    (v_uid, v_reserva.tipo, v_reserva.proveedor, v_reserva.modelo, p_documentos, p_paginas, p_consultas, p_busquedas, p_costo_estimado_usd);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.cancelar_reserva_lector_ia(p_reserva_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autorizado'; end if;
  delete from public.lector_ia_reservas where id = p_reserva_id and usuario_id = v_uid;
  return found;
end;
$$;

revoke all on function public.reservar_uso_lector_ia(text, text, text, integer, integer, integer, integer, numeric) from public;
revoke all on function public.finalizar_uso_lector_ia(uuid, integer, integer, integer, integer, numeric) from public;
revoke all on function public.cancelar_reserva_lector_ia(uuid) from public;
grant execute on function public.reservar_uso_lector_ia(text, text, text, integer, integer, integer, integer, numeric) to authenticated;
grant execute on function public.finalizar_uso_lector_ia(uuid, integer, integer, integer, integer, numeric) to authenticated;
grant execute on function public.cancelar_reserva_lector_ia(uuid) to authenticated;

analyze public.lector_ia_uso;
analyze public.lector_ia_reservas;
