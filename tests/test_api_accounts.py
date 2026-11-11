"""Pruebas de integración para los endpoints de cuentas bancarias (accounts).

Valida el ciclo de vida de creación de cuentas, recargas simuladas, autorización
en frontera de titularidad mediante X-User-Id, consulta de saldos y extractos.
"""

import unittest
import uuid
from fastapi import FastAPI

from habireto.api.deps import get_db_session
from habireto.api.errors import register_exception_handlers
from habireto.api.v1.accounts import router as accounts_router
from tests.asgi_client import ASGIClient
from tests.mock_session import InMemoryAsyncSession


class TestApiAccounts(unittest.IsolatedAsyncioTestCase):
    """Batería de pruebas HTTP para el router de cuentas bancarias."""

    def setUp(self) -> None:
        self.session = InMemoryAsyncSession()
        self.app = FastAPI()
        register_exception_handlers(self.app)
        self.app.include_router(accounts_router)

        # Inyecta la sesión en memoria para pruebas deterministas
        self.app.dependency_overrides[get_db_session] = lambda: self.session
        self.client = ASGIClient(self.app)

    async def test_create_account_zero_balance(self) -> None:
        """Verifica el onboarding de usuario y creación de cuenta con saldo cero."""
        res = await self.client.post(
            "/accounts",
            json={
                "email": "juan@test.com",
                "full_name": "Juan Valdez",
                "phone_number": "+573001234567",
                "initial_balance": 0,
            },
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["balance"], 0)
        self.assertEqual(data["currency"], "COP")
        self.assertEqual(data["status"], "ACTIVE")
        self.assertTrue(data["account_number"].startswith("ACC-"))
        self.assertIsNotNone(data["id"])
        self.assertIsNotNone(data["user_id"])

    async def test_create_account_with_initial_balance(self) -> None:
        """Verifica la creación de cuenta con saldo inicial positivo."""
        res = await self.client.post(
            "/accounts",
            json={
                "email": "diana@test.com",
                "full_name": "Diana Morales",
                "phone_number": "+573007654321",
                "initial_balance": 1000000,
            },
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["balance"], 1000000)

    async def test_load_balance_success(self) -> None:
        """Verifica una recarga de saldo exitosa por el titular legítimo."""
        # Crea cuenta previa
        res_create = await self.client.post(
            "/accounts",
            json={
                "email": "pedro@test.com",
                "full_name": "Pedro Páramo",
                "phone_number": "+573111111111",
                "initial_balance": 0,
            },
        )
        acc = res_create.json()
        acc_id = acc["id"]
        user_id = acc["user_id"]

        # Recarga autorizada con X-User-Id del titular
        res_load = await self.client.post(
            f"/accounts/{acc_id}/load",
            headers={"X-User-Id": user_id},
            json={"amount": 500000, "description": "Recarga nómina"},
        )
        self.assertEqual(res_load.status_code, 200)
        data = res_load.json()
        self.assertEqual(data["account_id"], acc_id)
        self.assertEqual(data["balance"], 500000)

    async def test_load_balance_unauthorized_wrong_user(self) -> None:
        """Verifica que un usuario ajeno reciba 403 Forbidden al intentar recargar una cuenta."""
        res_create = await self.client.post(
            "/accounts",
            json={
                "email": "lucia@test.com",
                "full_name": "Lucía Méndez",
                "phone_number": "+573222222222",
                "initial_balance": 0,
            },
        )
        acc = res_create.json()
        acc_id = acc["id"]
        impostor_id = str(uuid.uuid4())

        res_load = await self.client.post(
            f"/accounts/{acc_id}/load",
            headers={"X-User-Id": impostor_id},
            json={"amount": 100000},
        )
        self.assertEqual(res_load.status_code, 403)
        self.assertIn("No está autorizado", res_load.json()["detail"])

    async def test_load_balance_idempotency_cache(self) -> None:
        """Verifica que reintentar una recarga con Idempotency-Key retorne la respuesta en caché."""
        res_create = await self.client.post(
            "/accounts",
            json={
                "email": "mateo@test.com",
                "full_name": "Mateo Rossi",
                "phone_number": "+573333333333",
                "initial_balance": 0,
            },
        )
        acc = res_create.json()
        acc_id = acc["id"]
        user_id = acc["user_id"]
        key = f"key-{uuid.uuid4()}"

        # Primer intento
        res1 = await self.client.post(
            f"/accounts/{acc_id}/load",
            headers={"X-User-Id": user_id, "Idempotency-Key": key},
            json={"amount": 300000},
        )
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.json()["balance"], 300000)

        # Segundo intento idéntico: debe servir caché sin duplicar el saldo
        res2 = await self.client.post(
            f"/accounts/{acc_id}/load",
            headers={"X-User-Id": user_id, "Idempotency-Key": key},
            json={"amount": 300000},
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()["balance"], 300000)

    async def test_get_balance_success_and_forbidden(self) -> None:
        """Verifica consulta de saldo autorizada y rechazo a terceros."""
        res_create = await self.client.post(
            "/accounts",
            json={
                "email": "valeria@test.com",
                "full_name": "Valeria Duque",
                "phone_number": "+573444444444",
                "initial_balance": 750000,
            },
        )
        acc = res_create.json()
        acc_id = acc["id"]
        user_id = acc["user_id"]

        # Titular consulta su saldo
        res_bal = await self.client.get(
            f"/accounts/{acc_id}/balance",
            headers={"X-User-Id": user_id},
        )
        self.assertEqual(res_bal.status_code, 200)
        self.assertEqual(res_bal.json()["balance"], 750000)

        # Tercero intenta consultar saldo -> 403 Forbidden
        res_fake = await self.client.get(
            f"/accounts/{acc_id}/balance",
            headers={"X-User-Id": str(uuid.uuid4())},
        )
        self.assertEqual(res_fake.status_code, 403)

    async def test_get_history_extract(self) -> None:
        """Verifica la obtención de extractos contables con saldos posteriores."""
        res_create = await self.client.post(
            "/accounts",
            json={
                "email": "esteban@test.com",
                "full_name": "Esteban Restrepo",
                "phone_number": "+573555555555",
                "initial_balance": 200000,
            },
        )
        acc = res_create.json()
        acc_id = acc["id"]
        user_id = acc["user_id"]

        # Recarga adicional
        await self.client.post(
            f"/accounts/{acc_id}/load",
            headers={"X-User-Id": user_id},
            json={"amount": 100000},
        )

        res_hist = await self.client.get(
            f"/accounts/{acc_id}/history",
            headers={"X-User-Id": user_id},
        )
        self.assertEqual(res_hist.status_code, 200)
        entries = res_hist.json()
        self.assertGreaterEqual(len(entries), 1)
        self.assertEqual(entries[0]["entry_type"], "CREDIT")
