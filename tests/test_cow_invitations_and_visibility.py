"""Pruebas de integración para las invitaciones y reglas de visibilidad de Vacas.

Valida que al crear un fondo colaborativo con una lista de invitados (invited_user_ids),
únicamente el creador y los participantes invitados tengan acceso a listar la vaca
en el endpoint GET /api/v1/cows, garantizando la privacidad por membresía.
"""

from typing import cast
import unittest
import uuid
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from habireto.api.deps import get_db_session
from habireto.api.v1.accounts import router as accounts_router
from habireto.api.v1.cows import router as cows_router
from tests.asgi_client import ASGIClient
from tests.mock_session import InMemoryAsyncSession


class TestCowInvitationsAndVisibility(unittest.IsolatedAsyncioTestCase):
    """Pruebas de control de acceso y visibilidad de vacas según invitaciones."""

    async def asyncSetUp(self) -> None:
        """Configura la aplicación FastAPI de pruebas y registra 3 identidades."""
        self.session = InMemoryAsyncSession()
        self.app = FastAPI()
        self.app.include_router(accounts_router)
        self.app.include_router(cows_router)
        self.app.dependency_overrides[get_db_session] = lambda: cast(AsyncSession, self.session)
        self.client = ASGIClient(self.app)

        # Crear cuentas para Alice, Bob y Charlie
        res_a = await self.client.post(
            "/accounts",
            json={"email": "alice@test.com", "full_name": "Alice", "phone_number": "3001111111", "initial_balance": 100000},
        )
        self.alice = res_a.json()

        res_b = await self.client.post(
            "/accounts",
            json={"email": "bob@test.com", "full_name": "Bob", "phone_number": "3002222222", "initial_balance": 50000},
        )
        self.bob = res_b.json()

        res_c = await self.client.post(
            "/accounts",
            json={"email": "charlie@test.com", "full_name": "Charlie", "phone_number": "3003333333", "initial_balance": 20000},
        )
        self.charlie = res_c.json()

    async def test_cow_visibility_restricted_to_creator_and_invitees(self) -> None:
        """Verifica que solo el creador y los usuarios explícitamente invitados puedan ver la vaca."""
        # Alice crea una vaca privada invitando únicamente a Bob
        create_res = await self.client.post(
            "/cows",
            headers={"X-User-Id": self.alice["user_id"]},
            json={
                "title": "Cena Secreta Alice y Bob",
                "description": "Solo para nosotros dos",
                "target_amount": 200000,
                "visibility_type": "PUBLIC",
                "invited_user_ids": [self.bob["user_id"]],
            },
        )
        self.assertEqual(create_res.status_code, 201)
        cow_data = create_res.json()
        cow_id = cow_data["id"]

        # 1. Alice consulta sus vacas: DEBE ver la vaca
        alice_cows_res = await self.client.get(
            "/cows",
            headers={"X-User-Id": self.alice["user_id"]},
        )
        self.assertEqual(alice_cows_res.status_code, 200)
        alice_cows = alice_cows_res.json()
        self.assertTrue(any(c["id"] == cow_id for c in alice_cows))

        # 2. Bob consulta sus vacas: DEBE ver la vaca
        bob_cows_res = await self.client.get(
            "/cows",
            headers={"X-User-Id": self.bob["user_id"]},
        )
        self.assertEqual(bob_cows_res.status_code, 200)
        bob_cows = bob_cows_res.json()
        self.assertTrue(any(c["id"] == cow_id for c in bob_cows))

        # 3. Charlie consulta sus vacas: NO DEBE ver la vaca (lista vacía)
        charlie_cows_res = await self.client.get(
            "/cows",
            headers={"X-User-Id": self.charlie["user_id"]},
        )
        self.assertEqual(charlie_cows_res.status_code, 200)
        charlie_cows = charlie_cows_res.json()
        self.assertFalse(any(c["id"] == cow_id for c in charlie_cows))

    async def test_newly_registered_uninvited_user_sees_zero_cows(self) -> None:
        """Verifica que un usuario nuevo no invitado (ej. Pedro Picapiedra) obtenga lista vacía de vacas."""
        # 1. Registrar a Pedro Picapiedra
        res_pedro = await self.client.post(
            "/accounts",
            json={
                "email": "pedro@test.com",
                "full_name": "Pedro Picapiedra",
                "phone_number": "3009999999",
                "initial_balance": 30000,
            },
        )
        self.assertEqual(res_pedro.status_code, 201)
        pedro = res_pedro.json()

        # 2. Pedro consulta vacas: DEBE recibir lista vacía
        pedro_cows_res = await self.client.get(
            "/cows",
            headers={"X-User-Id": pedro["user_id"]},
        )
        self.assertEqual(pedro_cows_res.status_code, 200)
        self.assertEqual(pedro_cows_res.json(), [])

        # 3. Alice crea una vaca e invita a Pedro
        create_res = await self.client.post(
            "/cows",
            headers={"X-User-Id": self.alice["user_id"]},
            json={
                "title": "Almuerzo con Pedro",
                "description": "Vaca compartida",
                "target_amount": 50000,
                "visibility_type": "PUBLIC",
                "invited_user_ids": [pedro["user_id"]],
            },
        )
        self.assertEqual(create_res.status_code, 201)
        cow_id = create_res.json()["id"]

        # 4. Pedro consulta vacas nuevamente: AHORA sí ve la vaca a la que fue invitado
        pedro_cows_after = await self.client.get(
            "/cows",
            headers={"X-User-Id": pedro["user_id"]},
        )
        self.assertEqual(pedro_cows_after.status_code, 200)
        cows_after = pedro_cows_after.json()
        self.assertEqual(len(cows_after), 1)
        self.assertEqual(cows_after[0]["id"], cow_id)
