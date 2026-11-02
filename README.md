# BuyBot

Automatización de primer contacto por WhatsApp para asesoras comerciales (sin IA, solo reglas). La asesora conecta su número con un QR (Evolution API), carga su base de clientes y BuyBot envía los mensajes uno por uno con pausas aleatorias, límite diario y horario, sin repetir nunca a un cliente ya contactado.

## Qué incluye
- **Login** (cuenta única creada la primera vez; contraseñas con scrypt, sesión por cookie).
- **Prospectos**: CRUD completo, búsqueda, filtros, edición masiva, importación Excel/CSV, exportación. Los ya contactados quedan protegidos (DNI y WhatsApp bloqueados, eliminar exige confirmar).
- **Base local SQLite** (`data/buybot.db`), historial de auditoría de todo cambio, respaldo diario automático y descarga manual.
- **WhatsApp por QR**: estados conectado / esperando QR / desconectado / Evolution caído, QR que se renueva solo, reconexión, reinicio de instancia y mensaje de prueba.
- **Cola de envío** persistente: pausa/reanuda/detiene, límite diario, horario, pausas aleatorias, verificación de número, reintentos, recuperación tras caídas sin duplicar, baja por respuesta "BAJA".
- Monto y tasa se pueden completar a mano; quien no los tenga no se envía (si la plantilla los usa).

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

## Producción (Docker)
```bash
cp .env.example .env   # define EVOLUTION_API_KEY y POSTGRES_PASSWORD
docker compose up -d --build
```
Abre `http://servidor:8787`, crea la cuenta y conecta WhatsApp. Publícalo detrás de HTTPS (y `COOKIE_SECURE=true`).

> La imagen y variables de Evolution API en `docker-compose.yml` siguen su documentación pública pero **no se probaron contra un Evolution real** en este entorno; verifícalas en el primer despliegue.

## Aviso
Evolution API usa la conexión no oficial de WhatsApp Web: enviar en frío puede provocar bloqueo del número. Usa pausas largas, límite diario bajo al inicio y solo contacta a clientes con permiso.
