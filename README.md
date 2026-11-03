# BuyBot

Automatización de primer contacto para asesoras comerciales. Cristina puede cargar y organizar prospectos, escribir una plantilla común con variables y controlar una cola secuencial de envíos.

## Qué incluye
- **Tutorial paso a paso** dentro de la app y guía pública en GitHub Pages para orientar a nuevos usuarios.
- **Login** (cuenta inicial reclamable y cuentas invitadas por código de un solo uso; acceso compartido al espacio de trabajo; contraseñas con scrypt y sesión por cookie).
- **Prospectos**: CRUD completo, búsqueda, filtros, edición masiva, importación Excel/CSV, exportación. Los ya contactados quedan protegidos (DNI y WhatsApp bloqueados, eliminar exige confirmar).
- **Base local SQLite** (`data/buybot.db`), historial de auditoría de todo cambio, respaldo diario automático y descarga manual.
- **WhatsApp por QR**: estados conectado / esperando QR / desconectado / Evolution caído, QR que se renueva solo, reconexión, reinicio de instancia y mensaje de prueba.
- **Cola de envío** persistente: pausa/reanuda/detiene, límite diario, horario, verificación de número, reintentos y recuperación tras caídas sin duplicar; procesa respuestas "BAJA" cuando Evolution entrega el webhook.
- La pausa predeterminada entre clientes es de 30 segundos y se puede ajustar.
- Plantilla inicial genérica para Cristina. `[nombre]` se completa automáticamente; `[monto]` y `[tasa]` son variables opcionales para mensajes futuros.
- Cada prospecto guarda si dio autorización explícita para recibir mensajes por WhatsApp. Si no está marcada, queda en espera y la cola no lo envía.

## Requisitos
Node 22.13+ y pnpm. Para producción: Docker.

## Desarrollo
```bash
pnpm install
cp .env.example .env
pnpm mock:evolution   # Evolution simulado en :8080 (clave dev-key)
pnpm dev              # web en :5173, API en :8787
pnpm test:smoke       # pruebas de punta a punta (con la API y el mock corriendo)
```
Control del simulador: `POST :8080/__mock/scan` (simula escanear el QR), `/__mock/drop` (cae la sesión), `/__mock/fail?mode=http|hang`.

## Producción

El tutorial público de GitHub Pages enlaza a la aplicación alojada detrás de HTTPS en Contabo:

- Tutorial: <https://marcelojauregui.me/buybot-by-tekapto/>
- Aplicación: <https://buybot.217.76.49.199.sslip.io/>

Para producción se usa `deploy/vps/compose.yaml` y su guía operativa, no el `docker-compose.yml` de desarrollo. Producción requiere secretos runtime fuera de Git, cookies seguras, Traefik, redes propias y respaldo verificado. No publicar puertos de aplicación, Evolution, PostgreSQL o Redis en el host.

Para probar Evolution real desde el modo de desarrollo, configura `EVOLUTION_API_URL=http://localhost:8080` y `PUBLIC_WEBHOOK_URL=http://host.docker.internal:8787` en `.env`. Luego ejecuta `docker compose up -d evolution postgres redis` y `pnpm dev`; abre `http://localhost:5173`. El simulador ya no debe ocupar el puerto `:8080`.

> El servicio Evolution API v2.3.7 se verificó localmente por su endpoint de salud. Falta completar el escaneo del QR y probar mensajes con un número propio. Esta integración usa una sesión no oficial de WhatsApp Web.

## Aviso
Evolution API conecta mediante una sesión no oficial de WhatsApp Web; no equivale a la Cloud API oficial y puede provocar bloqueos o perder compatibilidad. Para producción, conviene confirmar la elegibilidad del caso de uso con Meta y considerar la Cloud API oficial. Contacta solo a personas con autorización explícita; los registros sin autorización quedan en espera.
