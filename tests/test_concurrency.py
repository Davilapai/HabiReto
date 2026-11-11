"""Pruebas de estrés, concurrencia masiva y consistencia financiera (Fase 3).

Valida matemáticamente y en tiempo de ejecución que el núcleo bancario:
1. Erradica la condición de carrera de sobregiro (Overdraft Race Condition)
   bajo ráfagas concurrentes de peticiones HTTP.
2. Previene al 100% los interbloqueos circulares (Deadlocks) en transferencias
   bidireccionales cruzadas (A -> B y B -> A) mediante ordenamiento lexicográfico.
3. Cumple estrictamente la ley de conservación de masa monetaria (sumatoria de saldos
   iniciales igual a sumatoria de saldos finales) en transferencias aleatorias cruzadas.
4. Ejecuta reversión atómica total (Rollback) ante fallas inyectadas a mitad de transacción,
   garantizando la inexistencia de saldos mutilados o asientos huérfanos en el libro mayor.
"""

import asyncio
import random
import unittest
import uuid
from typing import Any

from fastapi import FastAPI

from habireto.api.deps import get_db_session
from habireto.api.errors import register_exception_handlers
from habireto.api.v1.accounts import router as accounts_router
from habireto.api.v1.transfers import router as transfers_router
from habireto.core.exceptions import InsufficientFundsError
from habireto.models.account import Account, AccountStatus, AccountType
from habireto.models.ledger import EntryType
from habireto.models.user import User
from habireto.services.account_service import AccountService
from tests.asgi_client import ASGIClient
from tests.mock_session import ConcurrentDatabaseEngine, DeadlockDetectedError, InMemoryAsyncSession


class TestConcurrencyAndFinancialConsistency(unittest.IsolatedAsyncioTestCase):
    """Batería de pruebas de estrés para validar invariantes financieras bajo concurrencia."""

    def setUp(self) -> None:
        """Inicializa el motor concurrente y la aplicación FastAPI."""
        self.engine = ConcurrentDatabaseEngine()
        self.app = FastAPI(title="HabiCapital Concurrency Test Harness")
        register_exception_handlers(self.app)
        self.app.include_router(accounts_router)
        self.app.include_router(transfers_router)

        # Inyecta sesiones concurrentes que comparten el mismo motor y lock manager
        self.app.dependency_overrides[get_db_session] = self.engine.get_db_session
        self.client = ASGIClient(self.app)

    async def _create_test_user_and_account(
        self,
        full_name: str,
        email: str,
        initial_balance: int,
    ) -> tuple[User, Account]:
        """Crea directamente en el motor compartido un usuario y su cuenta bancaria."""
        user = User(
            id=uuid.uuid4(),
            email=email,
            full_name=full_name,
            phone_number=f"+57300{random.randint(1000000, 9999999)}",
        )
        self.engine.users[user.id] = user

        account = Account(
            id=uuid.uuid4(),
            user_id=user.id,
            account_number=f"ACC-{user.id.hex[:8].upper()}",
            account_type=AccountType.USER.value,
            balance=initial_balance,
            currency="COP",
            status=AccountStatus.ACTIVE.value,
        )
        self.engine.accounts[account.id] = account
        return user, account

    async def test_concurrent_overdraft_stress(self) -> None:
        """Prueba de Sobregiro Concurrente (Overdraft Stress Test).

        Escenario:
        - Cuenta origen con saldo exacto de $100.000 COP (100.000 centavos o unidades base).
        - Se disparan simultáneamente 50 peticiones HTTP concurrentes intentando debitar
          $20.000 COP cada una hacia una cuenta de destino.

        Aserciones Financieras:
        - Pasan exactamente 5 transferencias con código HTTP 200 (5 * 20.000 = 100.000).
        - 45 transferencias son rechazadas con código HTTP 422 (InsufficientFundsError).
        - Saldo final de la cuenta origen = $0 COP.
        - Saldo final de la cuenta destino = $100.000 COP.
        - Cero dinero duplicado o desaparecido (Masa total conservada).
        - Los asientos en ledger_entries reflejan exactamente $100.000 COP en débitos y créditos.
        """
        # 1. Preparación de cuentas origen y destino
        user_a, acc_a = await self._create_test_user_and_account(
            full_name="Carlos Origen",
            email="carlos.origen@test.com",
            initial_balance=100000,
        )
        user_b, acc_b = await self._create_test_user_and_account(
            full_name="Diana Destino",
            email="diana.destino@test.com",
            initial_balance=0,
        )

        initial_total_mass = acc_a.balance + acc_b.balance
        self.assertEqual(initial_total_mass, 100000)

        # 2. Disparo de 50 peticiones HTTP POST /transfers en ráfaga paralela
        transfer_amount = 20000
        total_requests = 50

        async def _fire_transfer(idx: int) -> Any:
            return await self.client.post(
                "/transfers",
                headers={"X-User-Id": str(user_a.id)},
                json={
                    "source_account_id": str(acc_a.id),
                    "destination_account_id": str(acc_b.id),
                    "amount": transfer_amount,
                    "description": f"Intento concurrente {idx}",
                },
            )

        tasks = [_fire_transfer(i) for i in range(total_requests)]
        responses = await asyncio.gather(*tasks)

        # 3. Clasificación de códigos de respuesta HTTP
        status_200_responses = [r for r in responses if r.status_code == 200]
        status_422_responses = [r for r in responses if r.status_code == 422]

        self.assertEqual(
            len(status_200_responses),
            5,
            f"Debieron pasar exactamente 5 transferencias exitosas, pasaron {len(status_200_responses)}.",
        )
        self.assertEqual(
            len(status_422_responses),
            45,
            f"Debieron rechazarse exactamente 45 transferencias por saldo insuficiente, se rechazaron {len(status_422_responses)}.",
        )

        # Verificar que el error retornado en las 45 peticiones sea InsufficientFundsError
        for r in status_422_responses:
            data = r.json()
            self.assertEqual(data["error_type"], "InsufficientFundsError")
            self.assertIn("Fondos insuficientes", data["detail"])

        # 4. Aserción de saldos persistidos
        final_balance_a = self.engine.accounts[acc_a.id].balance
        final_balance_b = self.engine.accounts[acc_b.id].balance

        self.assertEqual(final_balance_a, 0, f"El saldo final de la cuenta origen debe ser $0, es {final_balance_a}.")
        self.assertEqual(
            final_balance_b,
            100000,
            f"El saldo final de la cuenta destino debe ser $100.000, es {final_balance_b}.",
        )

        # 5. Invariante de conservación de masa monetaria
        final_total_mass = final_balance_a + final_balance_b
        self.assertEqual(
            final_total_mass,
            initial_total_mass,
            "Violación crítica de integridad: la masa monetaria total del sistema cambió.",
        )

        # 6. Auditoría del libro mayor (Partida Doble)
        # Cada una de las 5 transacciones exitosas debe haber generado 1 débito y 1 crédito
        total_debits = sum(e.amount for e in self.engine.ledger_entries if e.entry_type == EntryType.DEBIT.value)
        total_credits = sum(e.amount for e in self.engine.ledger_entries if e.entry_type == EntryType.CREDIT.value)
        self.assertEqual(total_debits, 100000)
        self.assertEqual(total_credits, 100000)
        self.assertEqual(len(self.engine.ledger_entries), 10)  # 5 tx * 2 asientos

    async def test_bidirectional_deadlock_prevention(self) -> None:
        """Prueba de Prevención de Deadlocks Bidireccionales.

        Escenario:
        - Dos cuentas fondeadas A y B con $1.000.000 COP cada una.
        - Se lanzan simultáneamente 50 tareas concurrentes en direcciones cruzadas:
          25 transferencias de A -> B y 25 transferencias de B -> A.

        Aserciones:
        - Cero deadlocks (0 interbloqueos en PostgreSQL gracias al ordenamiento estricto de IDs).
        - Las 50 transferencias completan con éxito.
        - La secuencia de adquisición de locks pesimistas respeta siempre min(id_a, id_b) < max(id_a, id_b).
        - Saldos finales consistentes: Balances_finales = Balances_iniciales (25 * 10k salen y 25 * 10k entran).
        """
        user_a, acc_a = await self._create_test_user_and_account(
            full_name="Banco Nodo A",
            email="nodo.a@test.com",
            initial_balance=1000000,
        )
        user_b, acc_b = await self._create_test_user_and_account(
            full_name="Banco Nodo B",
            email="nodo.b@test.com",
            initial_balance=1000000,
        )

        transfer_amount = 10000
        rounds_per_direction = 25  # 25 A->B y 25 B->A = 50 concurrentes

        async def _transfer_a_to_b(idx: int) -> Any:
            return await self.client.post(
                "/transfers",
                headers={"X-User-Id": str(user_a.id)},
                json={
                    "source_account_id": str(acc_a.id),
                    "destination_account_id": str(acc_b.id),
                    "amount": transfer_amount,
                    "description": f"A to B tx {idx}",
                },
            )

        async def _transfer_b_to_a(idx: int) -> Any:
            return await self.client.post(
                "/transfers",
                headers={"X-User-Id": str(user_b.id)},
                json={
                    "source_account_id": str(acc_b.id),
                    "destination_account_id": str(acc_a.id),
                    "amount": transfer_amount,
                    "description": f"B to A tx {idx}",
                },
            )

        # Construir y entrelazar las 50 tareas concurrentes
        tasks = []
        for i in range(rounds_per_direction):
            tasks.append(_transfer_a_to_b(i))
            tasks.append(_transfer_b_to_a(i))

        # Aleatorizar el orden de despacho para maximizar la contención en el event loop
        random.shuffle(tasks)

        # Limpiar historial de adquisición de locks antes de la ráfaga
        self.engine.lock_manager.lock_history.clear()

        # Ejecución paralela
        responses = await asyncio.gather(*tasks)

        # 1. Verificar que no hubo ningún deadlock y todas tuvieron HTTP 200
        failed_responses = [r for r in responses if r.status_code != 200]
        self.assertEqual(
            len(failed_responses),
            0,
            f"Hubo {len(failed_responses)} transferencias fallidas durante la prueba cruzada.",
        )

        # 2. Verificar la regla de oro anti-deadlock en el historial de bloqueos:
        # Cada transferencia debió solicitar el ID menor antes que el ID mayor.
        expected_min_id = min(acc_a.id, acc_b.id)
        expected_max_id = max(acc_a.id, acc_b.id)

        history = self.engine.lock_manager.lock_history
        # Debe haber 50 pares de bloqueos = 100 entradas
        self.assertEqual(len(history), 100)
        for i in range(0, len(history), 2):
            first_locked = history[i]
            second_locked = history[i + 1]
            self.assertEqual(
                first_locked,
                expected_min_id,
                f"Inversión de bloqueo detectada en la posición {i}: {first_locked} != {expected_min_id}",
            )
            self.assertEqual(
                second_locked,
                expected_max_id,
                f"Inversión de bloqueo detectada en la posición {i+1}: {second_locked} != {expected_max_id}",
            )

        # 3. Verificar saldos finales netos
        # Cada cuenta envió 25 * 10.000 = 250.000 y recibió 25 * 10.000 = 250.000.
        # Saldo neto final debe ser idéntico al inicial: $1.000.000 COP
        bal_a = self.engine.accounts[acc_a.id].balance
        bal_b = self.engine.accounts[acc_b.id].balance
        self.assertEqual(bal_a, 1000000)
        self.assertEqual(bal_b, 1000000)

        # 4. Demostración de contraste:
        # Validar que si dos sesiones intentaran adquirir los recursos en orden invertido (antipatrón no ordenado),
        # el LockManager efectivamente detecta el ciclo de espera y levanta DeadlockDetectedError.
        session_1 = self.engine.create_session()
        session_2 = self.engine.create_session()

        # Sesión 1 adquiere A
        await self.engine.lock_manager.acquire_row_lock(session_1.session_id, acc_a.id)
        # Sesión 2 adquiere B
        await self.engine.lock_manager.acquire_row_lock(session_2.session_id, acc_b.id)

        # Sesión 1 intenta adquirir B (queda en espera de Sesión 2 en el grafo de espera)
        wait_task_1 = asyncio.create_task(
            self.engine.lock_manager.acquire_row_lock(session_1.session_id, acc_b.id)
        )
        await asyncio.sleep(0.01)  # Ceder el paso para registrar la arista de espera S1 -> S2

        # Sesión 2 intenta adquirir A (debe generar un ciclo S2 -> S1 -> S2)
        with self.assertRaises(DeadlockDetectedError) as ctx:
            await self.engine.lock_manager.acquire_row_lock(session_2.session_id, acc_a.id)

        self.assertIn("Deadlock detectado", str(ctx.exception))

        # Limpiar sesiones de contraste
        wait_task_1.cancel()
        await session_1.rollback()
        await session_2.rollback()

    async def test_monetary_mass_conservation_invariant(self) -> None:
        """Prueba de Invariante de Conservación de Masa Monetaria.

        Escenario:
        - 5 cuentas bancarias independientes, cada una con un saldo inicial de $100.000 COP.
        - Masa total del sistema: $500.000 COP.
        - 100 transferencias aleatorias en paralelo entre pares de cuentas con montos variados.

        Aserción Matemática:
            \\sum Balances_finales = \\sum Balances_iniciales = 500.000 COP
        - Cero pérdidas, cero duplicaciones, ningún saldo negativo.
        - Partida doble estricta: Total Débitos = Total Créditos en el libro mayor.
        """
        # Fijar semilla determinista para reproducibilidad matemática
        random.seed(42)

        # 1. Crear 5 cuentas con $100.000 COP cada una
        accounts: list[Account] = []
        users: list[User] = []
        for i in range(5):
            u, a = await self._create_test_user_and_account(
                full_name=f"Participante {i+1}",
                email=f"usuario{i+1}@test.com",
                initial_balance=100000,
            )
            users.append(u)
            accounts.append(a)

        initial_system_mass = sum(a.balance for a in accounts)
        self.assertEqual(initial_system_mass, 500000)

        # 2. Generar 100 transferencias aleatorias en paralelo
        total_transfers = 100

        async def _random_transfer(idx: int) -> None:
            # Seleccionar origen y destino distintos
            src_idx = random.randint(0, 4)
            dest_idx = random.randint(0, 4)
            while dest_idx == src_idx:
                dest_idx = random.randint(0, 4)

            src_user = users[src_idx]
            src_acc = accounts[src_idx]
            dest_acc = accounts[dest_idx]

            # Montos entre $5.000 y $35.000 COP
            amount = random.randint(5, 35) * 1000

            # Disparar petición HTTP contra el núcleo de transferencias
            await self.client.post(
                "/transfers",
                headers={"X-User-Id": str(src_user.id)},
                json={
                    "source_account_id": str(src_acc.id),
                    "destination_account_id": str(dest_acc.id),
                    "amount": amount,
                    "description": f"Transferencia aleatoria #{idx}",
                },
            )

        tasks = [_random_transfer(i) for i in range(total_transfers)]
        # Ejecutar todas las 100 transferencias concurrentemente
        await asyncio.gather(*tasks, return_exceptions=True)

        # 3. Aserción de la Invariante Matemática Fundamental
        final_balances = [self.engine.accounts[a.id].balance for a in accounts]
        final_system_mass = sum(final_balances)

        self.assertEqual(
            final_system_mass,
            initial_system_mass,
            f"¡Quiebre del invariante de conservación de masa!: Inicial={initial_system_mass}, Final={final_system_mass}",
        )

        # 4. Verificar que ninguna cuenta tenga saldo negativo (CHECK balance >= 0)
        for i, bal in enumerate(final_balances):
            self.assertGreaterEqual(
                bal,
                0,
                f"La cuenta {accounts[i].id} quedó en sobregiro con saldo negativo: {bal}",
            )

        # 5. Auditoría de libro mayor (Partida Doble Global)
        total_ledger_debits = sum(e.amount for e in self.engine.ledger_entries if e.entry_type == EntryType.DEBIT.value)
        total_ledger_credits = sum(e.amount for e in self.engine.ledger_entries if e.entry_type == EntryType.CREDIT.value)

        self.assertEqual(
            total_ledger_debits,
            total_ledger_credits,
            "Desbalance contable: la suma total de débitos no coincide con los créditos en el libro mayor.",
        )

    async def test_mid_transaction_failure_injection_rollback(self) -> None:
        """Prueba de Inyección de Falla Mid-Transaction.

        Escenario:
        - Cuenta A con saldo de $200.000 COP. Cuenta B con saldo de $50.000 COP.
        - Se intenta una transferencia de $60.000 COP de A hacia B.
        - Se inyecta una falla catastrófica de infraestructura / base de datos inmediatamente
          después de mutar el saldo de la cuenta de origen (A) y antes de confirmar o asentar el crédito.

        Aserción:
        - Rollback total automático gestionado por el ciclo de vida de la transacción.
        - Saldos 100% intactos (Cuenta A conserva $200.000 COP y Cuenta B conserva $50.000 COP).
        - Cero registros huérfanos en ledger_entries (ningún asiento de débito solitario persistido).
        - Cero registros residuales en la tabla transactions.
        - Liberación completa de todos los locks pesimistas adquiridos.
        """
        user_a, acc_a = await self._create_test_user_and_account(
            full_name="Víctima Falla Origen",
            email="victima.origen@test.com",
            initial_balance=200000,
        )
        user_b, acc_b = await self._create_test_user_and_account(
            full_name="Víctima Falla Destino",
            email="victima.destino@test.com",
            initial_balance=50000,
        )

        entries_before = len(self.engine.ledger_entries)
        tx_count_before = len(self.engine.transactions_by_id)

        # Configurar hook de falla inyectada:
        # Durante session.flush() (invocado por AccountService justo después de debitar A),
        # se simula una caída de conexión / OperationalError de la base de datos.
        failure_triggered = False

        def _inject_db_crash() -> None:
            nonlocal failure_triggered
            failure_triggered = True
            raise RuntimeError("CRASH_SIMULADO: Conexión con PostgreSQL abortada abruptamente.")

        # Ejecutamos la transferencia usando una sesión transaccional con begin()
        session = self.engine.create_session()
        session.failure_hook = _inject_db_crash

        with self.assertRaises(RuntimeError) as exc_ctx:
            async with session.begin():
                await AccountService.transfer(
                    session=session,  # type: ignore
                    source_account_id=acc_a.id,
                    destination_account_id=acc_b.id,
                    amount=60000,
                    description="Transferencia que debe fallar a la mitad",
                )

        self.assertTrue(failure_triggered, "El hook de falla inyectada debió haber sido ejecutado.")
        self.assertIn("CRASH_SIMULADO", str(exc_ctx.exception))

        # Aserciones de Integridad Post-Rollback:
        # 1. Los saldos de ambas cuentas deben estar intactos
        balance_a_after = self.engine.accounts[acc_a.id].balance
        balance_b_after = self.engine.accounts[acc_b.id].balance

        self.assertEqual(
            balance_a_after,
            200000,
            f"El saldo de la cuenta origen fue mutado indebidamente: {balance_a_after} != 200000",
        )
        self.assertEqual(
            balance_b_after,
            50000,
            f"El saldo de la cuenta destino fue mutado indebidamente: {balance_b_after} != 50000",
        )

        # 2. No deben existir asientos contables huérfanos en ledger_entries
        entries_after = len(self.engine.ledger_entries)
        self.assertEqual(
            entries_after,
            entries_before,
            f"Se detectaron registros contables huérfanos: {entries_after} != {entries_before}",
        )

        # 3. No deben existir registros huérfanos en transactions
        tx_count_after = len(self.engine.transactions_by_id)
        self.assertEqual(
            tx_count_after,
            tx_count_before,
            f"Se detectaron transacciones huérfanas: {tx_count_after} != {tx_count_before}",
        )

        # 4. Todos los bloqueos pesimistas debieron ser liberados
        self.assertEqual(
            len(self.engine.lock_manager._session_locks.get(session.session_id, set())),
            0,
            "Quedaron locks pesimistas retenidos tras el rollback.",
        )


if __name__ == "__main__":
    unittest.main()
