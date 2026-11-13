# Modelo de Datos e Integridad Financiera — HabiReto (Vaqui)

Este documento describe las tablas, relaciones y restricciones físicas que sostienen el sistema de transferencias P2P y el módulo de **Vaquitas** en PostgreSQL.

---

## 1. Principios del modelo de datos

- **Números exactos sin coma flotante:** Todos los montos y saldos se guardan en enteros de 64 bits (`BIGINT`) representando pesos colombianos (`COP`) enteros, evitando los errores de redondeo de `float` o `double` (por ejemplo, `$50.000 COP` se guarda como `50000`). Todo monto de transferencia, recarga, aporte o meta debe ser estrictamente mayor que cero.
- **Restricciones físicas en la base de datos:** Incluso si fallara una validación en Python, PostgreSQL rechaza directamente saldos negativos (`CHECK (balance >= 0)`), saldos posteriores negativos (`CHECK (balance_after >= 0)`) y montos cero o negativos (`CHECK (amount > 0)`).
- **Cuentas bóveda para Vaquitas (`COW_VAULT`):** Cada Vaquita crea su propia cuenta en la tabla `accounts`. Así, los aportes salen de la cuenta personal del usuario hacia la bóveda, los desembolsos van de la bóveda al creador y los reembolsos salen de la bóveda hacia cada aportante.
- **Libro mayor inmutable:** Las tablas `transactions` y `ledger_entries` son solo de inserción; nunca se editan ni borran registros históricos. Cada movimiento genera un asiento `DEBIT` y otro `CREDIT` (o `CREDIT` en recargas externas simuladas).
- **Idempotencia persistida:** La tabla `idempotency_records` guarda la clave `Idempotency-Key`, el resumen SHA-256 del cuerpo de la petición y la respuesta generada para devolver el mismo resultado ante reintentos de red sin ejecutar el movimiento dos veces.

---

## 2. Reglas de visibilidad en Vaquitas

| Tipo de Vaquita | Avance total hacia la meta | Lista de participantes (`members`) | Montos individuales y avisos de aportes |
| :--- | :--- | :--- | :--- |
| **Pública (`PUBLIC`)** | Visible para todos | El creador ve a todos los invitados (incluso con `$0`); los invitados ven a quienes ya aportaron (`> $0`). | Todos ven nombre y monto de cada aporte. |
| **Privada (`ANONYMOUS`)** | Visible para todos | Solo el creador ve a quién invitó (y con el monto de terceros en `null`). Los invitados reciben la lista vacía `[]`. | Cada persona ve únicamente su propio aporte. En el feed de actividad todos ven los montos individuales con `contributor_name = null`. |

A nivel contable interno, toda transacción en `transactions` y `ledger_entries` guarda siempre quién originó el movimiento (`source_account_id` y `contributor_user_id` en `metadata_json`), manteniendo la auditoría completa sin exponer esos datos en la respuesta pública de las Vaquitas privadas.

---

## 3. Diagrama Entidad-Relación (ERD)

```mermaid
erDiagram
    USERS ||--o{ ACCOUNTS : "owns"
    USERS ||--o{ COWS : "creates"
    USERS ||--o{ COW_MEMBERS : "participates"
    USERS ||--o{ IDEMPOTENCY_RECORDS : "initiates"
    ACCOUNTS ||--o| COWS : "acts as vault for"
    ACCOUNTS ||--o{ LEDGER_ENTRIES : "has"
    COWS ||--o{ COW_MEMBERS : "contains"
    COWS ||--o{ TRANSACTIONS : "associated with"
    TRANSACTIONS ||--|{ LEDGER_ENTRIES : "comprises"

    USERS {
        uuid id PK
        string email UK
        string full_name
        string phone_number UK
        timestamp created_at
        timestamp updated_at
    }

    ACCOUNTS {
        uuid id PK
        uuid user_id FK "nullable for cow vaults"
        string account_number UK
        string account_type "USER | COW_VAULT"
        bigint balance "CHECK balance >= 0"
        string currency "COP"
        string status "ACTIVE | BLOCKED | CLOSED"
        timestamp created_at
        timestamp updated_at
    }

    COWS {
        uuid id PK
        uuid creator_id FK
        uuid vault_account_id FK "UK"
        string title
        text description
        bigint target_amount "CHECK target_amount > 0"
        string visibility_type "PUBLIC | ANONYMOUS"
        string status "ACTIVE | COMPLETED | DISBURSED | CANCELLED"
        timestamp deadline
        timestamp created_at
        timestamp updated_at
    }

    COW_MEMBERS {
        uuid id PK
        uuid cow_id FK
        uuid user_id FK
        bigint total_contributed "CHECK total_contributed >= 0"
        string role "CREATOR | CONTRIBUTOR"
        timestamp joined_at
    }

    TRANSACTIONS {
        uuid id PK
        string idempotency_key UK
        string transaction_type "TOP_UP | TRANSFER | COW_CONTRIBUTION | COW_DISBURSEMENT | COW_REFUND"
        uuid source_account_id FK "nullable for top-up"
        uuid destination_account_id FK
        bigint amount "CHECK amount > 0"
        string currency "COP"
        uuid cow_id FK "nullable"
        string description
        jsonb metadata_json "context"
        string status "SUCCESS | FAILED"
        timestamp created_at
    }

    LEDGER_ENTRIES {
        uuid id PK
        uuid transaction_id FK
        uuid account_id FK
        string entry_type "DEBIT | CREDIT"
        bigint amount "CHECK amount > 0"
        bigint balance_after "CHECK balance_after >= 0"
        timestamp created_at
    }

    IDEMPOTENCY_RECORDS {
        string key PK
        uuid user_id FK
        string request_path
        string request_hash
        int response_status
        jsonb response_body
        timestamp created_at
        timestamp expires_at
    }
```

---

## 4. Especificación de las 7 tablas

### 4.1. `users`
Guarda las personas registradas en la plataforma.
- `id` (`UUID`, PK): Identificador único.
- `email` (`VARCHAR(255)`, `UNIQUE`, `NOT NULL`): Correo electrónico normalizado en minúsculas.
- `full_name` (`VARCHAR(255)`, `NOT NULL`): Nombre completo del titular.
- `phone_number` (`VARCHAR(50)`, `UNIQUE`, `NOT NULL`): Celular colombiano de 10 dígitos iniciado por `3` (validado en `AccountCreateRequest`).
- `created_at` / `updated_at` (`TIMESTAMPTZ`, `NOT NULL`).

### 4.2. `accounts`
Guarda tanto las cuentas personales como las cuentas bóveda de las Vaquitas.
- `id` (`UUID`, PK).
- `user_id` (`UUID`, FK `users.id` con `ON DELETE RESTRICT`, `NULLABLE`): Propietario en cuentas personales; `NULL` en bóvedas `COW_VAULT`.
- `account_number` (`VARCHAR(32)`, `UNIQUE`, `NOT NULL`): Número legible de la cuenta (ej. `ACC-...` o `VAULT-...`).
- `account_type` (`VARCHAR(20)`, `NOT NULL`): `USER` o `COW_VAULT`.
- `balance` (`BIGINT`, `NOT NULL`, `DEFAULT 0`): Saldo actual en pesos COP.
  - Restricción física: `ck_accounts_balance_non_negative` (`balance >= 0`).
- `currency` (`VARCHAR(3)`, `NOT NULL`, `DEFAULT 'COP'`).
- `status` (`VARCHAR(20)`, `NOT NULL`, `DEFAULT 'ACTIVE'`): `ACTIVE`, `BLOCKED` o `CLOSED`.
- `created_at` / `updated_at` (`TIMESTAMPTZ`, `NOT NULL`).

### 4.3. `cows`
Representa cada Vaquita (fondo colaborativo).
- `id` (`UUID`, PK).
- `creator_id` (`UUID`, FK `users.id` con `ON DELETE RESTRICT`, `NOT NULL`).
- `vault_account_id` (`UUID`, FK `accounts.id` con `ON DELETE RESTRICT`, `UNIQUE`, `NOT NULL`): Cuenta bóveda exclusiva de la Vaquita.
- `title` (`VARCHAR(120)`, `NOT NULL`).
- `description` (`TEXT`, `NULLABLE`).
- `target_amount` (`BIGINT`, `NOT NULL`): Meta de recaudo en COP.
  - Restricción física: `ck_cows_target_amount_positive` (`target_amount > 0`).
- `visibility_type` (`VARCHAR(20)`, `NOT NULL`, `DEFAULT 'PUBLIC'`): `PUBLIC` o `ANONYMOUS`.
- `status` (`VARCHAR(20)`, `NOT NULL`, `DEFAULT 'ACTIVE'`): `ACTIVE`, `COMPLETED`, `DISBURSED` o `CANCELLED`.
- `deadline` (`TIMESTAMPTZ`, `NULLABLE`): Fecha límite opcional.
- `created_at` / `updated_at` (`TIMESTAMPTZ`, `NOT NULL`).

### 4.4. `cow_members`
Registra quién participa en cada Vaquita y su aporte acumulado.
- `id` (`UUID`, PK).
- `cow_id` (`UUID`, FK `cows.id` con `ON DELETE CASCADE`, `NOT NULL`).
- `user_id` (`UUID`, FK `users.id` con `ON DELETE RESTRICT`, `NOT NULL`).
- `total_contributed` (`BIGINT`, `NOT NULL`, `DEFAULT 0`).
  - Restricción física: `ck_cow_members_total_contributed_non_negative` (`total_contributed >= 0`).
- `role` (`VARCHAR(20)`, `NOT NULL`, `DEFAULT 'CONTRIBUTOR'`): `CREATOR` o `CONTRIBUTOR`.
- `joined_at` (`TIMESTAMPTZ`, `NOT NULL`).
- Unicidad: `uq_cow_members_cow_user` (`UNIQUE (cow_id, user_id)`).

### 4.5. `transactions`
Registro maestro e inmutable de cada evento financiero.
- `id` (`UUID`, PK).
- `idempotency_key` (`VARCHAR(255)`, `UNIQUE`, `NULLABLE`).
- `transaction_type` (`VARCHAR(30)`, `NOT NULL`): `TOP_UP`, `TRANSFER`, `COW_CONTRIBUTION`, `COW_DISBURSEMENT` o `COW_REFUND`.
- `source_account_id` (`UUID`, FK `accounts.id` con `ON DELETE RESTRICT`, `NULLABLE`): `NULL` en recargas externas simuladas (`TOP_UP`).
- `destination_account_id` (`UUID`, FK `accounts.id` con `ON DELETE RESTRICT`, `NOT NULL`).
- `amount` (`BIGINT`, `NOT NULL`).
  - Restricción física: `ck_transactions_amount_positive` (`amount > 0`).
- `currency` (`VARCHAR(3)`, `NOT NULL`, `DEFAULT 'COP'`).
- `cow_id` (`UUID`, FK `cows.id` con `ON DELETE SET NULL`, `NULLABLE`).
- `description` (`VARCHAR(255)`, `NULLABLE`).
- `metadata_json` (`JSONB`, `NOT NULL`, `DEFAULT '{}'`).
- `status` (`VARCHAR(20)`, `NOT NULL`, `DEFAULT 'SUCCESS'`).
- `created_at` (`TIMESTAMPTZ`, `NOT NULL`).

### 4.6. `ledger_entries`
Asientos contables inmutables asociados a cada transacción.
- `id` (`UUID`, PK).
- `transaction_id` (`UUID`, FK `transactions.id` con `ON DELETE RESTRICT`, `NOT NULL`).
- `account_id` (`UUID`, FK `accounts.id` con `ON DELETE RESTRICT`, `NOT NULL`).
- `entry_type` (`VARCHAR(10)`, `NOT NULL`): `DEBIT` o `CREDIT`.
- `amount` (`BIGINT`, `NOT NULL`).
  - Restricción física: `ck_ledger_entries_amount_positive` (`amount > 0`).
- `balance_after` (`BIGINT`, `NOT NULL`): Saldo de la cuenta inmediatamente después de aplicar el asiento.
  - Restricción física: `ck_ledger_entries_balance_after_non_negative` (`balance_after >= 0`).
- `created_at` (`TIMESTAMPTZ`, `NOT NULL`).

### 4.7. `idempotency_records`
Almacén de respuestas cacheadas para evitar duplicados ante reintentos de red.
- `key` (`VARCHAR(255)`, PK).
- `user_id` (`UUID`, FK `users.id` con `ON DELETE RESTRICT`, `NOT NULL`).
- `request_path` (`VARCHAR(255)`, `NOT NULL`).
- `request_hash` (`VARCHAR(64)`, `NOT NULL`): Resumen SHA-256 canónico del payload.
- `response_status` (`INTEGER`, `NOT NULL`).
- `response_body` (`JSONB`, `NOT NULL`).
- `created_at` (`TIMESTAMPTZ`, `NOT NULL`).
- `expires_at` (`TIMESTAMPTZ`, `NOT NULL`).
