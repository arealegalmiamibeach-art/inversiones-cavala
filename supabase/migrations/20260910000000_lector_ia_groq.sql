-- Incorpora Groq al registro de uso del Lector IA. Se conserva Cerebras en la
-- restricción para no invalidar registros históricos.

alter table public.lector_ia_uso
  drop constraint if exists lector_ia_uso_proveedor_check;

alter table public.lector_ia_uso
  add constraint lector_ia_uso_proveedor_check
  check (proveedor in ('local', 'mistral', 'cerebras', 'groq', 'openai', 'xai'));

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
  if p_tipo not in ('ocr', 'consulta', 'fallback') then raise exception 'Tipo de uso inválido'; end if;
  if p_proveedor not in ('local', 'mistral', 'cerebras', 'groq', 'openai', 'xai') then raise exception 'Proveedor inválido'; end if;
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
