"""Pruebas de integración para la API de consulta y registro de usuarios (/api/v1/users).

Valida el listado de usuarios con cuentas asociadas y el alta de nuevas personas
para onboarding dinámico en HabiReto.
"""

from typing import cast
import unittest
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from habireto.api.deps import get_db_session
from habireto.api.v1.users import router as users_router
from tests.asgi_client import ASGIClient
from tests.mock_session import InMemoryAsyncSession


class TestApiUsers(unittest.IsolatedAsyncioTestCase):
    """Conjunto de pruebas para la gestión y listado de usuarios."""

    async def asyncSetUp(self) -> None:
        """Inicializa la aplicación FastAPI y cliente de pruebas ASGI."""
        self.session = InMemoryAsyncSession()
        self.app = FastAPI()
        self.app.include_router(users_router)
        self.app.dependency_overrides[get_db_session] = lambda: cast(AsyncSession, self.session)
        self.client = ASGIClient(self.app)

    async def test_create_and_list_users(self) -> None:
        """Valida la creación de un nuevo usuario y su posterior visualización en el listado."""
        # 1. Registrar una nueva persona
        res = await self.client.post(
            "/users",
            json={
                "email": "diana@habireto.com",
                "full_name": "Diana Morales",
                "phone_number": "3004445555",
                "initial_balance": 80000,
            },
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["full_name"], "Diana Morales")
        self.assertEqual(data["email"], "diana@habireto.com")
        self.assertEqual(data["phone_number"], "3004445555")
        self.assertEqual(data["balance"], 80000)
        self.assertIsNotNone(data["account_id"])
        self.assertTrue(data["account_number"].startswith("ACC-"))

        # 2. Consultar listado de usuarios
        list_res = await self.client.get("/users")
        self.assertEqual(list_res.status_code, 200)
        users = list_res.json()
        self.assertTrue(len(users) >= 1)
        found = next((u for u in users if u["email"] == "diana@habireto.com"), None)
        self.assertIsNotNone(found)
        assert found is not None
        self.assertEqual(found["account_number"], data["account_number"])
        self.assertEqual(found["balance"], 80000)
