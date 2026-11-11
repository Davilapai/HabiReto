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
            phone_number="+573109998877",
            initial_balance=500000,
        )
        self.assertEqual(req.email, "maria@banco.com")
        self.assertEqual(req.initial_balance, 500000)

    def test_account_create_negative_balance_rejected(self) -> None:
        """Verifica que un saldo inicial negativo sea rechazado por el esquema."""
        with self.assertRaises(ValidationError):
            AccountCreateRequest(
                email="maria@banco.com",
                full_name="María Pérez",
                phone_number="+573109998877",
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
        self.stranger_id = uuid.uuid4()

        self.user_creator = User(id=self.creator_id, full_name="Carlos Creador", email="c@test.com", phone_number="+571")
        self.user_a = User(id=self.user_a_id, full_name="Ana Aportante", email="a@test.com", phone_number="+572")
        self.user_b = User(id=self.user_b_id, full_name="Bernardo Aportante", email="b@test.com", phone_number="+573")

        self.cow_id = uuid.uuid4()
        self.vault_id = uuid.uuid4()

    def _create_mock_cow(self, visibility: CowVisibilityType) -> Cow:
        cow = Cow(
            id=self.cow_id,
            creator_id=self.creator_id,
            vault_account_id=self.vault_id,
            title="Regalo Sorpresa",
            description="Recaudo confidencial",
            target_amount=1000000,
            visibility_type=visibility.value,
            status=CowStatus.ACTIVE.value,
            created_at=datetime.now(timezone.utc),
        )

        member_creator = CowMember(
            id=uuid.uuid4(),
            cow_id=self.cow_id,
            user_id=self.creator_id,
            total_contributed=100000,
            role=CowMemberRole.CREATOR.value,
            joined_at=datetime.now(timezone.utc),
        )
        member_creator.user = self.user_creator

        member_a = CowMember(
            id=uuid.uuid4(),
            cow_id=self.cow_id,
            user_id=self.user_a_id,
            total_contributed=300000,
            role=CowMemberRole.CONTRIBUTOR.value,
            joined_at=datetime.now(timezone.utc),
        )
        member_a.user = self.user_a

        member_b = CowMember(
            id=uuid.uuid4(),
            cow_id=self.cow_id,
            user_id=self.user_b_id,
            total_contributed=400000,
            role=CowMemberRole.CONTRIBUTOR.value,
            joined_at=datetime.now(timezone.utc),
        )
        member_b.user = self.user_b

        cow.members = [member_creator, member_a, member_b]
        return cow

    def test_public_cow_exposes_all_amounts(self) -> None:
        """En modo PUBLIC, todos los miembros ven los aportes exactos de todos."""
        cow = self._create_mock_cow(CowVisibilityType.PUBLIC)
        res = CowDetailResponse.from_cow(
            cow=cow,
            requesting_user_id=self.user_a_id,
            collected_amount=800000,
        )

        self.assertEqual(res.collected_amount, 800000)
        self.assertEqual(res.progress_percentage, 80.0)
        self.assertEqual(res.my_contribution, 300000)

        # En modo público, todos los montos deben ser visibles
        amounts_by_user = {m.user_id: m.amount_contributed for m in res.members}
        self.assertEqual(amounts_by_user[self.creator_id], 100000)
        self.assertEqual(amounts_by_user[self.user_a_id], 300000)
        self.assertEqual(amounts_by_user[self.user_b_id], 400000)

    def test_anonymous_cow_masks_others_for_member_a(self) -> None:
        """En modo ANONYMOUS, el Miembro A solo ve su propio aporte; otros son None."""
        cow = self._create_mock_cow(CowVisibilityType.ANONYMOUS)
        res = CowDetailResponse.from_cow(
            cow=cow,
            requesting_user_id=self.user_a_id,
            collected_amount=800000,
        )

        self.assertEqual(res.my_contribution, 300000)
        amounts_by_user = {m.user_id: m.amount_contributed for m in res.members}

        # Ana ve su aporte exacto
        self.assertEqual(amounts_by_user[self.user_a_id], 300000)
        # Los aportes del Creador y de Bernardo son ESTRICTAMENTE None
        self.assertIsNone(amounts_by_user[self.creator_id])
        self.assertIsNone(amounts_by_user[self.user_b_id])

    def test_anonymous_cow_masks_members_even_for_creator(self) -> None:
        """En modo ANONYMOUS, el Creador NO puede ver los aportes de los demás miembros."""
        cow = self._create_mock_cow(CowVisibilityType.ANONYMOUS)
        res = CowDetailResponse.from_cow(
            cow=cow,
            requesting_user_id=self.creator_id,
            collected_amount=800000,
        )

        self.assertEqual(res.my_contribution, 100000)
        amounts_by_user = {m.user_id: m.amount_contributed for m in res.members}

        # El creador solo ve su propio aporte
        self.assertEqual(amounts_by_user[self.creator_id], 100000)
        # Los aportes individuales de Ana y Bernardo están OCULTOS para el creador
        self.assertIsNone(amounts_by_user[self.user_a_id])
        self.assertIsNone(amounts_by_user[self.user_b_id])

    def test_anonymous_cow_masks_all_amounts_for_outsider(self) -> None:
        """En modo ANONYMOUS, un usuario ajeno ve la lista de nombres pero CERO montos."""
        cow = self._create_mock_cow(CowVisibilityType.ANONYMOUS)
        res = CowDetailResponse.from_cow(
            cow=cow,
            requesting_user_id=self.stranger_id,
            collected_amount=800000,
        )

        self.assertEqual(res.my_contribution, 0)
        for member_view in res.members:
            self.assertIsNone(member_view.amount_contributed)
