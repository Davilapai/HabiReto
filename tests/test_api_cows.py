"""Pruebas de integración HTTP para los endpoints de Vacas (Fondos Colaborativos).

Valida el ciclo de vida de creación, aportes atómicos, desembolsos, cancelaciones con
reembolsos compensatorios y, de manera primordial, la regla de serialización de privacidad
en servidor: en vacas anónimas NUNCA viaja el monto aportado por terceros en el payload JSON.
"""

import unittest
import uuid
from app.main import app
from habireto.api.deps import get_db_session
from tests.asgi_client import ASGIClient
from tests.mock_session import InMemoryAsyncSession


class TestApiCows(unittest.IsolatedAsyncioTestCase):
    """Batería de pruebas HTTP para el router de Vacas y privacidad de datos."""

    def setUp(self) -> None:
        self.session = InMemoryAsyncSession()
        self.app = app
        self.app.dependency_overrides[get_db_session] = lambda: self.session
        self.client = ASGIClient(self.app)

    async def _create_user_and_account(self, name: str, email: str, phone: str, balance: int = 1000000) -> dict[str, str]:
        res = await self.client.post(
            "/api/v1/accounts",
            json={
                "email": email,
                "full_name": name,
                "phone_number": phone,
                "initial_balance": balance,
            },
        )
        return res.json()

    async def test_create_cow_public_and_anonymous(self) -> None:
        """Verifica la creación exitosa de fondos colaborativos públicos y anónimos."""
        creator = await self._create_user_and_account("Santiago Creador", "santi@test.com", "+573020000001")

        # Creación de Vaca Pública
        res_pub = await self.client.post(
            "/api/v1/cows",
            headers={"X-User-Id": creator["user_id"]},
            json={
                "title": "Asado Fin de Año",
                "description": "Cuota compartida",
                "target_amount": 500000,
                "visibility_type": "PUBLIC",
            },
        )
        self.assertEqual(res_pub.status_code, 201)
        pub_data = res_pub.json()
        self.assertEqual(pub_data["title"], "Asado Fin de Año")
        self.assertEqual(pub_data["visibility_type"], "PUBLIC")
        self.assertEqual(pub_data["status"], "ACTIVE")
        self.assertEqual(len(pub_data["members"]), 1)
        self.assertEqual(pub_data["members"][0]["role"], "CREATOR")

        # Creación de Vaca Anónima
        res_anon = await self.client.post(
            "/api/v1/cows",
            headers={"X-User-Id": creator["user_id"]},
            json={
                "title": "Regalo de Matrimonio Secreto",
                "target_amount": 1000000,
                "visibility_type": "ANONYMOUS",
            },
        )
        self.assertEqual(res_anon.status_code, 201)
        self.assertEqual(res_anon.json()["visibility_type"], "ANONYMOUS")

    async def test_privacy_enforcement_in_anonymous_cow(self) -> None:
        """Verificación estricta de Cero Fugas de Datos en fondos anónimos a nivel HTTP."""
        creator = await self._create_user_and_account("Carlos Creador", "carlos@cow.com", "+573020000010")
        member_a = await self._create_user_and_account("Ana Aportante", "ana@cow.com", "+573020000011")
        member_b = await self._create_user_and_account("Bernardo Aportante", "bernardo@cow.com", "+573020000012")
        stranger = await self._create_user_and_account("Extraño Observador", "ext@cow.com", "+573020000013")

        # Creador abre Vaca Anónima con meta de 1,000,000
        res_cow = await self.client.post(
            "/api/v1/cows",
            headers={"X-User-Id": creator["user_id"]},
            json={
                "title": "Colecta Confidencial",
                "target_amount": 1000000,
                "visibility_type": "ANONYMOUS",
            },
        )
        cow_id = res_cow.json()["id"]

        # Ana aporta 300,000 COP
        res_contrib_a = await self.client.post(
            f"/api/v1/cows/{cow_id}/contributions",
            headers={"X-User-Id": member_a["user_id"]},
            json={"amount": 300000},
        )
        self.assertEqual(res_contrib_a.status_code, 200)

        # Bernardo aporta 400,000 COP
        res_contrib_b = await self.client.post(
            f"/api/v1/cows/{cow_id}/contributions",
            headers={"X-User-Id": member_b["user_id"]},
            json={"amount": 400000},
        )
        self.assertEqual(res_contrib_b.status_code, 200)

        # 1. Ana (invitada) consulta la vaca anónima:
        # Debe ver su aporte (300,000) en my_contribution, NO debe ver la lista de invitados
        # (members == []), y debe ver la lista de aportes anónimos (contributions).
        res_view_a = await self.client.get(
            f"/api/v1/cows/{cow_id}",
            headers={"X-User-Id": member_a["user_id"]},
        )
        self.assertEqual(res_view_a.status_code, 200)
        data_a = res_view_a.json()
        self.assertEqual(data_a["collected_amount"], 700000)
        self.assertEqual(data_a["progress_percentage"], 70.0)
        self.assertEqual(data_a["my_contribution"], 300000)
        self.assertEqual(data_a["members"], [])
        self.assertEqual(len(data_a["contributions"]), 2)
        for c in data_a["contributions"]:
            self.assertIsNone(c["contributor_name"])

        # 2. El CREADOR consulta la vaca:
        # Sabe quiénes están invitados (members), pero los montos de terceros son None.
        res_view_creator = await self.client.get(
            f"/api/v1/cows/{cow_id}",
            headers={"X-User-Id": creator["user_id"]},
        )
        self.assertEqual(res_view_creator.status_code, 200)
        data_creator = res_view_creator.json()
        members_map_creator = {m["user_id"]: m["amount_contributed"] for m in data_creator["members"]}
        self.assertIsNone(members_map_creator[member_a["user_id"]])
        self.assertIsNone(members_map_creator[member_b["user_id"]])
        self.assertEqual(len(data_creator["contributions"]), 2)

        # 3. Un usuario extraño consulta la vaca:
        # CERO miembros expuestos en la lista de invitados.
        res_view_stranger = await self.client.get(
            f"/api/v1/cows/{cow_id}",
            headers={"X-User-Id": stranger["user_id"]},
        )
        self.assertEqual(res_view_stranger.status_code, 200)
        data_stranger = res_view_stranger.json()
        self.assertEqual(data_stranger["my_contribution"], 0)
        self.assertEqual(data_stranger["members"], [])

    async def test_cow_auto_completion_on_target_reached(self) -> None:
        """Verifica que alcanzar o superar la meta transicione automáticamente a COMPLETED."""
        creator = await self._create_user_and_account("Lucía Meta", "lucia@cow.com", "+573020000020")
        member = await self._create_user_and_account("Diego Aportante", "diego@cow.com", "+573020000021")

        res_cow = await self.client.post(
            "/api/v1/cows",
            headers={"X-User-Id": creator["user_id"]},
            json={
                "title": "Meta Rápida",
                "target_amount": 500000,
                "visibility_type": "PUBLIC",
            },
        )
        cow_id = res_cow.json()["id"]

        # Diego aporta el total de la meta
        await self.client.post(
            f"/api/v1/cows/{cow_id}/contributions",
            headers={"X-User-Id": member["user_id"]},
            json={"amount": 500000},
        )

        res_view = await self.client.get(
            f"/api/v1/cows/{cow_id}",
            headers={"X-User-Id": creator["user_id"]},
        )
        self.assertEqual(res_view.json()["status"], "COMPLETED")
        self.assertEqual(res_view.json()["progress_percentage"], 100.0)

    async def test_cow_disbursement_by_creator_and_unauthorized_rejection(self) -> None:
        """Verifica que solo el creador pueda desembolsar y liquide la bóveda al 100%."""
        creator = await self._create_user_and_account("Elena Creadora", "elena@cow.com", "+573020000030", balance=0)
        member = await self._create_user_and_account("Mario Aportante", "mario@cow.com", "+573020000031", balance=500000)

        res_cow = await self.client.post(
            "/api/v1/cows",
            headers={"X-User-Id": creator["user_id"]},
            json={
                "title": "Fondo Graduación",
                "target_amount": 400000,
                "visibility_type": "PUBLIC",
            },
        )
        cow_id = res_cow.json()["id"]

        await self.client.post(
            f"/api/v1/cows/{cow_id}/contributions",
            headers={"X-User-Id": member["user_id"]},
            json={"amount": 400000},
        )

        # Intento de desembolso por el aportante Mario -> 403 Forbidden
        res_disburse_fake = await self.client.post(
            f"/api/v1/cows/{cow_id}/disburse",
            headers={"X-User-Id": member["user_id"]},
        )
        self.assertEqual(res_disburse_fake.status_code, 403)

        # Desembolso legítimo por la creadora Elena
        res_disburse = await self.client.post(
            f"/api/v1/cows/{cow_id}/disburse",
            headers={"X-User-Id": creator["user_id"]},
        )
        self.assertEqual(res_disburse.status_code, 200)
        self.assertEqual(res_disburse.json()["transaction_type"], "COW_DISBURSEMENT")
        self.assertEqual(res_disburse.json()["amount"], 400000)

        # Saldo de Elena ahora debe tener los 400,000 recaudados
        bal_creator = await self.client.get(
            f"/api/v1/accounts/{creator['id']}/balance",
            headers={"X-User-Id": creator["user_id"]},
        )
        self.assertEqual(bal_creator.json()["balance"], 400000)

        # La vaca ahora debe estar en estado DISBURSED
        res_view = await self.client.get(f"/api/v1/cows/{cow_id}", headers={"X-User-Id": creator["user_id"]})
        self.assertEqual(res_view.json()["status"], "DISBURSED")
        self.assertEqual(res_view.json()["collected_amount"], 0)

    async def test_cow_cancellation_and_compensatory_refunds(self) -> None:
        """Verifica la cancelación por el creador y reembolsos compensatorios exactos."""
        creator = await self._create_user_and_account("Gustavo Creador", "gustavo@cow.com", "+573020000040")
        member_a = await self._create_user_and_account("Aura Miembro", "aura@cow.com", "+573020000041", balance=600000)
        member_b = await self._create_user_and_account("Bruno Miembro", "bruno@cow.com", "+573020000042", balance=400000)

        res_cow = await self.client.post(
            "/api/v1/cows",
            headers={"X-User-Id": creator["user_id"]},
            json={
                "title": "Concierto Cancelado",
                "target_amount": 500000,
                "visibility_type": "PUBLIC",
            },
        )
        cow_id = res_cow.json()["id"]

        # Aura aporta 200,000 (saldo queda en 400,000)
        await self.client.post(
            f"/api/v1/cows/{cow_id}/contributions",
            headers={"X-User-Id": member_a["user_id"]},
            json={"amount": 200000},
        )
        # Bruno aporta 150,000 (saldo queda en 250,000)
        await self.client.post(
            f"/api/v1/cows/{cow_id}/contributions",
            headers={"X-User-Id": member_b["user_id"]},
            json={"amount": 150000},
        )

        # Cancelación ejecutada por el creador
        res_cancel = await self.client.post(
            f"/api/v1/cows/{cow_id}/cancel",
            headers={"X-User-Id": creator["user_id"]},
        )
        self.assertEqual(res_cancel.status_code, 200)
        refund_txs = res_cancel.json()
        self.assertEqual(len(refund_txs), 2)
        for tx in refund_txs:
            self.assertEqual(tx["transaction_type"], "COW_REFUND")

        # Saldos restituidos al 100%
        bal_a = await self.client.get(f"/api/v1/accounts/{member_a['id']}/balance", headers={"X-User-Id": member_a["user_id"]})
        bal_b = await self.client.get(f"/api/v1/accounts/{member_b['id']}/balance", headers={"X-User-Id": member_b["user_id"]})
        self.assertEqual(bal_a.json()["balance"], 600000)
        self.assertEqual(bal_b.json()["balance"], 400000)

        # Estado CANCELLED y bóveda drena a 0
        res_view = await self.client.get(f"/api/v1/cows/{cow_id}", headers={"X-User-Id": creator["user_id"]})
        self.assertEqual(res_view.json()["status"], "CANCELLED")
        self.assertEqual(res_view.json()["collected_amount"], 0)

    async def test_create_cow_with_invited_keys_bre_b(self) -> None:
        """Verifica que la creación de una Vaquita permita invitar participantes mediante su llave @ABC123."""
        import uuid as _uuid
        from habireto.schemas.user import compute_user_key

        creator = await self._create_user_and_account("Elena", "elena@test.com", "+5730010", 500000)
        guest = await self._create_user_and_account("Fernando", "fer@test.com", "+5730020", 500000)
        guest_key = compute_user_key(_uuid.UUID(guest["user_id"]), "Fernando")

        res = await self.client.post(
            "/api/v1/cows",
            headers={"X-User-Id": creator["user_id"]},
            json={
                "title": "Vaquita por Llave",
                "target_amount": 300000,
                "visibility_type": "PUBLIC",
                "invited_keys": [guest_key],
            },
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        member_ids = [m["user_id"] for m in data["members"]]
        self.assertIn(guest["user_id"], member_ids)

    async def test_finish_cow_zero_balance_and_with_funds_history(self) -> None:
        """Verifica que se pueda terminar una Vaquita incluso con $0 y que el historial conserve total_raised."""
        creator = await self._create_user_and_account("Paula Creadora", "paula@cow.com", "+5730031", 100000)
        guest = await self._create_user_and_account("Ramiro Invitado", "ramiro@cow.com", "+5730032", 500000)

        # 1. Vaquita en $0 terminada inmediatamente
        res_empty = await self.client.post(
            "/api/v1/cows",
            headers={"X-User-Id": creator["user_id"]},
            json={
                "title": "Vaquita Sin Fondos",
                "target_amount": 200000,
                "visibility_type": "PUBLIC",
            },
        )
        empty_id = res_empty.json()["id"]

        res_finish_empty = await self.client.post(
            f"/api/v1/cows/{empty_id}/finish",
            headers={"X-User-Id": creator["user_id"]},
        )
        self.assertEqual(res_finish_empty.status_code, 200)
        self.assertEqual(res_finish_empty.json()["status"], "DISBURSED")
        self.assertEqual(res_finish_empty.json()["total_raised"], 0)

        # 2. Vaquita con aportes terminada conserva total_raised en el historial
        res_funded = await self.client.post(
            "/api/v1/cows",
            headers={"X-User-Id": creator["user_id"]},
            json={
                "title": "Vaquita Con Aporte",
                "target_amount": 400000,
                "visibility_type": "ANONYMOUS",
                "invited_user_ids": [guest["user_id"]],
            },
        )
        funded_id = res_funded.json()["id"]

        await self.client.post(
            f"/api/v1/cows/{funded_id}/contributions",
            headers={"X-User-Id": guest["user_id"]},
            json={"amount": 250000},
        )

        res_finish_funded = await self.client.post(
            f"/api/v1/cows/{funded_id}/finish",
            headers={"X-User-Id": creator["user_id"]},
        )
        self.assertEqual(res_finish_funded.status_code, 200)
        self.assertEqual(res_finish_funded.json()["status"], "DISBURSED")
        self.assertEqual(res_finish_funded.json()["collected_amount"], 0)
        self.assertEqual(res_finish_funded.json()["total_raised"], 250000)

        # El creador recibió los 250,000 en su cuenta personal (100,000 + 250,000 = 350,000)
        bal_creator = await self.client.get(
            f"/api/v1/accounts/{creator['id']}/balance",
            headers={"X-User-Id": creator["user_id"]},
        )
        self.assertEqual(bal_creator.json()["balance"], 350000)
