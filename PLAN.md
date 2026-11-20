# Inversiones Cavala — Plan de acción y referencia técnica

**Cliente:** Inversiones Cavala S.A.C. · **Proveedor:** Veczail S.A.C.
**Sprint 1:** Migración Notion → Supabase + R2 — COMPLETO
**Sprint 2:** Desarrollo de la aplicación Next.js — EN CURSO

> Documento de referencia para el desarrollo del app. Si se pierde contexto,
> este archivo es la fuente de verdad. El schema real está en
> `migracion-cavala/supabase/migrations/`. El `supabase/schema.sql` de este
> proyecto es un borrador obsoleto — ignorarlo.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Base de datos | Supabase (PostgreSQL 15) — proyecto `fpoqmggstjhixqpzxeoo`, West US Oregon |
| Almacenamiento binarios | Cloudflare R2 — bucket `cavala-legal-docs` (egress $0) |
| Auth | Supabase Auth (signup deshabilitado — solo admin crea usuarios) |
| Cliente Supabase | `@supabase/ssr` (SSR + middleware) |
| Cliente R2 | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (server-side only) |

---

## Plan de acción — Sprint 2

### Fase 0 — Configuración (prerequisito)
- [ ] Crear `.env.local` con las variables de entorno (ver §Variables de entorno)
- [ ] Crear el primer usuario administrador en Supabase Auth y ejecutar:
  ```sql
  update perfiles set rol = 'admin', activo = true where correo = 'tu@correo.com';
  ```
- [ ] Verificar conexión: `select * from conteo_migracion` debe devolver 13 filas con datos

### Fase 1 — Dashboard (conteos reales)
- [ ] Conectar las StatCards a queries reales contra `conteo_migracion` o counts directos
- [ ] Widget de alertas de vencimiento próximo (próximos 30 días):
  - `contratos.fecha_vencimiento`
  - `vehiculos.soat_vence` y `vehiculos.poliza_vence`
  - `personal.contrato_fin`
- [ ] Mostrar rol del usuario logueado (query a `perfiles`)

### Fase 2 — Módulo 1: Entidades (listados + ficha)
Orden sugerido por complejidad creciente:

- [ ] **Propietarios** — 72 registros, sin relaciones complejas en la vista de lista
- [ ] **Oficinas Registrales** — 4 registros, solo lectura
- [ ] **Vehículos** — 38 registros, mostrar vencimientos (SOAT, póliza)
- [ ] **Concesiones Mineras** — 17 registros
- [ ] **Personal** — 43 registros, acceso restringido (solo admin/abogado ven DNI y remuneración)
- [ ] **Predios** — 498 registros, jerarquía padre/hijo (predio_padre_id), la más compleja
- [ ] **Ficha universal con vínculos** — para cada entidad, mostrar sus registros relacionados via `vinculos`

### Fase 3 — Módulo 2: Procesos
- [x] Listado de procesos con filtro por `materia` (9 materias activas)
- [x] Ficha de proceso con vínculos a propietarios, predios y documentos relacionados
- [x] Panel de alertas de vencimiento
- [x] Diligencias/audiencias reales editables (`eventos` + `vinculos` proceso↔evento).
      El parser de texto libre queda como fuente secundaria ("detectadas en el texto").
- [x] Alta/baja de procesos y del resto de entidades desde la app (admin).
- [x] Correo diario de vencimientos y diligencias (`/api/cron/alertas`).

### Fase 4 — Módulo 3: Documentos
- [ ] Listado con filtro por `tipo` (10 tipos)
- [ ] Visor/descarga via URL firmada de R2
- [ ] Subida de nuevos archivos (URL firmada de upload → registro en `archivos`)

### Fase 5 — Administración
- [ ] Gestión de usuarios (solo admin): listar `perfiles`, activar/desactivar, cambiar rol
- [ ] Contratos con alertas

### Pendientes del cliente (bloquean funcionalidad)
- `eventos` — 0 registros, motor de alertas del Módulo 2 (el cliente no entregó esta base)
- Escritos y resoluciones de los 222 procesos (la carpeta Procesos se exportó sin archivos)
- Dirección de Trabajo (10ª materia de procesos)
- Contrato de concesiones (6º tipo de contratos)

---

## Variables de entorno (.env.local)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://fpoqmggstjhixqpzxeoo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key del dashboard>
SUPABASE_SERVICE_ROLE_KEY=<service_role key — SÓLO server-side, la usa el cron>

# R2 — solo en server-side (Server Actions / Route Handlers)
R2_ACCOUNT_ID=<account id de Cloudflare>
R2_ACCESS_KEY_ID=<access key id del token cavala-legal-docs-app>
R2_SECRET_ACCESS_KEY=<secret key — nunca se expone al cliente>
R2_BUCKET_NAME=cavala-legal-docs

# Correo diario (cron /api/cron/alertas · ver vercel.json)
RESEND_API_KEY=<key de resend.com — sin ella el cron sólo loguea>
RESEND_FROM=Inversiones Cavala <onboarding@resend.dev>
CRON_SECRET=<secreto; Vercel Cron manda Authorization: Bearer con él>
ALERTAS_CC=<correos extra separados por coma, opcional>
```

> El token R2 es de tipo Account API Token llamado `cavala-legal-docs-app`,
> con permisos Object Read & Write limitados al bucket. TTL Forever.
>
> Plantilla completa en `.env.example`. Migraciones nuevas a aplicar
> (`supabase db push` o SQL editor): `20260831000100_alta_baja_rls.sql`
> (alta/baja de entidades) y `20260831000200_eventos.sql` (diligencias
> editables). El correo diario necesita además la `SUPABASE_SERVICE_ROLE_KEY`.

---

## Modelo de datos completo

### Extensiones PostgreSQL activas
- `pgcrypto` — para `gen_random_uuid()`
- `pg_trgm` — para búsqueda por similitud de nombres (índices GIN trigram)

### Tipos enumerados

```
materia_proceso:
  administrativo | civil | penal | carpeta_fiscal | contencioso_administrativo
  laboral | sunafil | conciliacion | constitucional | direccion_trabajo

tipo_contrato:
  personal | profesional | servicios | mutuo | arrendamiento | concesiones

tipo_documento:
  copia_literal | testimonio | vigencia_poder | junta_general | minuta
  multa | documento_municipal | constancia_posesion | titulo_archivado
  habilitacion_urbana | plano | memoria_tecnica | tarjeta_identificacion | poliza

entidad:
  propietario | predio | vehiculo | concesion | personal | oficina_registral
  documento | contrato | proceso | evento

origen_export:
  ALI | RESPALDO | API | MANUAL

rol_usuario:
  admin | abogado | asistente | lectura
```

### Columnas comunes a TODAS las tablas de negocio

Estas columnas existen en todas las tablas (salvo las excepciones indicadas):

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()`. En migración es uuid5 del notion_id |
| `notion_id` | `text` UNIQUE | ID de la página en Notion. Trazabilidad al origen |
| `notion_origen` | `origen_export` | `not null`. De qué export vino el registro |
| `extra` | `jsonb` | `not null default '{}'`. Columnas del origen sin campo propio |
| `creado_en` | `timestamptz` | `not null default now()` |
| `actualizado_en` | `timestamptz` | `not null default now()`, mantenida por trigger |

> `datos_empresas`, `oficinas_registrales` y `concesiones_mineras` no tienen `actualizado_en`.
> `archivos` y `vinculos` no tienen `extra` ni `notion_id` ni `actualizado_en`.

---

## Tablas — definición completa

### `propietarios` — 72 registros

Patrimonio propio y de terceros. **Solo existe en el export de respaldo** (ALI no lo exportó).

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `notion_id` | `text` | UNIQUE | |
| `notion_origen` | `origen_export` | `not null default 'RESPALDO'` | |
| `nombre` | `text` | `not null` | |
| `es_propio` | `boolean` | | Origen: columna `Estado` = `Nuestro` / `ajenos` |
| `tipo_persona` | `text` | `check in ('natural','juridica')` | |
| `extra` | `jsonb` | `not null default '{}'` | Añadida en migración 004 |
| `creado_en` | `timestamptz` | `not null default now()` | |
| `actualizado_en` | `timestamptz` | `not null default now()` | trigger |

**Índice:** `nombre` GIN trigram (búsqueda por similitud)

---

### `datos_empresas` — 9 registros

Datos fiscales de propietarios. Tabla separada porque en el origen las columnas
RUC/DNI/gerente de Propietarios están 100% vacías — el dato vive aquí.

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `notion_id` | `text` | UNIQUE | |
| `propietario_id` | `uuid` | FK → `propietarios(id)` ON DELETE SET NULL | |
| `razon_social` | `text` | | |
| `ruc` | `text` | | |
| `dni` | `text` | | |
| `gerente` | `text` | | |
| `direccion_fiscal` | `text` | | |
| `partida_registral` | `text` | | |
| `cuenta_bancaria` | `text` | | |
| `extra` | `jsonb` | `not null default '{}'` | Migración 004 |
| `creado_en` | `timestamptz` | `not null default now()` | |

**Índice:** `propietario_id`

---

### `oficinas_registrales` — 4 registros

Casma, Chimbote, Lima, Trujillo (+ "nueva oficina").

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `notion_id` | `text` | UNIQUE | |
| `notion_origen` | `origen_export` | `not null default 'RESPALDO'` | |
| `nombre` | `text` | `not null` | |
| `extra` | `jsonb` | `not null default '{}'` | Migración 004 |
| `creado_en` | `timestamptz` | `not null default now()` | |

---

### `predios` — 498 registros

La entidad más rica y la más incompleta en el origen. 25 de 34 columnas del
origen están ≥80% vacías. Se migra tal cual (cláusula 6.1).

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `notion_id` | `text` | UNIQUE | |
| `notion_origen` | `origen_export` | `not null default 'ALI'` | |
| `nombre` | `text` | `not null` | |
| `predio_padre_id` | `uuid` | FK → `predios(id)` ON DELETE SET NULL | Auto-referencia. 407 de 498 tienen padre |
| `oficina_registral_id` | `uuid` | FK → `oficinas_registrales(id)` ON DELETE SET NULL | |
| `n_partida` | `text` | | |
| `tipo_predio` | `text` | `check in ('urbano','rural')` | |
| `ubicacion` | `text` | | |
| `coordenadas` | `text` | | ⚠️ 100% vacía en el origen |
| `registrado` | `boolean` | | Origen: `Estado` = Registrado / No registrado |
| `a_nombre_de` | `text` | | `inscrito a nuestro nombre` / `a nombre de 3ros` |
| `archivador_drive` | `boolean` | | |
| `archivador_fisico` | `boolean` | | |
| `monto_copia_literal` | `numeric(14,2)` | | |
| `fecha_adquisicion` | `date` | | ⚠️ 100% vacía en el origen |
| `detalles` | `text` | | |
| `extra` | `jsonb` | `not null default '{}'` | |
| `creado_en` | `timestamptz` | `not null default now()` | |
| `actualizado_en` | `timestamptz` | `not null default now()` | trigger |

**Índices:** `nombre` GIN trigram · `predio_padre_id` · `oficina_registral_id`

**Jerarquía:** matriz → etapa → lote. En el origen son las columnas "ítem principal" y "Subítem".
Navegar la jerarquía: `WHERE predio_padre_id = $id` (hijos) o hacer JOIN recursivo.

---

### `vehiculos` — 38 registros

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `notion_id` | `text` | UNIQUE | |
| `notion_origen` | `origen_export` | `not null default 'ALI'` | |
| `placa` | `text` | `not null` | El "Nombre" del origen es la placa o N° de serie |
| `marca_modelo` | `text` | | |
| `categoria` | `text` | | Línea amarilla / Vehículo pesado |
| `anio` | `int` | | |
| `n_serie` | `text` | | |
| `n_partida` | `text` | | |
| `responsable` | `text` | | `cava` / `dipier` / `lcv` |
| `soat_vence` | `date` | índice parcial where not null | Fuente de alertas del Módulo 2 |
| `poliza_vence` | `date` | índice parcial where not null | Fuente de alertas del Módulo 2 |
| `revision_tecnica` | `text` | | |
| `archivador_drive` | `boolean` | | |
| `archivador_fisico` | `boolean` | | |
| `detalle` | `text` | | |
| `extra` | `jsonb` | `not null default '{}'` | |
| `creado_en` | `timestamptz` | `not null default now()` | |
| `actualizado_en` | `timestamptz` | `not null default now()` | trigger |

**Nota:** SOAT, póliza y revisión técnica son columnas de esta tabla, no bases aparte.
Resuelve los ítems "pólizas" y "tarjeta de identificación vehicular" del Anexo 01.

---

### `concesiones_mineras` — 17 registros

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `notion_id` | `text` | UNIQUE | |
| `notion_origen` | `origen_export` | `not null default 'ALI'` | |
| `nombre` | `text` | `not null` | |
| `codigo` | `text` | | |
| `hectareas` | `numeric(12,4)` | | |
| `sustancia` | `text` | `check in ('metal','no_metal')` | |
| `estado` | `text` | | `titulada` / `en trámite` / `cancelada` |
| `ubicacion` | `text` | | |
| `url_ubicacion` | `text` | | |
| `extra` | `jsonb` | `not null default '{}'` | Migración 004 |
| `creado_en` | `timestamptz` | `not null default now()` | |

---

### `personal` — 43 registros

⚠️ **Acceso restringido por Ley N° 29733.** Solo `admin` y `abogado` pueden leer
esta tabla. `asistente` y `lectura` no tienen acceso. El RLS lo bloquea en la DB.

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `notion_id` | `text` | UNIQUE | |
| `notion_origen` | `origen_export` | `not null default 'ALI'` | |
| `nombre` | `text` | `not null` | |
| `dni` | `text` | | 🔒 Ley 29733 |
| `cargo` | `text` | | |
| `correo` | `text` | | |
| `modalidad` | `text` | `check in ('planilla','locador')` | |
| `activo` | `boolean` | | Origen: `ACTIVO` / `CESADO` |
| `remuneracion` | `numeric(12,2)` | | 🔒 Ley 29733 |
| `contrato_inicio` | `date` | | |
| `contrato_fin` | `date` | índice parcial where not null | Fuente de alertas del Módulo 2 |
| `firmado` | `text` | | `Ambas firmas completas` / `Sin Firmar` |
| `extra` | `jsonb` | `not null default '{}'` | |
| `creado_en` | `timestamptz` | `not null default now()` | |
| `actualizado_en` | `timestamptz` | `not null default now()` | trigger |

---

### `procesos` — 222 registros en 9 materias

Una sola tabla con discriminador `materia`. Las 9 materias comparten 50-100% de columnas.

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `notion_id` | `text` | UNIQUE | |
| `notion_origen` | `origen_export` | `not null default 'ALI'` | |
| `materia` | `materia_proceso` | `not null`, indexado | Discriminador de familia |
| `expediente` | `text` | — sin unicidad — | 36/86 administrativos sin número. índice GIN trigram |
| `asunto` | `text` | | |
| `estado` | `text` | | |
| `etapa` | `text` | | Historial multilínea del origen, migrado como texto |
| `juzgado` | `text` | | Juzgado / Fiscalía / Entidad según materia |
| `abogado` | `text` | | |
| `estudio` | `text` | | |
| `diligencia` | `text` | | |
| `extra` | `jsonb` | `not null default '{}'` | |
| `creado_en` | `timestamptz` | `not null default now()` | |
| `actualizado_en` | `timestamptz` | `not null default now()` | trigger |

**Distribución por materia:**

| Materia | Exp. |
|---|---:|
| `administrativo` | 86 |
| `civil` | 61 |
| `carpeta_fiscal` | 48 |
| `penal` | 14 |
| `contencioso_administrativo` | 5 |
| `conciliacion` | 3 |
| `constitucional` | 2 |
| `laboral` | 2 |
| `sunafil` | 1 |
| `direccion_trabajo` | 0 (pendiente del cliente) |

---

### `contratos` — 271 registros en 5 tipos

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `notion_id` | `text` | UNIQUE | |
| `notion_origen` | `origen_export` | `not null default 'ALI'` | |
| `tipo` | `tipo_contrato` | `not null`, indexado | Discriminador de familia |
| `nombre` | `text` | `not null` | |
| `monto` | `numeric(14,2)` | | |
| `moneda` | `text` | `default 'PEN'` | `PEN` o `USD`. 23 contratos en dólares |
| `plazo` | `text` | | |
| `fecha_inicio` | `date` | | |
| `fecha_vencimiento` | `date` | índice parcial where not null | Fuente de alertas del Módulo 2 |
| `legalizado` | `text` | | |
| `estado` | `text` | | |
| `extra` | `jsonb` | `not null default '{}'` | |
| `creado_en` | `timestamptz` | `not null default now()` | |
| `actualizado_en` | `timestamptz` | `not null default now()` | trigger |

**Distribución por tipo:**

| Tipo | Registros |
|---|---:|
| `personal` | 97 |
| `servicios` | 75 |
| `mutuo` | 67 |
| `arrendamiento` | 23 |
| `profesional` | 9 |
| `concesiones` | 0 (pendiente del cliente) |

---

### `documentos` — 902 registros en 10 tipos

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `notion_id` | `text` | UNIQUE | |
| `notion_origen` | `origen_export` | `not null default 'ALI'` | |
| `tipo` | `tipo_documento` | `not null`, indexado | Discriminador de familia |
| `nombre` | `text` | `not null` | índice GIN trigram |
| `fecha` | `date` | | |
| `detalle` | `text` | | |
| `extra` | `jsonb` | `not null default '{}'` | |
| `creado_en` | `timestamptz` | `not null default now()` | |
| `actualizado_en` | `timestamptz` | `not null default now()` | trigger |

---

### `eventos` — 0 registros (pendiente del cliente)

Motor de alertas del Módulo 2. La base Eventos de Notion es inaccesible con el
acceso actual. La tabla existe para no bloquear el ETL. 14 vínculos ya apuntan
a registros de esta base.

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `notion_id` | `text` | UNIQUE | |
| `notion_origen` | `origen_export` | `not null default 'API'` | Se poblará vía API |
| `titulo` | `text` | `not null` | |
| `inicia_en` | `timestamptz` | índice parcial where not null | Fuente de alertas |
| `tipo_diligencia` | `text` | | VENCIMIENTO SUBSANACIÓN, AUD. PRELIMINAR, etc. |
| `estado` | `text` | | |
| `responsable` | `text` | | |
| `notificar` | `boolean` | `not null default true` | |
| `extra` | `jsonb` | `not null default '{}'` | |
| `creado_en` | `timestamptz` | `not null default now()` | |
| `actualizado_en` | `timestamptz` | `not null default now()` | trigger |

---

### `vinculos` — 5.967 registros

Grafo de relaciones polimórfico. **Sin claves foráneas.** Cada extremo se
identifica con un par `(tipo, id)`. La integridad se verifica con la vista
`vinculos_huerfanos` (debe devolver 0 filas).

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `origen_tipo` | `entidad` | `not null` | indexado con `origen_id` |
| `origen_id` | `uuid` | `not null` | Sin FK — polimórfica |
| `destino_tipo` | `entidad` | `not null` | indexado con `destino_id` |
| `destino_id` | `uuid` | `not null` | Sin FK — polimórfica |
| `rol` | `text` | check (ver valores abajo) | Papel del destino respecto del origen |
| `resuelto_por` | `text` | `check in ('ruta','notion_id','nombre','manual')` | Trazabilidad de migración |
| `creado_en` | `timestamptz` | `not null default now()` | |

**Valores de `rol`:** `propietario`, `arrendador`, `arrendatario`, `acreedor`, `deudor`,
`demandante`, `demandado`, `agraviado`, `imputado`, `solicitante`,
`profesional`, `empleado`, `contratista`, `representante`

**Constraints:**
- `vinculo_unico` — `UNIQUE NULLS NOT DISTINCT (origen_tipo, origen_id, destino_tipo, destino_id, rol)`. NULLS NOT DISTINCT es crítico: la mayoría de vínculos no llevan `rol` y con la semántica por defecto NULL≠NULL el UNIQUE no protegería contra duplicados.
- `sin_autovinculo` — `CHECK (NOT (origen_tipo = destino_tipo AND origen_id = destino_id))`

**Índices:** `(origen_tipo, origen_id)` · `(destino_tipo, destino_id)`

**Relaciones existentes hoy (pares más relevantes):**

| Relación | Vínculos |
|---|---:|
| predio ↔ documento | 1.602 |
| predio ↔ propietario | 950 |
| predio ↔ predio (jerarquía) | 814 |
| propietario ↔ documento | 721 |
| propietario ↔ contrato | 409 |
| propietario ↔ proceso | 389 |
| vehiculo ↔ documento | 290 |
| personal ↔ contrato | 186 |
| predio ↔ proceso | 169 |
| predio ↔ oficina_registral | 117 |
| propietario ↔ personal | 77 |
| propietario ↔ vehiculo | 72 |
| vehiculo ↔ oficina_registral | 66 |
| vehiculo ↔ contrato | 48 |
| propietario ↔ concesion | 32 |
| proceso ↔ proceso | 12 |
| contrato ↔ contrato | 9 |
| proceso ↔ concesion | 4 |

**1.317 vínculos llevan además `rol`** (el papel que en Notion vivía en columnas sueltas):

| Rol | Vínculos |
|---|---:|
| propietario | 1.107 |
| arrendador | 66 |
| solicitante | 63 |
| deudor | 29 |
| acreedor | 29 |
| arrendatario | 22 |
| demandado | 1 |

---

### `archivos` — 1.403 filas / 1.377 objetos / 4,59 GB

Metadata en Postgres, binario en R2. Sin claves foráneas, polimórfica.
26 archivos idénticos tienen varios dueños (mismo objeto R2, varias filas).

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `entidad_tipo` | `entidad` | `not null` | indexado con `entidad_id` |
| `entidad_id` | `uuid` | `not null` | Sin FK — polimórfica |
| `nombre_original` | `text` | `not null` | |
| `r2_bucket` | `text` | `not null default 'cavala-legal-docs'` | |
| `r2_key` | `text` | `not null` | UNIQUE junto a `entidad_id` (migración 005) |
| `mime` | `text` | | |
| `tamano_bytes` | `bigint` | `not null` | |
| `sha256` | `text` | `not null` | indexado |
| `ruta_origen` | `text` | | Ruta en el export, para auditoría |
| `subido_en` | `timestamptz` | `not null default now()` | |

**Formato de `r2_key`:** `{sha256[:2]}/{sha256}{ext}` — content-addressed.
No incluye el ID del registro a propósito: el objeto sobrevive a recargas del ETL.

**Índices:** `(entidad_tipo, entidad_id)` · `sha256`
**UNIQUE index:** `archivos_objeto_dueno` sobre `(r2_key, entidad_id)`

**Distribución por entidad:**

| Entidad | Archivos |
|---|---:|
| `documento` | 876 |
| `contrato` | 311 |
| `vehiculo` | 127 |
| `predio` | 67 |
| `concesion` | 15 |
| `propietario` | 7 |

---

### `perfiles` — 0 registros (pendiente: crear el primer admin)

Extiende `auth.users` con el rol de la aplicación. Fuera del modelo de negocio.

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK, FK → `auth.users(id)` ON DELETE CASCADE | |
| `nombre` | `text` | | |
| `correo` | `text` | | |
| `rol` | `rol_usuario` | `not null default 'lectura'` | admin / abogado / asistente / lectura |
| `activo` | `boolean` | `not null default false` | ⚠️ El alta automática crea el perfil en `false` |
| `creado_en` | `timestamptz` | `not null default now()` | |

---

## Relaciones entre tablas

```
CAPA 1 — NÚCLEO (el patrimonio)
  propietarios ──── datos_empresas        (FK: datos_empresas.propietario_id)
  predios ────────── predios              (FK auto-ref: predios.predio_padre_id)
  predios ────────── oficinas_registrales (FK: predios.oficina_registral_id)
  vehiculos, concesiones_mineras, personal, eventos  (sin FKs directas al núcleo)

CAPA 2 — RELACIONES POLIMÓRFICAS
  vinculos(origen_tipo, origen_id, destino_tipo, destino_id, rol)
    → conecta cualquier entidad con cualquier otra
    → las relaciones son bidireccionales: cada par existe en ambos sentidos

  archivos(entidad_tipo, entidad_id, r2_key, ...)
    → cuelga un binario de R2 de cualquier entidad

FUERA DEL MODELO DE NEGOCIO
  perfiles → extiende auth.users con rol de aplicación
```

### FKs reales (solo 4)

| Tabla | Columna | Apunta a | ON DELETE |
|---|---|---|---|
| `datos_empresas` | `propietario_id` | `propietarios(id)` | SET NULL |
| `predios` | `predio_padre_id` | `predios(id)` (auto-ref) | SET NULL |
| `predios` | `oficina_registral_id` | `oficinas_registrales(id)` | SET NULL |
| `perfiles` | `id` | `auth.users(id)` | CASCADE |

**Todo lo demás va por `vinculos`.** No existe FK de vehículo a propietario, de predio
a propietario, de proceso a predio, etc. Para obtener esas relaciones:

```sql
-- Propietarios de un predio
SELECT p.*
FROM propietarios p
JOIN vinculos v ON v.destino_id = p.id AND v.destino_tipo = 'propietario'
WHERE v.origen_tipo = 'predio' AND v.origen_id = $predio_id;

-- Todos los registros relacionados con un predio (cualquier tipo)
SELECT *
FROM vinculos
WHERE (origen_tipo = 'predio' AND origen_id = $id)
   OR (destino_tipo = 'predio' AND destino_id = $id);

-- Archivos de un registro
SELECT *
FROM archivos
WHERE entidad_tipo = 'predio' AND entidad_id = $id;
```

---

## Seguridad y roles

### Matriz de permisos

| Rol | Lectura general | `personal` (DNI, rem.) | Escritura | Borrado | Admin usuarios |
|---|:---:|:---:|:---:|:---:|:---:|
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `abogado` | ✅ | ✅ solo lectura | ✅ | ❌ | ❌ |
| `asistente` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `lectura` | ✅ | ❌ | ❌ | ❌ | ❌ |
| perfil inactivo | ❌ | ❌ | ❌ | ❌ | ❌ |
| `anon` | ❌ | ❌ | ❌ | ❌ | ❌ |

### Funciones helper (SECURITY DEFINER)

Usar estas funciones desde el código cuando sea necesario verificar permisos.
Están disponibles para el rol `authenticated`.

```sql
mi_rol()       → rol_usuario | null   -- null si inactivo o sin perfil
puede_escribir() → boolean            -- admin o abogado
es_admin()       → boolean            -- admin únicamente
```

### Consultar el rol del usuario actual en el frontend

```typescript
// En un Server Component
const { data: perfil } = await supabase
  .from('perfiles')
  .select('rol, activo, nombre')
  .eq('id', user.id)
  .single()
```

### Alta de usuarios

- `enable_signup = false` en Supabase → solo el admin puede crear usuarios
- El trigger `al_crear_usuario` crea el perfil con `activo = false`
- Para activar: `update perfiles set rol = 'abogado', activo = true where correo = '...'`

---

## Vistas de control (QA)

```sql
-- 13 filas con conteos por entidad
SELECT * FROM conteo_migracion;

-- Debe devolver 0 filas (integridad del grafo)
SELECT count(*) FROM vinculos_huerfanos;

-- Vencimientos próximos (insumo del Módulo 2)
SELECT 'contrato' tipo, nombre, fecha_vencimiento fecha FROM contratos
  WHERE fecha_vencimiento BETWEEN current_date AND current_date + 60
UNION ALL
SELECT 'soat', placa, soat_vence FROM vehiculos
  WHERE soat_vence BETWEEN current_date AND current_date + 60
UNION ALL
SELECT 'poliza', placa, poliza_vence FROM vehiculos
  WHERE poliza_vence BETWEEN current_date AND current_date + 60
UNION ALL
SELECT 'contrato_fin', nombre, contrato_fin FROM personal
  WHERE contrato_fin BETWEEN current_date AND current_date + 60
ORDER BY fecha;
```

---

## Archivos del cliente R2

### Obtener URL firmada de descarga (desde Server Action o Route Handler)

```typescript
import { getDownloadUrl } from '@/lib/r2/client'

const url = await getDownloadUrl(archivo.r2_key, 3600) // expira en 1 hora
```

### Flujo de subida de un archivo nuevo

1. Server Action genera URL firmada de subida (`getUploadUrl`)
2. El navegador sube directo a R2 con esa URL (el binario nunca pasa por el servidor)
3. Server Action registra la metadata en la tabla `archivos`:
   - `entidad_tipo` + `entidad_id` — a qué registro pertenece
   - `r2_key` — la key usada
   - `sha256` — checksum del binario
   - `tamano_bytes`, `mime`, `nombre_original`

---

## Incidencias del origen (datos que vienen así de Notion)

Se migraron tal cual (cláusula 6.1 del contrato — depuración excluida del alcance).

| Incidencia | Alcance |
|---|---|
| Nombres duplicados en una misma base | 88 casos. `LCV-CAVALA` aparece 22 veces en contratos |
| Razón social con caracteres cirílicos que imitan letras latinas | `МBР НОOLDING GROUP S.A.C.` — invisible a simple vista, rompe búsquedas |
| Expedientes administrativos sin número | 36 de 86 (41%). Identificador sintético en `extra._sin_numero_expediente = true` |
| Fechas ilegibles | 5 |
| Columnas casi vacías en Predios | 25 de 34 con ≥80% sin dato |
| Errores tipográficos en columnas del origen | `Ptopietarios`, `Eetudio`, `Consesiones`, `posecion`, `civel` |

---

## Estructura del repositorio del app

```
inversiones-cavala/
├── src/
│   ├── app/
│   │   ├── (auth)/login/          login + server action
│   │   └── (dashboard)/
│   │       ├── layout.tsx          sidebar + header
│   │       ├── dashboard/          página principal (stats, módulos)
│   │       ├── entidades/
│   │       │   ├── propietarios/
│   │       │   ├── predios/
│   │       │   ├── vehiculos/
│   │       │   ├── concesiones/
│   │       │   ├── personal/
│   │       │   └── oficinas/
│   │       ├── procesos/
│   │       └── documentos/
│   ├── components/
│   │   ├── layout/sidebar.tsx
│   │   ├── layout/header.tsx
│   │   └── ui/stat-card.tsx
│   └── lib/
│       ├── supabase/client.ts      browser client
│       ├── supabase/server.ts      server client (SSR)
│       ├── supabase/middleware.ts  refresh de sesión
│       └── r2/client.ts            URLs firmadas (server-side only)
├── middleware.ts
├── PLAN.md                         este archivo
└── supabase/schema.sql             IGNORAR — borrador obsoleto
```
