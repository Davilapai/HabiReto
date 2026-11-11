"""Harness de sesión asíncrona en memoria para pruebas unitarias de servicios.

Simula el comportamiento de SQLAlchemy AsyncSession para validar lógica
de negocio, reglas de bloqueo, partida doble e invariantes sin requerir
una base de datos relacional externa en tiempo de pruebas.
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from habireto.models.account import Account
from habireto.models.cow import Cow, CowMember
from habireto.models.idempotency import IdempotencyRecord
from habireto.models.ledger import LedgerEntry, Transaction
from habireto.models.user import User


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


class InMemoryAsyncSession:
    """Implementación en memoria de AsyncSession para pruebas unitarias deterministas."""

    def __init__(self) -> None:
        self.users: dict[uuid.UUID, User] = {}
        self.accounts: dict[uuid.UUID, Account] = {}
        self.cows: dict[uuid.UUID, Cow] = {}
        self.members: dict[tuple[uuid.UUID, uuid.UUID], CowMember] = {}
        self.transactions: dict[str, Transaction] = {}
        self.transactions_by_id: dict[uuid.UUID, Transaction] = {}
        self.ledger_entries: list[LedgerEntry] = []
        self.idempotency_records: dict[str, IdempotencyRecord] = {}
        self.queries_executed: list[Any] = []
        self.lock_history: list[uuid.UUID] = []

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

    def add_all(self, objs: list[Any]) -> None:
        for obj in objs:
            self.add(obj)

    async def flush(self) -> None:
        pass

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

        # 3. Consulta de Account
        if selected_name in ("Account", "balance", "id") or "accounts" in stmt_str:
            # Consulta por ID
            for val in params.values():
                if isinstance(val, uuid.UUID):
                    if "for update" in stmt_str:
                        self.lock_history.append(val)
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
                    a for a in self.accounts.values()
                    if a.user_id == user_id and a.status == "ACTIVE" and a.account_type == "USER"
                ]
                first_match = matching[0] if matching else None
                return MockResult(item=first_match, items=matching)

            return MockResult(item=None, items=[])

        # 4. Consulta de Cow
        if selected_name == "Cow" or "cows" in stmt_str:
            for val in params.values():
                if isinstance(val, uuid.UUID) and val in self.cows:
                    cow = self.cows[val]
                    cow.members = [m for m in self.members.values() if m.cow_id == cow.id]
                    for m in cow.members:
                        if m.user_id in self.users:
                            m.user = self.users[m.user_id]
                    if cow.vault_account_id in self.accounts:
                        cow.vault_account = self.accounts[cow.vault_account_id]
                    return MockResult(item=cow, items=[cow])

            all_cows = list(self.cows.values())
            for cow in all_cows:
                cow.members = [m for m in self.members.values() if m.cow_id == cow.id]
                for m in cow.members:
                    if m.user_id in self.users:
                        m.user = self.users[m.user_id]
                if cow.vault_account_id in self.accounts:
                    cow.vault_account = self.accounts[cow.vault_account_id]
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
                matching = [m for m in self.members.values() if m.cow_id == cow_id and m.total_contributed > 0]
                return MockResult(items=matching)
            return MockResult(item=None, items=[])

        # 6. Consulta de User
        if selected_name == "User" or "users" in stmt_str:
            for val in params.values():
                if isinstance(val, uuid.UUID) and val in self.users:
                    return MockResult(item=self.users[val])
            return MockResult(item=None)

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
