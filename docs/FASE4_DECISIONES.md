# Fase 4: Interfaz Web ("Vaqui"), Experiencia de Usuario e Integración Docker

La última fase consistió en conectar el backend financiero con una interfaz web clara para cualquier persona y empaquetar todo en Docker Compose para que levantar el proyecto tome un solo comando.

---

## 1. Identidad visual: Vaqui y el sistema Terra

Para el frontend decidí construir una interfaz limpia llamada **Vaqui**, siguiendo la paleta **Terra — Rooted Warmth** documentada en [DESIGN.md](../DESIGN.md):

- **Colores con intención clara:**
  - Fondo cálido (`#f9f8f5`) y tarjetas blancas (`#ffffff`) con superficies suaves (`#f5f1ea`) y bordes sutiles (`#eae5db`) para que la información financiera descanse bien a la vista.
  - **Verde bosque (`#4a7c59`)** para acciones principales, metas alcanzadas y dinero positivo.
  - **Rojo (`#b83230`)** reservado para egresos y transferencias salientes.
  - **Ámbar (`#8e5b22`)** para identificar claramente las Vaquitas privadas/anónimas.
- **Tipografía y lectura numérica:** Se combinan `Plus Jakarta Sans` y `Outfit` para títulos y navegación con `Nunito Sans` para texto, junto con `JetBrains Mono` y `tabular-nums` en saldos, llaves y montos para que las columnas de dinero queden siempre alineadas.

---

## 2. Arquitectura liviana sin paso de compilación (y qué cambiaría después)

Para esta versión elegí **HTML5 + Tailwind CSS (CDN) + JavaScript puro con ES Modules** ([frontend/index.html](../frontend/index.html), [frontend/app.js](../frontend/app.js), [frontend/js/api.js](../frontend/js/api.js) y los componentes por vista).

- **Por qué así para el reto:** Como mi enfoque principal estuvo en el backend financiero y tuve poco tiempo para el frontend, evitar `node_modules`, bundlers y pasos de build me permitió iterar rápido y servir el sitio directamente con Nginx.
- **Qué haría distinto con más tiempo:** Como ya mencioné en las conclusiones del proyecto, para una versión más grande usaría un framework moderno como **React o Next.js con TypeScript**. Eso ayudaría a manejar mejor estados complejos entre pantallas, tener validaciones compartidas con tipos y escalar componentes sin depender de manipular el DOM manualmente.

---

## 3. Flujos principales y decisiones de usabilidad

### A. Portada *"Esto es Vaqui."* y llaves cortas `@ABC123`
- Al entrar, la aplicación muestra la bienvenida *"Esto es Vaqui."* con acceso rápido mediante llave corta (por ejemplo `@ALI111`, `@BOB222`, `@CHA333`) o creación de cuenta nueva desde la misma pantalla.
- Usar llaves cortas en lugar de exigir UUIDs completos hace que enviar dinero o invitar personas a una Vaquita sea natural y fácil de demostrar.

### B. Arranque limpio de datos (`SeedService`)
- Al iniciar la base de datos por primera vez, `SeedService.seed_all` crea únicamente los **3 usuarios demo** (`Alice Titular` con `100.000 COP`, `Bob Roommate` con `50.000 COP` y `Charlie Amigo` con `20.000 COP`) y **no crea Vaquitas por defecto**.
- Así la sección de Vaquitas arranca limpia para que quien pruebe la app pueda crear Vaquitas públicas o anónimas desde cero durante la demostración.

### C. Cierre flexible de Vaquitas (`POST /api/v1/cows/{id}/finish`)
- Al probar los flujos reales noté que a veces una Vaquita ya cumplió su ciclo o se quiere cerrar aunque todavía esté en `0 COP`, o bien desembolsar cuando ya reunió dinero.
- El botón de finalizar usa el endpoint `/api/v1/cows/{id}/finish`: si tiene saldo, transfiere el dinero a la cuenta del creador; si está en `0 COP`, la cierra limpiamente, preservando siempre `total_raised` para que el historial no pierda contexto.

### D. Formato colombiano y validaciones consistentes
- Los montos se muestran en pesos colombianos enteros usando `formatCOP` (`minimumFractionDigits: 0`) en [frontend/js/api.js](../frontend/js/api.js).
- Los formularios de registro validan teléfonos colombianos de 10 dígitos empezando en `3` (sin prefijo `+57`), en línea con el backend (`validate_colombian_phone`).
- Los campos numéricos usan `step="any"` para evitar bloqueos molestos del navegador al escribir montos libres, delegando el formato y validación final al backend.

### E. Idempotencia automática desde el cliente
- Cada recarga, transferencia, aporte o cierre de Vaquita genera una llave única en [frontend/js/api.js](../frontend/js/api.js) y la envía en el encabezado `Idempotency-Key`, junto con `X-User-Id` para identificar al usuario activo.

### F. Privacidad verificable en DevTools (sin trucos visuales)
- No agregué paneles artificiales de depuración dentro de la UI final para no ensuciar la experiencia del usuario. En su lugar, la privacidad Zero-Trust de una Vaquita anónima se puede comprobar directamente abriendo la pestaña **Network** de las herramientas del navegador al cambiar de usuario: la respuesta JSON del servidor entrega `members: []` a los invitados y `contributor_name: null` en los aportes.

---

## 4. Proxy Nginx y orquestación con Docker Compose

En [docker-compose.yml](../docker-compose.yml) y [frontend/nginx.conf](../frontend/nginx.conf) se conectan los 3 servicios (`db`, `api` y `web`):

- **`db` (`postgres:16-alpine`):** Base de datos en el puerto `5432`.
- **`api` (FastAPI en puerto `8000`):** Espera a que PostgreSQL esté saludable y expone `/healthcheck`.
- **`web` (Nginx en puerto `3000` -> `80`):**
  - Sirve los archivos estáticos con cabeceras `no-store, no-cache` para evitar que el navegador muestre versiones viejas del JS o CSS tras un cambio.
  - Reenvía las llamadas `/api/` hacia el contenedor `api:8000` sin barra final que altere las rutas de FastAPI y preservando explícitamente los encabezados `X-User-Id` e `Idempotency-Key`.

---

## 5. Checklist de validación integral

| Verificación | Estado |
| :--- | :--- |
| Arranque completo con `docker compose up` (`db`, `api`, `web`) | ✅ Configurado y documentado |
| Portada *"Esto es Vaqui."* con usuarios demo (`@ALI111`, `@BOB222`, `@CHA333`) y creación de cuentas | ✅ Implementado |
| Validación dual de teléfono colombiano (`3...`, 10 dígitos) y correos únicos | ✅ Implementado y probado |
| Recargas, transferencias por llave `@ABC123` y Vaquitas `PUBLIC` / `ANONYMOUS` | ✅ Implementado y probado |
| Privacidad anónima verificable en respuesta JSON (DevTools -> Network) | ✅ Verificado en API y tests |
| Chequeo de tipos con `pyright` (`0 errors, 0 warnings, 0 informations`) | ✅ Ejecutado y aprobado |
| Suite completa (`98` pruebas unitarias, API y concurrencia en `1.318s`) | ✅ Ejecutada y aprobada |
