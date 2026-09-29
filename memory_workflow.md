# Contexto del proyecto: Bot de WhatsApp con IA (n8n + Twilio + Groq)

## Qué es
Bot de WhatsApp que responde preguntas frecuentes usando IA, buscando respuestas en una tabla de datos de n8n ("q&a"). Pensado como "proyecto base" para vender como servicio a negocios locales (freelance).

## Estado actual: FUNCIONANDO end-to-end (actualizado 29-09-2026)
Probado con éxito: responde preguntas que están en la tabla, y admite honestamente cuando no sabe algo (no inventa respuestas).

---

## Arquitectura del workflow en n8n (actualizada 29-09-2026)

Workflow: **"WhatsApp AI Bot (Twilio + Claude + Data Table)"** (ID: `kUr0MUpa7ey8akeR`)

Flujo principal:
Webhook → ¿Ya es contacto? → ¿Es nuevo? → (si nuevo: Guardar contacto → Enviar bienvenida (Twilio)) → Leer Q&A → AI Agent → Enviar respuesta (Twilio) → ¿Escalar? → (si sí: Avisar al dueño (Twilio))
AI Agent (salida de error, roja) → Mensaje de respaldo (Twilio)

Nodos:
1. **Webhook** (`webhook` v2): POST `/whatsapp`. URL producción: `https://scouring-staunch-robe.ngrok-free.dev/webhook/whatsapp`
2. **¿Ya es contacto?** (`dataTable` v1.1, get): busca en la tabla "contactos" (ID `pxToH6Fe86Yt9pRC`, columna `phone`) el `From` del Webhook. `alwaysOutputData: true` (si no hay fila, igual sigue con un item vacío).
3. **¿Es nuevo?** (`if` v2.3): verdadero si `$json.id` no existe.
4. **Guardar contacto** (`dataTable`, insert): guarda `phone` = `From` del Webhook.
5. **Enviar bienvenida (Twilio)** (`twilio` v1 normal): mensaje de bienvenida fijo. `onError: continueRegularOutput` (si falla, el bot sigue igual).
6. **Leer Q&A** (`dataTable`, get, returnAll): lee TODA la tabla "q&a" (ID `chwpKBxWSQF63eZg`). `alwaysOutputData: true`.
7. **AI Agent** (`agent` v2): texto = `{{ $('Webhook').first().json.body.Body }}`. `executeOnce: true` (porque Leer Q&A entrega varios items). `onError: continueErrorOutput`. **SIN tools.** El prompt de sistema incluye todas las filas de la tabla q&a vía expresión (`$('Leer Q&A').all()...`), y le pide responder solo con esa info; si la pregunta no está cubierta, la respuesta debe empezar con la marca `[ESCALAR]`.
8. **Simple Memory** (`memoryBufferWindow` v1.3): sessionKey = `{{ $('Webhook').first().json.body.From }}`, ventana 10.
9. **Groq Chat Model** (`lmChatGroq` v1): modelo `openai/gpt-oss-20b`, temperatura 0.2. Credencial "Groq account 2".
10. **Enviar respuesta (Twilio)** (`twilio` v1 normal): mensaje = output del Agent sin la marca `[ESCALAR]`; si viene vacío manda el mensaje de respaldo.
11. **¿Escalar?** (`if`): verdadero si el output del Agent contiene `[ESCALAR]`.
12. **Avisar al dueño (Twilio)**: manda a WhatsApp de Patricio (número fijo en el nodo, inscrito en el Sandbox) el número del cliente y su mensaje. Con cliente real, cambiar el "To" al número del negocio.
13. **Mensaje de respaldo (Twilio)**: conectado a la salida de error del AI Agent. Mensaje fijo "Uy, tuvimos un problema técnico...".

Todos los nodos Twilio: from `+14155238886` (Sandbox), to = `From` del Webhook con `.replace('whatsapp:', '')`, `toWhatsapp: true`, credencial "Twilio account".

### Por qué se quitaron las tools (29-09-2026)
Antes el AI Agent usaba tools (`dataTableTool` para buscar y `twilioTool` para responder) para esquivar el bug de "output vacío" de modelos gratis. Pero `gpt-oss-20b` en Groq corrompe los nombres de las tools (ej. `responder<|channel|>commentary` → error 400 `tool_use_failed`) y además seguía en loop después de responder, lo que mandaba respuesta + mensaje de error. Solución: sin tools, tabla completa en el prompt, y envío con nodo Twilio normal. Funciona bien. Si la tabla creciera mucho (cientos de filas) habría que volver a un esquema de búsqueda.

### Lecciones técnicas clave
- Para conectar un nodo como "tool" de un AI Agent, TIENE que ser la versión `...Tool` del nodo.
- `toolHttpRequest` NO sirve para Twilio (manda JSON; Twilio exige form-urlencoded).
- Credencial nativa `twilioApi` (Account SID + Auth Token) es distinta a Basic Auth.
- Con `toWhatsapp: true`, el "To" debe ir SIN el prefijo `whatsapp:` (Twilio lo agrega).
- Si se agregan nodos entre el Webhook y el Agent, referenciar `$('Webhook').first().json.body...` en vez de `$json.body...`.
---

## Data Table "q&a" (ID `chwpKBxWSQF63eZg`)
Columnas usadas: `question`, `answers`, `tags` (hay columnas viejas sin usar: `Name`, `email`, `isTrusted`, resabios de una tabla de ejemplo de n8n).

Tiene 11 filas: 1 original ("como ser programador?") + 10 genéricas de atención al cliente (horario, ubicación, métodos de pago, envíos, garantía, contacto, redes sociales, descuentos por mayor, agendar hora). Pensadas como demo genérica, no de un negocio específico todavía.

---

## Infraestructura local (PC de Patricio, Windows)

- **n8n**: se corre con `npx n8n` (no requiere carpeta fija).
- **ngrok**: dominio fijo gratis reservado: `scouring-staunch-robe.ngrok-free.dev`. Ejecutable en `C:\Users\pato_\AppData\Local\Microsoft\WinGet\Links\ngrok.exe` (NO usar el paquete npm de ngrok, Windows Defender lo bloquea como falso positivo).
- **Problema de versiones de Node resuelto**: el PC tiene 3 instalaciones de Node compitiendo (fnm, nvm-windows en `C:\nvm4w\nodejs`, y una standalone en `C:\Program Files\nodejs`). `fnm` gana la carrera del PATH y estaba clavado en v18 (rompe n8n). Fix aplicado: se corrió `nvm use 22.22.3` como Administrador para fijar la versión 22 en `C:\nvm4w\nodejs`, y el script de auto-inicio fuerza ese path al principio del PATH para evitar que fnm interfiera.
- **Script de auto-inicio creado**: `iniciar-bot.bat` en el Escritorio. Contenido:
  ```bat
  @echo off
  set PATH=C:\nvm4w\nodejs;%PATH%
  set WEBHOOK_URL=https://scouring-staunch-robe.ngrok-free.dev/
  start "ngrok" "C:\Users\pato_\AppData\Local\Microsoft\WinGet\Links\ngrok.exe" http 5678 --domain=scouring-staunch-robe.ngrok-free.dev
  timeout /t 3 /nobreak >nul
  start "n8n" cmd /k npx n8n
  ```
  Confirmado funcionando: doble clic, espera ~15 seg, y el bot queda activo.
- **Twilio**: cuenta Sandbox de WhatsApp, número compartido `+14155238886`. Webhook configurado en "WHEN A MESSAGE COMES IN" con la URL de producción de ngrok + `/webhook/whatsapp` (POST).

---

## Modelo de IA: por qué Groq y no Anthropic/Gemini
- Anthropic (Claude API) requiere billing con tarjeta real, y Patricio no tiene tarjeta ni plata — su suscripción de Claude.ai NO da créditos de API (son sistemas de facturación separados). Descartado por ahora.
- Gemini 2.5 Pro: cuota gratis en 0 para esta cuenta/proyecto (no es un límite temporal, es cero de entrada). Gemini Flash sí tenía cuota gratis pero sufría el mismo bug de "respuesta vacía" que Groq (ver arriba, ya resuelto arquitectónicamente).
- Groq (`openai/gpt-oss-20b`, gratis): funciona bien. Límite de tokens/minuto bajo en el modelo de 120b, por eso se usa el de 20b.

---

## Plan de monetización (en curso)
Dirección elegida: vender como servicio freelance a negocios locales (pymes), usando el bot mismo como demo en vivo para cerrar clientes.

Pasos sugeridos (pendientes de ejecutar):
1. Grabar un video corto de demo.
2. Definir el pitch/oferta y precios (en CLP).
3. Empezar por contactos conocidos.

### Prerrequisitos técnicos para vender de VERDAD (no solo demo)
1. **Hosting real** (que no dependa del PC prendido) — EN PROGRESO, ver abajo.
2. **WhatsApp Business API real** (no Sandbox) — el Sandbox NO sirve para un cliente real porque usa un número compartido de Twilio y exige que cada usuario mande un código "join" antes de poder escribir. Ver sección "WhatsApp Business" más abajo.

**Importante**: mientras no se resuelvan estos dos puntos, lo que existe hoy es una excelente herramienta de DEMO para cerrar ventas, pero no el producto entregable. Estrategia sugerida: usar el bot local para conseguir el primer cliente, y financiar el hosting + WhatsApp Business con ese primer pago.

---

## Hosting: estado de la investigación (EN CURSO, bloqueado por tarjeta)

Se descartó AWS (aunque Patricio tiene cuenta de estudiante) porque los créditos estudiantiles se GASTAN con el uso — no sirven para algo que debe quedar prendido 24/7 indefinidamente.

**Opción elegida: Oracle Cloud "Always Free" tier** — no es un crédito que se gasta, es una asignación de recursos gratis para siempre (VM ARM Ampere, gratis mientras te quedes en ese tamaño). Requiere tarjeta real solo para verificación de identidad (retención temporal, no cobro real).

### Bloqueo actual
- Tarjeta **CMR (Falabella crédito)**: rechazada directamente por Oracle/CyberSource ("Your credit card has been declined").
- Tarjeta **BancoEstado débito (Cuenta RUT)**: NO fue rechazada por ser inválida — Oracle intentó una retención de verificación de **$908 CLP** y falló por **saldo insuficiente** en la Cuenta RUT (llegó email de BancoEstado confirmando esto). Solución: cargar unos **$2.000-3.000 CLP** a la Cuenta RUT y reintentar el registro en signup.cloud.oracle.com. Esto NO se ha hecho todavía — Patricio dijo "por ahora nada" y decidimos volver a modo local mientras tanto.
- Datos ya usados en el signup de Oracle: país Chile, usuario `pato_gc@outlook.cl`, nombre de cuenta `patogc`, región `Chile Central (Santiago)`.

### Plan de hosting cuando se retome
1. Cargar ~$3.000 CLP a la Cuenta RUT y completar el registro en Oracle Cloud (VM Ampere gratis).
2. Instalar Docker + n8n en la VM.
3. HTTPS con Caddy (certificado automático gratis) + subdominio gratis de DuckDNS (ya que Twilio exige HTTPS).
4. Migrar el workflow (exportar/importar) y los datos de la tabla q&a.
5. Apagar ngrok y el PC local para siempre — la VM tiene IP pública propia.

---

## WhatsApp Business API (para cuando haya cliente real)
- Se gestiona desde la MISMA cuenta de Twilio (Console → "Senders" → "WhatsApp senders").
- Requiere vincular con un Meta Business Account (verificación de negocio ante Meta, gratis, puede tardar horas/días).
- Requiere un número de teléfono dedicado (se puede comprar en Twilio, ~USD 1-2/mes).
- El costo real (compra del número + mensajes, centavos de USD c/u) recién aparece cuando se activa — el registro/verificación en sí es gratis.
- No depende del hosting: se puede tramitar en paralelo, y cuando esté aprobado solo se cambia el campo "from" en el nodo de Twilio del workflow.

---

## Mejoras locales: progreso

1. ✅ **Script de auto-inicio en Windows** (`iniciar-bot.bat`) — hecho.
2. ✅ **Mensaje de respaldo si el bot falla** — hecho (salida de error del AI Agent → Twilio).
3. ✅ **Mensaje de bienvenida al primer contacto** — hecho (tabla "contactos"). Probado OK.
4. ✅ **Escalar a humano** — hecho (marca `[ESCALAR]` + aviso al WhatsApp de Patricio). Probado OK.
5. ✅ **Monitoreo con UptimeRobot** — cuenta creada (login con Google), monitor HTTP(s) sobre `https://scouring-staunch-robe.ngrok-free.dev/healthz` cada 5 min, en verde. PENDIENTE confirmar que avisa: cerrar n8n, esperar 5-10 min y ver si llega email "Down" (ojo: la página de advertencia de ngrok gratis podría hacer que marque "Up" aunque n8n esté caído).
6. 🔄 **Demo de rubro específico: PELUQUERÍA / BARBERÍA** (elegido por Patricio) — EN CURSO, ver abajo.

### Tarea #6 — plan (hacer con el conector de n8n)
El contenido ya está listo en `qa_barberia.csv` (13 preguntas: horario, ubicación, servicios, precios de corte/barba/niños/tinte, agendar, sin hora, cancelar, duración, pagos, productos). Precios de ejemplo en CLP, ficticios para la demo.
1. Crear data table nueva **"q&a barberia"** con columnas `question`, `answers`, `tags` (string) y cargar las filas del CSV (`add_data_table_rows`). Se crea tabla nueva en vez de borrar filas porque el conector no tiene herramienta para borrar filas; además deja la demo genérica intacta.
2. En el nodo **Leer Q&A**, cambiar `dataTableId` a la tabla nueva.
3. Cambiar el mensaje de **Enviar bienvenida (Twilio)** a algo de barbería, ej.: "¡Hola! 💈 Bienvenido/a a la barbería. Soy el asistente virtual: te respondo al instante sobre precios, horarios y servicios, y te ayudo a agendar tu hora. ¿En qué te ayudo?"
4. Ajustar la primera línea del prompt de sistema del AI Agent: "Eres el asistente virtual de una barbería..." (mantener el resto, incluida la regla `[ESCALAR]`).
5. Publicar y pedirle a Patricio que pruebe (ej. "cuánto sale un fade?", "atienden el domingo?", y algo fuera de la tabla para ver el escalamiento). Para volver a ver la bienvenida, borrar su fila en la tabla "contactos".

---

## Nota sobre el conector de n8n
El conector MCP de n8n permite operar el workflow directamente sin capturas. Se desconecta a veces a mitad de conversación (error `404 CLIENT_HTTP_NOT_IMPLEMENTED`). Reconectarlo NO revive la conexión en la MISMA conversación — hay que abrir una conversación nueva. Pasó de nuevo el 29-09-2026 justo antes de la tarea #6; por eso se actualizó este archivo.

---

## Archivos entregados anteriormente (ya no existen en ningún repo)
Al principio del proyecto se entregó un JSON del workflow + un README vía descarga directa (no se pudo hacer push a GitHub por permisos, error 403 "Resource not accessible by integration"). Esos archivos probablemente están desactualizados respecto al estado actual del workflow (que se editó muchas veces en vivo desde entonces). Si se necesita una copia actualizada, exportar el workflow de nuevo desde n8n.

---

## Estilo de comunicación con Patricio
- Es principiante en n8n, prefiere explicaciones paso a paso con capturas de pantalla cuando no hay conector activo.
- Sin plata por ahora ("no tengo nada de plata") — cualquier recomendación de costo debe ser honesta sobre alternativas gratis primero.
- Prefiere ir resolviendo un tema a la vez (ej. explícitamente pidió resolver hosting antes que material de venta, y luego mejoras locales antes que seguir con hosting).
