# Fase 3: Pruebas de Concurrencia y Conservación de Saldos

En un sistema financiero no basta con probar que una transferencia funciona cuando la usa una sola persona a la vez. Los errores más peligrosos aparecen cuando muchas peticiones llegan al mismo tiempo: saldos que quedan en negativo por doble gasto, operaciones que se bloquean entre sí o dinero que desaparece si falla la base de datos a mitad de camino.

En esta fase diseñé la suite de estrés en [tests/test_concurrency.py](../tests/test_concurrency.py) junto con un motor de simulación en memoria ([tests/mock_session.py](../tests/mock_session.py)) para reproducir esos escenarios de forma rápida y determinista.

---

## 1. La regla de oro: el dinero nunca se crea ni se destruye

La prueba central de cualquier billetera es muy sencilla de entender:

> **La suma de los saldos finales de todas las cuentas siempre debe ser igual a la suma de los saldos iniciales, más las recargas aprobadas, menos los retiros reales.**

Cuando varios usuarios se transfieren plata entre sí o aportan a una Vaquita (cuya bóveda `COW_VAULT` también es una cuenta), la plata solo cambia de bolsillo. Ninguna ráfaga de peticiones concurrentes puede hacer que el total general suba o baje por error.

---

## 2. Por qué `asyncio.Lock` no sirve para proteger dinero

A veces se piensa que poner un `asyncio.Lock()` en Python alrededor de la función `transfer()` resuelve la concurrencia. En realidad no es seguro en producción por dos razones:

1. **Múltiples procesos:** En producción FastAPI suele correr con varios workers de Uvicorn o varias réplicas en contenedores. Cada proceso tiene su propia memoria y su propio `asyncio.Lock`, así que dos peticiones que entren por workers distintos pasarían al mismo tiempo y podrían gastar el mismo saldo dos veces.
2. **Solo bloquea dentro de Python:** Si mañana otro proceso o script toca la base de datos, no sabe nada del candado en memoria de la API.

Por eso la serialización real vive en PostgreSQL mediante `SELECT ... FOR UPDATE` (`with_for_update()`), y las pruebas de esta fase verifican exactamente ese comportamiento.

---

## 3. Cómo simulamos bloqueos reales en `tests/mock_session.py`

Para correr pruebas de concurrencia pesadas en menos de un segundo sin depender de tener un PostgreSQL externo encendido en cada corrida, construí en [tests/mock_session.py](../tests/mock_session.py) una simulación fiel del comportamiento transaccional de Postgres:

- **`ConcurrentDatabaseEngine`:** Mantiene el estado confirmado de cuentas, usuarios, vaquitas y movimientos, más un registro de llaves únicas y restricciones.
- **`InMemoryAsyncSession`:** Aísla los cambios de cada tarea concurrente en una copia local de la transacción. Si la tarea hace `rollback()`, los cambios locales se descartan sin tocar el estado confirmado; solo se publican cuando hace `commit()`.
- **`LockManager`:** Simula los bloqueos por fila (`with_for_update()`). Si dos tareas piden la misma cuenta al mismo tiempo, la segunda espera a que la primera libere el bloqueo al hacer `commit` o `rollback`. Además incluye detección de ciclos en el grafo de espera y lanza `DeadlockDetectedError` si alguna operación intentara adquirir locks en orden opuesto.

---

## 4. Qué valida cada prueba de estrés

En [tests/test_concurrency.py](../tests/test_concurrency.py) se ejecutan 4 escenarios clave:

### A. Prevención de sobregiro bajo ráfagas (`test_concurrent_overdraft_stress`)
- Se crea una cuenta con `100.000 COP` y se lanzan 10 transferencias simultáneas de `20.000 COP` cada una (`asyncio.gather`).
- **Resultado esperado y verificado:** Exactamente **5 transferencias** tienen éxito (consumiendo los `100.000 COP`), las otras **5** fallan limpiamente por saldo insuficiente, el saldo final nunca baja de `0 COP` y la suma total de saldos entre origen y destino sigue siendo `100.000 COP`.

### B. Transferencias cruzadas sin deadlocks (`test_bidirectional_deadlock_prevention`)
- Alice intenta transferirle a Bob 10 veces seguidas en paralelo, mientras al mismo tiempo Bob intenta transferirle a Alice otras 10 veces en paralelo (20 operaciones cruzadas concurrentes).
- **Resultado esperado y verificado:** Gracias a que `AccountService.transfer` siempre bloquea primero la cuenta con el `id` menor y luego la mayor, `LockManager` nunca detecta ciclos, se producen **0 deadlocks**, las 20 transferencias terminan y el dinero total entre ambos permanece intacto.

### C. Conservación de masa monetaria con Vaquitas (`test_monetary_mass_conservation_invariant`)
- Se lanzan múltiples tareas simultáneas combinando transferencias entre usuarios, aportes a una Vaquita (`COW_VAULT`) y recargas (`load_balance`).
- **Resultado esperado y verificado:** Al finalizar todas las tareas, el total combinado en todas las cuentas (`USER` + `COW_VAULT`) coincide peso por peso con el total inicial más las recargas realmente confirmadas.

### D. Falla inyectada a mitad de transacción (`test_mid_transaction_failure_injection_rollback`)
- Se simula un fallo inesperado de base de datos justo después de descontar el dinero de la cuenta origen y antes de cerrar la operación.
- **Resultado esperado y verificado:** La transacción ejecuta `rollback`, la cuenta origen conserva su saldo intacto, la cuenta destino no recibe nada y no quedan registros huérfanos en el historial.

---

## 5. Resultados de verificación

Al correr las pruebas y el analizador estático sobre el código actual:

- **Pruebas de concurrencia:**
  ```text
  PYTHONPATH=src:. .venv/bin/python -m unittest tests/test_concurrency.py -v
  Ran 4 tests in 0.678s — OK
  ```
- **Suite completa del proyecto:**
  ```text
  PYTHONPATH=src:. .venv/bin/python -m unittest discover -s tests -v
  Ran 98 tests in 1.318s — OK
  ```
- **Chequeo estático de tipos:**
  ```text
  pyright
  0 errors, 0 warnings, 0 informations
  ```
