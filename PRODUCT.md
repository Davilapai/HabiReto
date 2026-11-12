# PRODUCT.md — HabiReto

## Identidad y Propósito
HabiReto es la plataforma de banca digital y fondos colaborativos ("Vacas") de **HabiCapital**.
Su propósito es permitir transferencias monetarias P2P y gestión de metas de ahorro grupal sin margen de error contable, operando bajo estricta integridad financiera, partida doble y privacidad Zero-Trust.

## Usuarios y Casos de Uso
1. **Titulares de cuenta:** Consultan su saldo certificado en tiempo real, recargan fondos simulados de forma instantánea y realizan transferencias inmediatas entre pares.
2. **Creadores de Vacas:** Diseñan fondos colaborativos grupales (abiertos o anónimos), invitan a contactos registrados, monitorean el avance hacia la meta y desembolsan los fondos recaudados directamente a su cuenta personal.
3. **Participantes de Vacas:** Aportan montos atómicos desde su saldo disponible. En vacas públicas ven las contribuciones de todos; en vacas privadas (Zero-Trust) sus aportes individuales son confidenciales y están protegidos desde el backend.

## Principios y Restricciones No Negociables
- **Moneda y precisión:** Moneda oficial peso colombiano (COP). Todos los montos se computan y almacenan en enteros de 64 bits (`BIGINT`) representando centavos base ($1 COP = 100 centavos). Sin pérdida por coma flotante.
- **Invariante contable:** El balance de una cuenta nunca puede ser negativo (`CHECK (balance >= 0)` en PostgreSQL).
- **Atomicidad y bloqueo:** Bloqueo pesimista ordenado (`SELECT ... FOR UPDATE` ordenando por `account_id`) en transacciones ACID.
- **Idempotencia:** Cabecera `Idempotency-Key` en toda operación mutante para garantizar semántica Exactly-Once.
- **Inmutabilidad del Libro Mayor:** Registro histórico de doble partida inalterable; cada asiento almacena el `balance_after` certificado.
- **Privacidad Zero-Trust:** En iniciativas anónimas, el backend serializa como `null` los aportes de terceros antes de emitir la respuesta HTTP.

## Plataforma y Pila Tecnológica
- **Plataforma:** Web (SPA estática servida por Nginx).
- **Arquitectura Frontend:** HTML5 semántico, CSS3 estructurado (Swiss digital banking minimalism, alto contraste, modo Operate), JavaScript vanilla con módulos ES nativos y store reactivo ligero.
- **Backend:** FastAPI, SQLAlchemy 2.0 Async, PostgreSQL 16 Alpine.
