"""Pruebas unitarias para esquemas Pydantic v2 y serialización de privacidad.

Valida restricciones de entrada (montos positivos, auto-transferencias rechazadas)
y la invariante de seguridad fundamental: en fondos colaborativos anónimos, los
aportes de terceros jamás se exponen en el payload de respuesta hacia ningún cliente.
"""

import unittest
import uuid
from datetime import datetime, timezone
from pydantic import ValidationError

from habireto.models.cow import Cow, CowMember, CowMemberRole, CowStatus, CowVisibilityType
from habireto.models.ledger import Transaction, TransactionStatus, TransactionType
from habireto.models.user import User
from habireto.schemas.account import (
    AccountCreateRequest,
    LoadBalanceRequest,
)
from habireto.schemas.cow import (
    CowContributeRequest,
    CowCreateRequest,
    CowDetailResponse,
)
from habireto.schemas.transfer import TransferRequest


class TestSchemasValidation(unittest.TestCase):
    """Batería de pruebas para validación de contratos y reglas de negocio en esquemas."""

    def test_account_create_valid(self) -> None:
        """Verifica la validación correcta de creación de cuenta."""
        req = AccountCreateRequest(
            email="maria@banco.com",
            full_name="María Pérez",
            phone_number="3109998877",
            initial_balance=500000,
        )
        self.assertEqual(req.email, "maria@banco.com")
        self.assertEqual(req.phone_number, "3109998877")
        self.assertEqual(req.initial_balance, 500000)

    def test_account_create_invalid_phone_rejected(self) -> None:
        """Verifica que celulares con +57, longitud distinta de 10 o que no inicien por 3 sean rechazados."""
        for invalid_phone in ["+573109998877", "2109998877", "300123456", "30012345678", "300123456a"]:
            with self.assertRaises(ValidationError):
                AccountCreateRequest(
                    email="maria@banco.com",
                    full_name="María Pérez",
                    phone_number=invalid_phone,
                    initial_balance=50000,
                )

    def test_account_create_negative_balance_rejected(self) -> None:
        """Verifica que un saldo inicial negativo sea rechazado por el esquema."""
        with self.assertRaises(ValidationError):
            AccountCreateRequest(
                email="maria@banco.com",
                full_name="María Pérez",
                phone_number="3109998877",
                initial_balance=-1000,
            )

    def test_load_balance_invalid_amount(self) -> None:
        """Verifica el rechazo de recargas con montos no positivos."""
        with self.assertRaises(ValidationError):
            LoadBalanceRequest(amount=0)
        with self.assertRaises(ValidationError):
            LoadBalanceRequest(amount=-500)

    def test_transfer_request_success(self) -> None:
        """Verifica una solicitud válida de transferencia P2P entre dos cuentas distintas."""
        src = uuid.uuid4()
        dst = uuid.uuid4()
        req = TransferRequest(
            source_account_id=src,
            destination_account_id=dst,
            amount=1500000,
            description="Cena compartida",
        )
        self.assertEqual(req.source_account_id, src)
        self.assertEqual(req.destination_account_id, dst)
        self.assertEqual(req.amount, 1500000)

    def test_transfer_request_self_transfer_rejected(self) -> None:
        """Verifica el rechazo inmediato si la cuenta de origen y destino son idénticas."""
        same_id = uuid.uuid4()
        with self.assertRaises(ValidationError) as ctx:
            TransferRequest(
                source_account_id=same_id,
                destination_account_id=same_id,
                amount=50000,
            )
        self.assertIn("No es posible transferir fondos hacia la misma cuenta de origen", str(ctx.exception))

    def test_transfer_request_negative_amount_rejected(self) -> None:
        """Verifica que montos <= 0 en transferencias sean rechazados."""
        with self.assertRaises(ValidationError):
            TransferRequest(
                source_account_id=uuid.uuid4(),
                destination_account_id=uuid.uuid4(),
                amount=0,
            )

    def test_cow_create_request_success(self) -> None:
        """Verifica la creación válida de solicitud de Vaca."""
        req = CowCreateRequest(
            title="Paseo a Santa Marta",
            target_amount=10000000,
            visibility_type=CowVisibilityType.ANONYMOUS,
        )
        self.assertEqual(req.title, "Paseo a Santa Marta")
        self.assertEqual(req.visibility_type, CowVisibilityType.ANONYMOUS)

    def test_cow_create_request_invalid_target(self) -> None:
        """Verifica que metas no positivas sean rechazadas en la creación de Vacas."""
        with self.assertRaises(ValidationError):
            CowCreateRequest(
                title="Meta inválida",
                target_amount=0,
            )


class TestPrivacySerialization(unittest.TestCase):
    """Batería de pruebas de seguridad para la serialización de privacidad en servidor."""

    def setUp(self) -> None:
        self.creator_id = uuid.uuid4()
        self.user_a_id = uuid.uuid4()
        self.user_b_id = uuid.uuid4()
        self.user_zero_id = uuid.uuid4()
        self.stranger_id = uuid.uuid4()

        self.user_creator = User(id=self.creator_id, full_name="Carlos Creador", email="c@test.com", phone_number="+571")
        self.user_a = User(id=self.user_a_id, full_name="Ana Aportante", email="a@test.com", phone_number="+572")
        self.user_b = User(id=self.user_b_id, full_name="Bernardo Aportante", email="b@test.com", phone_number="+573")
        self.user_zero = User(id=self.user_zero_id, full_name="Diana Invitada", email="d@test.com", phone_number="+574")

        self.cow_id = uuid.uuid4()
        self.vault_id = uuid.uuid4()

    def _create_mock_cow(self, visibility: CowVisibilityType) -> Cow:
        now = datetime.now(timezone.utc)
        cow = Cow(
            id=self.cow_id,
            creator_id=self.creator_id,
            vault_account_id=self.vault_id,
            title="Regalo Sorpresa",
            description="Recaudo confidencial",
            target_amount=1000000,
            visibility_type=visibility.value,
            status=CowStatus.ACTIVE.value,
            created_at=now,
        )

        member_creator = CowMember(
            id=uuid.uuid4(),
            cow_id=self.cow_id,
            user_id=self.creator_id,
            total_contributed=100000,
            role=CowMemberRole.CREATOR.value,
            joined_at=now,
        )
        member_creator.user = self.user_creator

        member_a = CowMember(
            id=uuid.uuid4(),
            cow_id=self.cow_id,
            user_id=self.user_a_id,
            total_contributed=300000,
            role=CowMemberRole.CONTRIBUTOR.value,
            joined_at=now,
        )
        member_a.user = self.user_a

        member_b = CowMember(
            id=uuid.uuid4(),
            cow_id=self.cow_id,
            user_id=self.user_b_id,
            total_contributed=400000,
            role=CowMemberRole.CONTRIBUTOR.value,
            joined_at=now,
        )
        member_b.user = self.user_b

        member_zero = CowMember(
            id=uuid.uuid4(),
            cow_id=self.cow_id,
            user_id=self.user_zero_id,
            total_contributed=0,
            role=CowMemberRole.CONTRIBUTOR.value,
            joined_at=now,
        )
        member_zero.user = self.user_zero

        cow.members = [member_creator, member_a, member_b, member_zero]
        cow.transactions = [
            Transaction(
                id=uuid.uuid4(),
                transaction_type=TransactionType.COW_CONTRIBUTION.value,
                source_account_id=uuid.uuid4(),
                destination_account_id=self.vault_id,
                amount=300000,
                currency="COP",
                cow_id=self.cow_id,
                metadata_json={"contributor_user_id": str(self.user_a_id)},
                status=TransactionStatus.SUCCESS.value,
                created_at=now,
            ),
            Transaction(
                id=uuid.uuid4(),
                transaction_type=TransactionType.COW_CONTRIBUTION.value,
                source_account_id=uuid.uuid4(),
                destination_account_id=self.vault_id,
                amount=400000,
                currency="COP",
                cow_id=self.cow_id,
                metadata_json={"contributor_user_id": str(self.user_b_id)},
                status=TransactionStatus.SUCCESS.value,
                created_at=now,
            ),
        ]
        return cow

    def test_public_cow_creator_sees_all_invitees_and_invitee_sees_only_contributors(self) -> None:
        """En modo PUBLIC, el creador ve todos los invitados (incluso $0) y el invitado solo ve quienes ya aportaron."""
        cow = self._create_mock_cow(CowVisibilityType.PUBLIC)

        # 1. Creador ve a todos (incluyendo a Diana con $0)
        res_creator = CowDetailResponse.from_cow(
            cow=cow,
            requesting_user_id=self.creator_id,
            collected_amount=800000,
        )
        creator_amounts = {m.user_id: m.amount_contributed for m in res_creator.members}
        self.assertEqual(len(res_creator.members), 4)
        self.assertEqual(creator_amounts[self.user_zero_id], 0)

        # 2. Invitada Ana solo ve a quienes ya aportaron (> 0)
        res_invitee = CowDetailResponse.from_cow(
            cow=cow,
            requesting_user_id=self.user_a_id,
            collected_amount=800000,
        )
        self.assertEqual(res_invitee.collected_amount, 800000)
        self.assertEqual(res_invitee.progress_percentage, 80.0)
        self.assertEqual(res_invitee.my_contribution, 300000)

        amounts_by_user = {m.user_id: m.amount_contributed for m in res_invitee.members}
        self.assertNotIn(self.user_zero_id, amounts_by_user)
        self.assertEqual(amounts_by_user[self.creator_id], 100000)
        self.assertEqual(amounts_by_user[self.user_a_id], 300000)
        self.assertEqual(amounts_by_user[self.user_b_id], 400000)

    def test_anonymous_cow_hides_member_list_for_invitee_and_exposes_anonymous_contributions(self) -> None:
        """En modo ANONYMOUS, un invitado NO ve la lista de invitados; solo ve los aportes anónimos."""
        cow = self._create_mock_cow(CowVisibilityType.ANONYMOUS)
        res = CowDetailResponse.from_cow(
            cow=cow,
            requesting_user_id=self.user_a_id,
            collected_amount=800000,
        )

        self.assertEqual(res.my_contribution, 300000)
        self.assertEqual(res.members, [])
        self.assertEqual(len(res.contributions), 2)
        for contrib in res.contributions:
            self.assertIsNone(contrib.contributor_name)

    def test_anonymous_cow_shows_invitees_only_to_creator_with_masked_amounts(self) -> None:
        """En modo ANONYMOUS, solo el Creador ve la lista de invitados pero con montos de terceros en None."""
        cow = self._create_mock_cow(CowVisibilityType.ANONYMOUS)
        res = CowDetailResponse.from_cow(
            cow=cow,
            requesting_user_id=self.creator_id,
            collected_amount=800000,
        )

        self.assertEqual(res.my_contribution, 100000)
        self.assertEqual(len(res.members), 4)
        amounts_by_user = {m.user_id: m.amount_contributed for m in res.members}

        # El creador solo ve su propio aporte; terceros son None
        self.assertEqual(amounts_by_user[self.creator_id], 100000)
        self.assertIsNone(amounts_by_user[self.user_a_id])
        self.assertIsNone(amounts_by_user[self.user_b_id])
        self.assertIsNone(amounts_by_user[self.user_zero_id])

    def test_anonymous_cow_hides_members_for_outsider(self) -> None:
        """En modo ANONYMOUS, un tercero no creador recibe lista de miembros vacía."""
        cow = self._create_mock_cow(CowVisibilityType.ANONYMOUS)
        res = CowDetailResponse.from_cow(
            cow=cow,
            requesting_user_id=self.stranger_id,
            collected_amount=800000,
        )

        self.assertEqual(res.my_contribution, 0)
        self.assertEqual(res.members, [])
