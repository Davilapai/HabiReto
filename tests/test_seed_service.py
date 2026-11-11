"""Pruebas unitarias de integridad e idempotencia para el servicio de sembrado (seed).

Verifica que el servicio cree deterministamente las 3 identidades demo y los fondos
colaborativos, y que múltiples ejecuciones subsecuentes no generen errores ni dupliquen
saldos o registros.
"""

import unittest
from typing import cast
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from habireto.models.account import Account
from habireto.models.cow import Cow, CowVisibilityType
from habireto.models.user import User
from habireto.services.seed_service import (
    ALICE_ACCOUNT_ID,
    ALICE_INITIAL_BALANCE,
    ALICE_USER_ID,
    ANONYMOUS_COW_ID,
    BOB_INITIAL_BALANCE,
    BOB_USER_ID,
    CHARLIE_INITIAL_BALANCE,
    CHARLIE_USER_ID,
    PUBLIC_COW_ID,
    SeedService,
)
from tests.mock_session import InMemoryAsyncSession


class TestSeedService(unittest.IsolatedAsyncioTestCase):
    """Batería de pruebas para la inicialización idempotente de datos demo."""

    async def asyncSetUp(self) -> None:
        self.session = InMemoryAsyncSession()

    async def test_seed_creates_all_demo_users_and_cows(self) -> None:
        """Verifica que la primera ejecución cree las 3 identidades y 2 vacas."""
        await SeedService.seed_all(cast(AsyncSession, self.session))

        # Verificar Alice
        stmt_alice = select(User).where(User.id == ALICE_USER_ID)
        alice = (await self.session.execute(stmt_alice)).scalar_one_or_none()
        self.assertIsNotNone(alice)
        self.assertEqual(alice.email, "alice@habireto.com")

        stmt_alice_acc = select(Account).where(Account.id == ALICE_ACCOUNT_ID)
        alice_acc = (await self.session.execute(stmt_alice_acc)).scalar_one_or_none()
        self.assertIsNotNone(alice_acc)
        self.assertEqual(alice_acc.balance, ALICE_INITIAL_BALANCE)

        # Verificar Bob
        stmt_bob = select(User).where(User.id == BOB_USER_ID)
        bob = (await self.session.execute(stmt_bob)).scalar_one_or_none()
        self.assertIsNotNone(bob)

        # Verificar Charlie
        stmt_charlie = select(User).where(User.id == CHARLIE_USER_ID)
        charlie = (await self.session.execute(stmt_charlie)).scalar_one_or_none()
        self.assertIsNotNone(charlie)

        # Verificar Vaca Pública
        stmt_pub = select(Cow).where(Cow.id == PUBLIC_COW_ID)
        pub_cow = (await self.session.execute(stmt_pub)).scalar_one_or_none()
        self.assertIsNotNone(pub_cow)
        self.assertEqual(pub_cow.creator_id, ALICE_USER_ID)
        self.assertEqual(pub_cow.visibility_type, CowVisibilityType.PUBLIC.value)

        # Verificar Vaca Anónima
        stmt_anon = select(Cow).where(Cow.id == ANONYMOUS_COW_ID)
        anon_cow = (await self.session.execute(stmt_anon)).scalar_one_or_none()
        self.assertIsNotNone(anon_cow)
        self.assertEqual(anon_cow.creator_id, CHARLIE_USER_ID)
        self.assertEqual(anon_cow.visibility_type, CowVisibilityType.ANONYMOUS.value)

    async def test_seed_idempotency_safe_multiple_runs(self) -> None:
        """Verifica que ejecutar el sembrado repetidas veces no altere el saldo ni cause fallos."""
        await SeedService.seed_all(cast(AsyncSession, self.session))
        # Segunda ejecución inmediata
        await SeedService.seed_all(cast(AsyncSession, self.session))

        stmt_alice_acc = select(Account).where(Account.id == ALICE_ACCOUNT_ID)
        alice_acc = (await self.session.execute(stmt_alice_acc)).scalar_one_or_none()
        self.assertIsNotNone(alice_acc)
        # El saldo no debe haberse duplicado
        self.assertEqual(alice_acc.balance, ALICE_INITIAL_BALANCE)
