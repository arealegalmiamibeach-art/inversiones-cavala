-- El catálogo se consulta desde las fichas con la sesión del usuario.
-- Las políticas RLS existentes siguen limitando el alta y la baja a admins.
revoke all on table tipos_documento_custom from anon;
grant select, insert, delete on table tipos_documento_custom to authenticated;
