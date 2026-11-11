"""Harness de sesión asíncrona en memoria para pruebas unitarias y de estrés.

Simula el comportamiento de SQLAlchemy AsyncSession y el motor relacional PostgreSQL
para validar lógica de negocio, reglas de bloqueo pesimista (SELECT ... FOR UPDATE),
detección de ciclos de interbloqueo (Deadlock Detection en grafo de espera),
partida doble contable e invariantes financieras con reversión transaccional (ACID).
"""

import asyncio
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Callable

from habireto.models.account import Account
from habireto.models.cow import Cow, CowMember
from habireto.models.idempotency import IdempotencyRecord
from habireto.models.ledger import LedgerEntry, Transaction
from habireto.models.user import User


class DeadlockDetectedError(Exception):
    """Excepción que simula el error 40P01 de PostgreSQL (deadlock_detected).

    Se dispara cuando el detector de ciclos en el grafo de asignación de recursos
    encuentra una dependencia circular entre transacciones concurrentes.
    """


class MockResult:
    """Simula el objeto Result de SQLAlchemy."""

    def __init__(self, item: Any = None, items: list[Any] | None = None) -> None:
        self._item = item
        self._items = items if items is not None else ([item] if item is not None else [])

    def scalar_one_or_none(self) -> Any:
        return self._item

    def scalar_one(self) -> Any:
        if self._item is None:
            raise ValueError("No result found in scalar_one")
        return self._item

    def scalars(self) -> "MockResult":
        return self

    def first(self) -> Any:
        return self._items[0] if self._items else None

    def all(self) -> list[Any]:
        return list(self._items)


class LockManager:
    """Administrador de bloqueos pesimistas de fila (SELECT ... FOR UPDATE).

    Emula el subsistema de bloqueo a nivel de tupla de PostgreSQL. Implementa
    un grafo de espera dirigido (Wait-For Graph) para detectar ciclos de interbloqueo
    (Deadlocks) en tiempo real antes de suspender tareas asíncronas.
    """

    def __init__(self) -> None:
        self._locks: dict[uuid.UUID, asyncio.Lock] = {}
        self._owner: dict[uuid.UUID, int] = {}  # resource_id -> session_id
        self._session_locks: dict[int, set[uuid.UUID]] = {}  # session_id -> {resource_id}
        self._wait_for: dict[int, set[int]] = {}  # session_id -> {holding_session_id}
        self.lock_history: list[uuid.UUID] = []

    def _get_lock(self, resource_id: uuid.UUID) -> asyncio.Lock:
        if resource_id not in self._locks:
            self._locks[resource_id] = asyncio.Lock()
        return self._locks[resource_id]

    def _has_cycle(self, start_session: int, target_session: int, visited: set[int] | None = None) -> bool:
        """Detecta si existe un camino dirigido de start_session a target_session en el grafo de espera."""
        if visited is None:
            visited = set()
        visited.add(start_session)

        for next_session in self._wait_for.get(start_session, set()):
            if next_session == target_session:
                return True
            if next_session not in visited:
                if self._has_cycle(next_session, target_session, visited):
                    return True
        return False

    async def acquire_row_lock(self, session_id: int, resource_id: uuid.UUID) -> None:
        """Adquiere un bloqueo exclusivo sobre el recurso solicitado.

        Args:
            session_id: Identificador de la sesión/transacción que solicita el lock.
            resource_id: Identificador único del recurso (ej. ID de cuenta bancaria).

        Raises:
            DeadlockDetectedError: Si la concesión del bloqueo generaría un ciclo de espera circular.
        """
        lock = self._get_lock(resource_id)

        # Si la misma sesión ya posee el lock, es reentrante en la misma transacción
        if self._owner.get(resource_id) == session_id:
            self.lock_history.append(resource_id)
            return

        current_owner = self._owner.get(resource_id)
        if current_owner is not None and current_owner != session_id:
            # Construcción de arista de espera: session_id espera por current_owner
            if session_id not in self._wait_for:
                self._wait_for[session_id] = set()
            self._wait_for[session_id].add(current_owner)

            # Detección de ciclo de interbloqueo: ¿current_owner depende directa o indirectamente de session_id?
            if self._has_cycle(current_owner, session_id):
                # Limpiar arista de espera antes de levantar la excepción
                self._wait_for[session_id].discard(current_owner)
                raise DeadlockDetectedError(
                    f"Deadlock detectado: la sesión {session_id} espera por el recurso {resource_id} "
                    f"retenido por la sesión {current_owner}, formando una espera circular."
                )

        # Esperar la adquisición física del bloqueo
        await lock.acquire()

        # Al adquirir el bloqueo, remover la arista de espera
        if session_id in self._wait_for and current_owner is not None:
            self._wait_for[session_id].discard(current_owner)

        self._owner[resource_id] = session_id
        if session_id not in self._session_locks:
            self._session_locks[session_id] = set()
        self._session_locks[session_id].add(resource_id)
        self.lock_history.append(resource_id)

    def release_locks_for_session(self, session_id: int) -> None:
        """Libera todos los bloqueos adquiridos por una sesión transaccional."""
        held_resources = self._session_locks.pop(session_id, set())
        for resource_id in held_resources:
            if self._owner.get(resource_id) == session_id:
                del self._owner[resource_id]
            lock = self._locks.get(resource_id)
            if lock is not None and lock.locked():
                lock.release()

        self._wait_for.pop(session_id, None)
        # Limpiar dependencias hacia esta sesión en otras sesiones
        for waiting_set in self._wait_for.values():
            waiting_set.discard(session_id)


class AsyncTransactionContext:
    """Context manager para delimitar transacciones atómicas (session.begin())."""

    def __init__(self, session: "InMemoryAsyncSession") -> None:
        self.session = session

    async def __aenter__(self) -> "InMemoryAsyncSession":
        self.session._begin_transaction()
        return self.session

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: Any,
    ) -> bool:
        if exc_type is not None:
            await self.session.rollback()
            return False  # Propagar la excepción al llamador
        else:
            await self.session.commit()
            return True


class ConcurrentDatabaseEngine:
    """Motor de base de datos relacional en memoria con aislamiento transaccional y bloqueo concurrente."""

    def __init__(self) -> None:
        self.users: dict[uuid.UUID, User] = {}
        self.accounts: dict[uuid.UUID, Account] = {}
        self.cows: dict[uuid.UUID, Cow] = {}
        self.members: dict[tuple[uuid.UUID, uuid.UUID], CowMember] = {}
        self.transactions: dict[str, Transaction] = {}
        self.transactions_by_id: dict[uuid.UUID, Transaction] = {}
        self.ledger_entries: list[LedgerEntry] = []
        self.idempotency_records: dict[str, IdempotencyRecord] = {}
        self.lock_manager = LockManager()
        self._next_session_id = 1

    def create_session(self) -> "InMemoryAsyncSession":
        """Genera una nueva sesión transaccional ligada al motor compartido."""
        session_id = self._next_session_id
        self._next_session_id += 1
        return InMemoryAsyncSession(engine=self, session_id=session_id)

    @asynccontextmanager
    async def session(self) -> AsyncGenerator["InMemoryAsyncSession", None]:
        """Context manager que entrega una sesión transaccional con ciclo de vida completo."""
        sess = self.create_session()
        async with sess.begin():
            yield sess

    async def get_db_session(self) -> AsyncGenerator["InMemoryAsyncSession", None]:
        """Dependencia inyectable para FastAPI compatible con get_db_session."""
        async with self.session() as sess:
            yield sess


class InMemoryAsyncSession:
    """Implementación en memoria de AsyncSession para pruebas unitarias deterministas y de estrés."""

    def __init__(
        self,
        engine: ConcurrentDatabaseEngine | None = None,
        session_id: int = 1,
    ) -> None:
        if engine is None:
            self.engine = ConcurrentDatabaseEngine()
        else:
            self.engine = engine

        self.session_id = session_id
        self.queries_executed: list[Any] = []
        self.failure_hook: Callable[[], Any] | None = None

        # Snapshots transaccionales para soporte de rollback
        self._in_transaction = False
        self._balance_snapshots: dict[uuid.UUID, int] = {}
        self._pending_added_objects: list[Any] = []
        self._ledger_count_at_begin = 0
        self._tx_count_at_begin = 0

    @property
    def users(self) -> dict[uuid.UUID, User]:
        return self.engine.users

    @property
    def accounts(self) -> dict[uuid.UUID, Account]:
        return self.engine.accounts

    @property
    def cows(self) -> dict[uuid.UUID, Cow]:
        return self.engine.cows

    @property
    def members(self) -> dict[tuple[uuid.UUID, uuid.UUID], CowMember]:
        return self.engine.members

    @property
    def transactions(self) -> dict[str, Transaction]:
        return self.engine.transactions

    @property
    def transactions_by_id(self) -> dict[uuid.UUID, Transaction]:
        return self.engine.transactions_by_id

    @property
    def ledger_entries(self) -> list[LedgerEntry]:
        return self.engine.ledger_entries

    @property
    def idempotency_records(self) -> dict[str, IdempotencyRecord]:
        return self.engine.idempotency_records

    @property
    def lock_history(self) -> list[uuid.UUID]:
        return self.engine.lock_manager.lock_history

    def begin(self) -> AsyncTransactionContext:
        """Inicia una transacción atómica y retorna su context manager asíncrono."""
        return AsyncTransactionContext(self)

    def _begin_transaction(self) -> None:
        """Guarda los puntos de restauración para permitir el rollback atómico."""
        self._in_transaction = True
        self._balance_snapshots = {acc_id: acc.balance for acc_id, acc in self.accounts.items()}
        self._pending_added_objects = []
        self._ledger_count_at_begin = len(self.ledger_entries)
        self._tx_count_at_begin = len(self.transactions_by_id)

    async def commit(self) -> None:
        """Confirma la transacción actual y libera los locks pesimistas adquiridos."""
        self._in_transaction = False
        self._balance_snapshots.clear()
        self._pending_added_objects.clear()
        self.engine.lock_manager.release_locks_for_session(self.session_id)

    async def rollback(self) -> None:
        """Revierte las mutaciones en saldos, elimina registros no comprometidos y libera locks."""
        # 1. Restaurar saldos exactos de las cuentas
        for acc_id, initial_balance in self._balance_snapshots.items():
            if acc_id in self.accounts:
                self.accounts[acc_id].balance = initial_balance

        # 2. Descartar asientos contables generados en la transacción abortada
        if len(self.ledger_entries) > self._ledger_count_at_begin:
            del self.ledger_entries[self._ledger_count_at_begin :]

        # 3. Descartar transacciones registradas durante la transacción abortada
        for obj in self._pending_added_objects:
            if isinstance(obj, Transaction):
                self.transactions_by_id.pop(obj.id, None)
                if obj.idempotency_key:
                    self.transactions.pop(obj.idempotency_key, None)
            elif isinstance(obj, LedgerEntry):
                if obj in self.ledger_entries:
                    self.ledger_entries.remove(obj)

        self._in_transaction = False
        self._balance_snapshots.clear()
        self._pending_added_objects.clear()
        self.engine.lock_manager.release_locks_for_session(self.session_id)

    def add(self, obj: Any) -> None:
        now = datetime.now(timezone.utc)
        if hasattr(obj, "created_at") and getattr(obj, "created_at", None) is None:
            obj.created_at = now
        if hasattr(obj, "updated_at") and getattr(obj, "updated_at", None) is None:
            obj.updated_at = now
        if hasattr(obj, "joined_at") and getattr(obj, "joined_at", None) is None:
            obj.joined_at = now

        if isinstance(obj, User):
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            self.users[obj.id] = obj
        elif isinstance(obj, Account):
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            self.accounts[obj.id] = obj
            if self._in_transaction and obj.id not in self._balance_snapshots:
                self._balance_snapshots[obj.id] = obj.balance
        elif isinstance(obj, Cow):
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            self.cows[obj.id] = obj
        elif isinstance(obj, CowMember):
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            self.members[(obj.cow_id, obj.user_id)] = obj
        elif isinstance(obj, Transaction):
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            self.transactions_by_id[obj.id] = obj
            if obj.idempotency_key:
                self.transactions[obj.idempotency_key] = obj
        elif isinstance(obj, LedgerEntry):
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            self.ledger_entries.append(obj)
        elif isinstance(obj, IdempotencyRecord):
            self.idempotency_records[obj.key] = obj

        if self._in_transaction:
            self._pending_added_objects.append(obj)

    def add_all(self, objs: list[Any]) -> None:
        for obj in objs:
            self.add(obj)

    async def flush(self) -> None:
        """Ejecuta sincronización de estado o dispara hook de falla inyectada para pruebas."""
        if self.failure_hook is not None:
            self.failure_hook()

    async def execute(self, stmt: Any) -> MockResult:
        self.queries_executed.append(stmt)
        params = stmt.compile().params
        stmt_str = str(stmt).lower()
        col_desc = getattr(stmt, "column_descriptions", [{}])[0]
        selected_name = col_desc.get("name", "")

        # 1. Consulta de IdempotencyRecord
        if selected_name == "IdempotencyRecord" or "idempotency_records" in stmt_str:
            for val in params.values():
                if isinstance(val, str) and val in self.idempotency_records:
                    return MockResult(item=self.idempotency_records[val])
            return MockResult(item=None)

        # 2. Consulta de Transaction por idempotency_key
        if selected_name == "Transaction" and "idempotency_key" in stmt_str:
            for val in params.values():
                if isinstance(val, str) and val in self.transactions:
                    return MockResult(item=self.transactions[val])
            return MockResult(item=None)

        # 3. Consulta de Account (con o sin bloqueo FOR UPDATE)
        if selected_name in ("Account", "balance", "id") or "accounts" in stmt_str:
            # Consulta por ID
            for val in params.values():
                if isinstance(val, uuid.UUID):
                    if "for update" in stmt_str:
                        # Adquisición determinista del lock pesimista a nivel de fila
                        await self.engine.lock_manager.acquire_row_lock(self.session_id, val)
                    if val in self.accounts:
                        acc = self.accounts[val]
                        if selected_name == "balance":
                            return MockResult(item=acc.balance)
                        elif selected_name == "id":
                            return MockResult(item=acc.id)
                        return MockResult(item=acc, items=[acc])

            # Consulta por user_id
            user_id = None
            for k, val in params.items():
                if "user_id" in k and isinstance(val, uuid.UUID):
                    user_id = val
                    break
            if user_id is not None:
                matching = [
                    a
                    for a in self.accounts.values()
                    if a.user_id == user_id and a.status == "ACTIVE" and a.account_type == "USER"
                ]
                first_match = matching[0] if matching else None
                return MockResult(item=first_match, items=matching)

            return MockResult(item=None, items=[])

        # 4. Consulta de Cow
        if selected_name == "Cow" or "cows" in stmt_str:
            all_cows = list(self.cows.values())
            for cow in all_cows:
                cow.members = [m for m in self.members.values() if m.cow_id == cow.id]
                for m in cow.members:
                    if m.user_id in self.users:
                        m.user = self.users[m.user_id]
                if cow.vault_account_id in self.accounts:
                    cow.vault_account = self.accounts[cow.vault_account_id]

            # Si se consulta por cow.id explícito:
            for val in params.values():
                if isinstance(val, uuid.UUID) and val in self.cows:
                    cow = self.cows[val]
                    return MockResult(item=cow, items=[cow])

            # Si se consulta filtrando por miembro participante:
            for val in params.values():
                if isinstance(val, uuid.UUID) and ("cow_members" in stmt_str or "members" in stmt_str or val in self.users):
                    matching = [c for c in all_cows if any(m.user_id == val for m in c.members)]
                    return MockResult(item=matching[0] if matching else None, items=matching)

            # Si se pasó un UUID y no coincidió con ninguna vaca ni usuario:
            has_uuid = any(isinstance(v, uuid.UUID) for v in params.values())
            if has_uuid:
                return MockResult(item=None, items=[])

            return MockResult(item=all_cows[0] if all_cows else None, items=all_cows)

        # 5. Consulta de CowMember
        if selected_name == "CowMember" or "cow_members" in stmt_str:
            cow_id = None
            user_id = None
            for k, val in params.items():
                if "cow_id" in k and isinstance(val, uuid.UUID):
                    cow_id = val
                elif "user_id" in k and isinstance(val, uuid.UUID):
                    user_id = val

            if cow_id is not None and user_id is not None:
                member = self.members.get((cow_id, user_id))
                return MockResult(item=member)
            elif cow_id is not None:
                matching = [
                    m
                    for m in self.members.values()
                    if m.cow_id == cow_id and m.total_contributed > 0
                ]
                return MockResult(items=matching)
            return MockResult(item=None, items=[])

        # 6. Consulta de User
        if selected_name == "User" or "users" in stmt_str:
            for val in params.values():
                if isinstance(val, uuid.UUID) and val in self.users:
                    u = self.users[val]
                    u.accounts = [a for a in self.accounts.values() if a.user_id == u.id]
                    return MockResult(item=u, items=[u])
                if isinstance(val, str):
                    for u in self.users.values():
                        if u.email == val or u.phone_number == val:
                            u.accounts = [a for a in self.accounts.values() if a.user_id == u.id]
                            return MockResult(item=u, items=[u])
            all_users = list(self.users.values())
            for u in all_users:
                u.accounts = [a for a in self.accounts.values() if a.user_id == u.id]
            return MockResult(item=all_users[0] if all_users else None, items=all_users)

        # 7. Consulta de LedgerEntry
        if selected_name == "LedgerEntry" or "ledger_entries" in stmt_str:
            account_id = None
            for val in params.values():
                if isinstance(val, uuid.UUID):
                    account_id = val
                    break
            if account_id is not None:
                entries = [e for e in self.ledger_entries if e.account_id == account_id]
                return MockResult(items=entries)
            return MockResult(items=self.ledger_entries)

        return MockResult(item=None, items=[])
