# Cavala Lector IA — plan de implementación

Actualizado: 11 de septiembre de 2026.

## Alcance comercial del preview

El preview es un lector conversacional, no el Módulo 4. Permite abrir o subir
hasta tres archivos por conversación, hacer preguntas, resumir y comparar el
contenido con referencias de página. Los resultados son temporales y nunca
actualizan contratos, expedientes, alertas ni fichas de titulares.

Límites iniciales por acceso:

- 1 usuario designado.
- 12 meses.
- 200 documentos y 1,500 páginas.
- 1,000 consultas.
- US$3.50 de OpenAI y US$4.50 de xAI como topes independientes.
- El OCR tiene una bolsa exclusiva de Cavala de hasta US$10 mensuales con
  Mistral OCR.
- Hasta 100 consultas con fuentes web al mes, con un tope interno de US$1.

La bolsa mensual de Mistral se reserva exclusivamente para Cavala. Los
contadores internos reflejan el consumo confirmado por esta aplicación y las
claves se configuran sin prefijos públicos en `.env.local` y, al desplegar, en
las variables privadas del servidor.

Comprobación local: Mistral OCR 4.1, OpenAI GPT-5.6 Luna y Grok 4.3 respondieron
correctamente con contenido ficticio. Cerebras fue descartado porque ya no
ofrece un nivel gratuito permanente y la cuenta devuelve HTTP 402.

El selector del chat replica los dos niveles de VeczMind. `Estándar` usa Groq
con `qwen/qwen3.8-27b`. `Experto` usa GPT-5.6 Luna y Grok 4.3 con respaldo
mutuo. La búsqueda web básica se activa de forma independiente y usa
Perplexity `sonar`, mostrando sus fuentes en la respuesta.
El modo Estándar limita el contexto a 12,000 caracteres y la respuesta a 900
tokens: la cuenta de producción tiene un límite de 1,000 tokens de salida por
minuto. El prompt pide hasta unas 220 palabras y una conclusión completa.
Los rechazos temporales del proveedor conservan HTTP 429 y `Retry-After`;
los tiempos de espera se comunican con HTTP 504. Un saludo sin adjuntos se
envía como conversación, sin agregar avisos sobre documentos faltantes.
Los límites de frecuencia del proveedor siguen aplicándose. El modo Experto admite
24,000 caracteres y hasta 3,000 tokens. El historial enviado se limita a tres
mensajes breves. Antes de procesar documentos reales se debe confirmar Zero
Data Retention en los paneles de los proveedores.

## Arquitectura

1. El usuario selecciona un archivo existente en Cavala o lo adjunta al chat.
2. TXT/Markdown/CSV se leen localmente en el servidor.
3. PDF, DOCX e imágenes pasan por Mistral OCR 4.1. El resultado conserva
   páginas, estructura, bloques y confianza; no se persiste como dato legal.
4. El servidor selecciona los fragmentos relevantes y los marca con documento
   y página.
5. El modo Estándar responde con Groq; el modo Experto enruta entre GPT-5.6
   Luna y Grok 4.3. Si se activa la búsqueda, Perplexity Sonar aporta contexto
   web y enlaces antes de generar la respuesta.
6. La respuesta se transmite por SSE y debe citar las páginas utilizadas.
   Se valida la señal de finalización del proveedor: un cierre de conexión no
   equivale a una respuesta completa. Al alcanzar el límite de extensión, el
   usuario puede solicitar completarla como una consulta adicional.
7. Cada uso se reserva de forma transaccional, se confirma al completarse y se
   libera si la solicitud falla o es cancelada.

## Fases

### Fase 1 — Preview funcional (implementada en el repositorio)

- Acceso individual, fecha de fin y cuotas en Supabase.
- Botón flotante global y panel de chat compacto para administradores activos.
- Pantalla de chat adaptativa.
- Carga temporal de PDF, DOCX, TXT, Markdown, CSV e imágenes.
- Selección de archivos ya almacenados en Cavala.
- OCR Mistral 4.1 con puntuación de confianza por bloque.
- Contexto limitado a tres documentos, con referencias por página.
- Recuperación BM25 temporal con sinónimos, eliminación de duplicados y reparto
  equilibrado entre documentos para resúmenes y comparaciones.
- Caché OCR únicamente en memoria durante la sesión; no crea copias ni índices.
- Contexto revisado visible, citas verificadas y clicables, cancelación y
  reintento.
- Buscador unificado de hasta 5,000 archivos accesibles con filtros por formato,
  entidad y fecha.
- Selector Estándar (Groq/Qwen) y Experto (GPT/Grok), con selección local de
  contexto para no enviar el documento entero.
- Búsqueda web básica opcional con Perplexity Sonar y fuentes visibles.
- Barra inferior estilo VeczMind con adjunto `+`, buscador y selector de modo.
- Historial únicamente durante la sesión del navegador.
- Tablas OCR integradas en el texto de su página y prioridad de fragmentos
  relevantes también al solicitar resúmenes con preguntas específicas.
  Se solicita `table_format: null` y se incorporan también las tablas que el
  proveedor devuelva por separado. Las tablas Markdown largas se dividen por
  filas con encabezados repetidos, salvo filas que excedan el tamaño máximo de
  fragmento. Regresión con una consulta por W7 y datos ficticios. Los documentos
  leídos antes de esta corrección deben volver a procesarse: recargar la página
  limpia la caché OCR en memoria; después se vuelve a adjuntar el archivo.

### Fase 2 — Activación y evaluación

- Migración de Supabase aplicada el 9 de septiembre de 2026.
- Crear el acceso del usuario piloto.
- Configurar las claves sólo en el servidor.
- Evaluar 30 documentos representativos: PDF digital, escaneo, sello, tabla,
  contrato largo y documento fotografiado.
- Aceptación mínima: citas correctas, ausencia de invenciones y escalamiento
  cuando el OCR tenga baja confianza.

### Fase 3 — Endurecimiento del preview

- Métricas de latencia, errores, páginas y costo por proveedor.
- Borrado explícito de sesión y limpieza de archivos temporales.
- Pruebas de prompt injection en documentos.
- Avisos de baja confianza y límites próximos a agotarse.

## Fuera del preview

- Indexación global y búsqueda entre todo el repositorio.
- Extracción persistente de fechas, montos, partes o cláusulas.
- Semáforo contractual y comparación con políticas.
- Alertas, renovaciones, poderes, facultades y Titular 360.
- Escritura automática sobre los registros de Cavala.

Estas capacidades requieren activar el Módulo 4 y un flujo formal de revisión
humana.
