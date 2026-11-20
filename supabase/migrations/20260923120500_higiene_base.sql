-- ============================================================
-- HIGIENE DE LA BASE (auditoría 23/09/2026)
-- ============================================================
-- Avisos del linter de Supabase (`supabase db advisors`) que no cambian qué
-- puede ver o hacer nadie.

-- ─── Índices duplicados ─────────────────────────────────────────────────
-- Cada par es idéntico. Se conservan los que crea 20260910010400 y
-- 20260831000220 (los del repo); los otros venían de antes de trackear
-- migraciones. Ninguno respalda una restricción.
drop index if exists public.archivos_entidad_tipo_entidad_id_idx;   -- = archivos_entidad_tipo_id_idx
drop index if exists public.vinculos_origen_tipo_origen_id_idx;     -- = vinculos_origen_tipo_id_idx
drop index if exists public.vinculos_destino_tipo_destino_id_idx;   -- = vinculos_destino_tipo_id_idx
drop index if exists public.eventos_inicia_en_idx;                  -- = idx_eventos_inicia_en

-- ─── Perfiles: política repetida ────────────────────────────────────────
-- `admin_gestionar_perfiles` (es_admin_actual) y `perfil_admin_escribe`
-- (es_admin) dicen lo mismo; Postgres evaluaba las dos en cada consulta.
drop policy if exists admin_gestionar_perfiles on public.perfiles;

-- ─── auth.uid() / es_admin() una vez por consulta ──────────────────────
alter policy perfil_propio on public.perfiles
  using ((id = (select auth.uid())) or (select public.es_admin()));

alter policy lector_ia_acceso_propio on public.lector_ia_accesos
  using ((usuario_id = (select auth.uid())) or (select public.es_admin()));

alter policy lector_ia_uso_propio on public.lector_ia_uso
  using ((usuario_id = (select auth.uid())) or (select public.es_admin()));

alter policy carpetas_vacias_lectura on public.carpetas_vacias
  using ((select public.acceso_area('documentos', false)) and public.acceso_entidad(entidad_tipo, entidad_id));

alter policy carpetas_vacias_insert on public.carpetas_vacias
  with check (
    creado_por = (select auth.uid())
    and (select public.acceso_area('documentos', true))
    and public.acceso_entidad(entidad_tipo, entidad_id, true)
  );

alter policy carpetas_vacias_delete on public.carpetas_vacias
  using ((select public.acceso_area('documentos', true)) and public.acceso_entidad(entidad_tipo, entidad_id, true));

-- ─── search_path fijo ───────────────────────────────────────────────────
-- Sólo usan tablas de `public` y funciones de pg_catalog.
alter function public.set_actualizado_en() set search_path = public;
alter function public.tipos_propietario_orden_al_final() set search_path = public;
alter function public._notion_id_sintetico() set search_path = public;
alter function public.papelera_tablas() set search_path = public;

-- ─── historial ──────────────────────────────────────────────────────────
-- TRUNCATE se salta RLS. La API REST no lo expone, pero el historial es
-- sólo de agregar: nadie fuera del dueño de la tabla necesita vaciarlo.
revoke truncate on public.historial from anon, authenticated;
