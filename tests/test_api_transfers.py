"""Pruebas de integración para el endpoint de transferencias P2P.

Valida la ejecución atómica de transferencias, la estricta verificación de titularidad
en frontera, el rechazo de auto-transferencias, la prevención de sobregiros
y la deduplicación criptográfica de idempotencia Exactly-Once.
"""

import unittest
import uuid
from fastapi import FastAPI

from habireto.api.deps import get_db_session
from habireto.api.errors import register_exception_handlers
from habireto.api.v1.accounts import router as accounts_router
from habireto.api.v1.transfers import router as transfers_router
from tests.asgi_client import ASGIClient
from tests.mock_session import InMemoryAsyncSession


class TestApiTransfers(unittest.IsolatedAsyncioTestCase):
    """Batería de pruebas HTTP para transferencias P2P."""

    def setUp(self) -> None:
        self.session = InMemoryAsyncSession()
        self.app = FastAPI()
        register_exception_handlers(self.app)
        self.app.include_router(accounts_router)
        self.app.include_router(transfers_router)

        self.app.dependency_overrides[get_db_session] = lambda: self.session
        self.client = ASGIClient(self.app)

    async def _setup_accounts(self) -> tuple[dict[str, str], dict[str, str]]:
        res_a = await self.client.post(
            "/accounts",
            json={
                "email": "camila@test.com",
                "full_name": "Camila Osorio",
                "phone_number": "+573010000001",
                "initial_balance": 500000,
            },
        )
        res_b = await self.client.post(
            "/accounts",
            json={
                "email": "felipe@test.com",
                "full_name": "Felipe Naranjo",
                "phone_number": "+573010000002",
                "initial_balance": 100000,
            },
        )
        return res_a.json(), res_b.json()

    async def test_transfer_success(self) -> None:
        """Verifica una transferencia P2P legítima entre dos cuentas."""
        acc_a, acc_b = await self._setup_accounts()

        res_tx = await self.client.post(
            "/transfers",
            headers={"X-User-Id": acc_a["user_id"]},
            json={
                "source_account_id": acc_a["id"],
                "destination_account_id": acc_b["id"],
                "amount": 200000,
                "description": "Pago almuerzo",
            },
        )
        self.assertEqual(res_tx.status_code, 200)
        data = res_tx.json()
        self.assertEqual(data["amount"], 200000)
        self.assertEqual(data["transaction_type"], "TRANSFER")
        self.assertEqual(data["status"], "SUCCESS")

        # Verifica saldos resultantes
        bal_a = await self.client.get(f"/accounts/{acc_a['id']}/balance", headers={"X-User-Id": acc_a["user_id"]})
        bal_b = await self.client.get(f"/accounts/{acc_b['id']}/balance", headers={"X-User-Id": acc_b["user_id"]})
        self.assertEqual(bal_a.json()["balance"], 300000)
        self.assertEqual(bal_b.json()["balance"], 300000)

    async def test_transfer_unauthorized_from_foreign_account(self) -> None:
        """Verifica que un usuario no pueda transferir desde una cuenta que no le pertenece."""
        acc_a, acc_b = await self._setup_accounts()

        # Felipe intenta debitar la cuenta de Camila
        res_tx = await self.client.post(
            "/transfers",
            headers={"X-User-Id": acc_b["user_id"]},
            json={
                "source_account_id": acc_a["id"],
                "destination_account_id": acc_b["id"],
                "amount": 50000,
            },
        )
        self.assertEqual(res_tx.status_code, 403)
        self.assertIn("No está autorizado", res_tx.json()["detail"])

    async def test_transfer_self_transfer_rejected(self) -> None:
        """Verifica que intentar transferir a la misma cuenta sea rechazado por el esquema (422)."""
        acc_a, _ = await self._setup_accounts()

        res_tx = await self.client.post(
            "/transfers",
            headers={"X-User-Id": acc_a["user_id"]},
            json={
                "source_account_id": acc_a["id"],
                "destination_account_id": acc_a["id"],
                "amount": 10000,
            },
        )
        self.assertEqual(res_tx.status_code, 422)

    async def test_transfer_insufficient_funds_rejected(self) -> None:
        """Verifica que una transferencia por monto mayor al disponible sea rechazada."""
        acc_a, acc_b = await self._setup_accounts()

        # Camila tiene 500,000 e intenta transferir 800,000
        res_tx = await self.client.post(
            "/transfers",
            headers={"X-User-Id": acc_a["user_id"]},
            json={
                "source_account_id": acc_a["id"],
                "destination_account_id": acc_b["id"],
                "amount": 800000,
            },
        )
        self.assertEqual(res_tx.status_code, 422)
        self.assertIn("Fondos insuficientes", res_tx.json()["detail"])

    async def test_transfer_idempotency_cache_and_conflict(self) -> None:
        """Verifica que reintentos con misma clave no dupliquen débitos y detecten conflictos."""
        acc_a, acc_b = await self._setup_accounts()
        idem_key = f"tx-key-{uuid.uuid4()}"

        payload_1 = {
            "source_account_id": acc_a["id"],
            "destination_account_id": acc_b["id"],
            "amount": 150000,
            "description": "Transferencia con idempotencia",
        }

        # Primer envío
        res1 = await self.client.post(
            "/transfers",
            headers={"X-User-Id": acc_a["user_id"], "Idempotency-Key": idem_key},
            json=payload_1,
        )
        self.assertEqual(res1.status_code, 200)

        # Reenvío idéntico: debe servir caché
        res2 = await self.client.post(
            "/transfers",
            headers={"X-User-Id": acc_a["user_id"], "Idempotency-Key": idem_key},
            json=payload_1,
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res1.json()["id"], res2.json()["id"])

        # Verifica que solo se debitaron 150,000 una única vez
        bal_a = await self.client.get(f"/accounts/{acc_a['id']}/balance", headers={"X-User-Id": acc_a["user_id"]})
        self.assertEqual(bal_a.json()["balance"], 350000)

        # Intento de reusar la misma clave con monto diferente (conflicto)
        payload_conflict = {
            "source_account_id": acc_a["id"],
            "destination_account_id": acc_b["id"],
            "amount": 999999,
        }
        res_conflict = await self.client.post(
            "/transfers",
            headers={"X-User-Id": acc_a["user_id"], "Idempotency-Key": idem_key},
            json=payload_conflict,
        )
        self.assertEqual(res_conflict.status_code, 409)
        self.assertIn("utilizada previamente", res_conflict.json()["detail"])

    async def test_transfer_by_destination_key_bre_b(self) -> None:
        """Verifica que se pueda transferir usando la llave única @ABC123 del destinatario."""
        import uuid as _uuid
        from habireto.schemas.user import compute_user_key

        acc_a, acc_b = await self._setup_accounts()
        dest_key = compute_user_key(_uuid.UUID(acc_b["user_id"]), "Felipe Naranjo")

        res = await self.client.post(
            "/transfers",
            headers={"X-User-Id": acc_a["user_id"]},
            json={
                "source_account_id": acc_a["id"],
                "destination_key": dest_key,
                "amount": 120000,
                "description": "Pago con llave Bre-B",
            },
        )
        self.assertEqual(res.status_code, 200)

        bal_b = await self.client.get(f"/accounts/{acc_b['id']}/balance", headers={"X-User-Id": acc_b["user_id"]})
        self.assertEqual(bal_b.json()["balance"], 220000)
