-- OpenAI, xAI y Perplexity son saldos prepagados que no se recargan: sus topes
-- son únicos para todo el período. Mistral (OCR) sigue siendo cupo mensual gratis.
-- Groq y el conteo de documentos/páginas/consultas no generan costo.

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
    coalesce(sum(busquedas), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'openai'), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'xai'), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'mistral' and creado_en >= v_month_start), 0),
    coalesce(sum(costo_estimado_usd) filter (where proveedor = 'perplexity'), 0)
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

-- El costo real (tokens informados por el proveedor) puede superar lo reservado;
-- rechazarlo dejaba sin registrar dinero ya cobrado.
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
    or p_consultas > v_reserva.consultas or p_busquedas > v_reserva.busquedas then
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

-- Topes al 15-09-2026: lo ya registrado + 95% del saldo real
-- (OpenAI $3.46, xAI $4.82, Perplexity $1.61).
update public.lector_ia_accesos
set
  max_openai_usd = 3.30,
  max_xai_usd = 4.58,
  max_perplexity_usd = 1.54,
  max_ocr_usd = 10,
  max_busquedas_web = 100000,
  max_consultas = 1000000,
  max_documentos = 100000,
  max_paginas = 1000000,
  actualizado_en = now();
