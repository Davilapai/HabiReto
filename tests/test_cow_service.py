"""Pruebas unitarias para CowService.

Valida el ciclo de vida de los fondos colaborativos ("Vacas"), la asignación de
cuentas bóveda dedicadas (COW_VAULT), aportes atómicos concurrentes, transición
automática al completar la meta, liquidación total al titular y reembolsos compensatorios exactos.
"""

import unittest
import uuid

from habireto.core.exceptions import (
    AccountNotFoundError,
    CowDisbursementError,
    CowNotActiveError,
    CowNotFoundError,
    InsufficientFundsError,
    InvalidAmountError,
    UnauthorizedError,
    UserNotFoundError,
)
from habireto.models.account import Account, AccountStatus, AccountType
from habireto.models.cow import (
    Cow,
    CowMember,
    CowMemberRole,
    CowStatus,
    CowVisibilityType,
)
from habireto.models.ledger import EntryType, TransactionType
from habireto.models.user import User
from habireto.services.cow_service import CowService
from tests.mock_session import InMemoryAsyncSession


class TestCowService(unittest.IsolatedAsyncioTestCase):
    """Batería de pruebas unitarias para el producto diferenciador: Vacas."""

    def setUp(self) -> None:
        self.session = InMemoryAsyncSession()

    async def test_create_cow_creates_vault_and_member(self) -> None:
        """Verifica que crear una Vaca genere automáticamente su cuenta bóveda y membresía del creador."""
        creator_id = uuid.uuid4()
        creator = User(id=creator_id, email="creador@vaca.com", full_name="Creador Vaca", phone_number="+57300123")
        self.session.add(creator)

        cow = await CowService.create_cow(
            session=self.session,  # type: ignore
            creator_user_id=creator_id,
            title="Regalo Matrimonio Laura",
            description="Colecta para el regalo de bodas",
            target_amount=150000000,  # $1.500.000 COP
            visibility_type=CowVisibilityType.PUBLIC,
        )

        self.assertEqual(cow.title, "Regalo Matrimonio Laura")
        self.assertEqual(cow.status, CowStatus.ACTIVE.value)
        self.assertEqual(cow.target_amount, 150000000)

        # Invariante 1: Cuenta bóveda dedicada creada con balance 0
        self.assertIn(cow.vault_account_id, self.session.accounts)
        vault = self.session.accounts[cow.vault_account_id]
        self.assertEqual(vault.account_type, AccountType.COW_VAULT.value)
        self.assertEqual(vault.balance, 0)
        self.assertEqual(vault.currency, "COP")
        self.assertTrue(vault.account_number.startswith("VAULT-"))

        # Invariante 2: Creador registrado como miembro inicial con aporte 0
        member_key = (cow.id, creator_id)
        self.assertIn(member_key, self.session.members)
        creator_member = self.session.members[member_key]
        self.assertEqual(creator_member.role, CowMemberRole.CREATOR.value)
        self.assertEqual(creator_member.total_contributed, 0)

    async def test_create_cow_invalid_target_amount(self) -> None:
        """Verifica que metas no positivas (<= 0) sean rechazadas."""
        with self.assertRaises(InvalidAmountError):
            await CowService.create_cow(
                session=self.session,  # type: ignore
                creator_user_id=uuid.uuid4(),
                title="Vaca Inválida",
                description=None,
                target_amount=0,
                visibility_type=CowVisibilityType.PUBLIC,
            )

    async def test_create_cow_creator_not_found(self) -> None:
        """Verifica que un creador inexistente lance UserNotFoundError."""
        with self.assertRaises(UserNotFoundError):
            await CowService.create_cow(
                session=self.session,  # type: ignore
                creator_user_id=uuid.uuid4(),
                title="Vaca Huérfana",
                description=None,
                target_amount=5000000,
                visibility_type=CowVisibilityType.ANONYMOUS,
            )

    async def test_contribute_success_and_ledger_double_entry(self) -> None:
        """Verifica un aporte atómico: débito al aportante, crédito a la bóveda y registro contable."""
        creator_id = uuid.uuid4()
        contributor_id = uuid.uuid4()

        # Configuración de creador y aportante con saldo
        creator = User(id=creator_id, email="creator@habi.com", full_name="Creador", phone_number="+571")
        contributor = User(id=contributor_id, email="aportante@habi.com", full_name="Aportante", phone_number="+572")
        contributor_acc = Account(
            id=uuid.uuid4(),
            user_id=contributor_id,
            account_type=AccountType.USER.value,
            balance=20000000,  # $200.000 COP
            currency="COP",
            status=AccountStatus.ACTIVE.value,
            account_number="ACC-APORT",
        )
        self.session.add(creator)
        self.session.add(contributor)
        self.session.add(contributor_acc)

        # Crear vaca con meta de $500.000 COP
        cow = await CowService.create_cow(
            session=self.session,  # type: ignore
            creator_user_id=creator_id,
            title="Arriendo Noviembre",
            description="Pago compartido de arriendo",
            target_amount=50000000,
            visibility_type=CowVisibilityType.PUBLIC,
        )

        # Aporte de $50.000 COP
        tx = await CowService.contribute(
            session=self.session,  # type: ignore
            cow_id=cow.id,
            contributor_user_id=contributor_id,
            amount=5000000,
            idempotency_key="contrib-1",
        )

        # 1. Verificación de saldos
        vault = self.session.accounts[cow.vault_account_id]
        self.assertEqual(contributor_acc.balance, 15000000)
        self.assertEqual(vault.balance, 5000000)

        # 2. Invariante de conservación de fondos
        self.assertEqual(contributor_acc.balance + vault.balance, 20000000)

        # 3. Transacción y libro mayor
        self.assertEqual(tx.transaction_type, TransactionType.COW_CONTRIBUTION.value)
        self.assertEqual(tx.amount, 5000000)
        self.assertEqual(tx.cow_id, cow.id)

        # 4. Membresía actualizada
        member = self.session.members[(cow.id, contributor_id)]
        self.assertEqual(member.total_contributed, 5000000)
        self.assertEqual(cow.status, CowStatus.ACTIVE.value)

    async def test_contribute_auto_completes_when_target_reached(self) -> None:
        """Verifica que la vaca transicione automáticamente a COMPLETED al alcanzar la meta."""
        creator_id = uuid.uuid4()
        contributor_id = uuid.uuid4()

        creator = User(id=creator_id, email="c@h.com", full_name="C", phone_number="+571")
        contributor = User(id=contributor_id, email="a@h.com", full_name="A", phone_number="+572")
        contributor_acc = Account(
            id=uuid.uuid4(),
            user_id=contributor_id,
            account_type=AccountType.USER.value,
            balance=10000000,
            status=AccountStatus.ACTIVE.value,
            account_number="ACC-1",
        )
        self.session.add_all([creator, contributor, contributor_acc])

        cow = await CowService.create_cow(
            session=self.session,  # type: ignore
            creator_user_id=creator_id,
            title="Meta Rápida",
            description=None,
            target_amount=10000000,  # Meta: $100.000 COP
            visibility_type=CowVisibilityType.ANONYMOUS,
        )

        # Aporte que cubre el 100% de la meta
        await CowService.contribute(
            session=self.session,  # type: ignore
            cow_id=cow.id,
            contributor_user_id=contributor_id,
            amount=10000000,
        )

        self.assertEqual(cow.status, CowStatus.COMPLETED.value)

    async def test_contribute_insufficient_funds_rejected(self) -> None:
        """Verifica que el aporte se rechace si el saldo del aportante no cubre el monto."""
        creator_id = uuid.uuid4()
        contributor_id = uuid.uuid4()

        creator = User(id=creator_id, email="c@h.com", full_name="C", phone_number="+571")
        contributor = User(id=contributor_id, email="a@h.com", full_name="A", phone_number="+572")
        contributor_acc = Account(
            id=uuid.uuid4(),
            user_id=contributor_id,
            account_type=AccountType.USER.value,
            balance=200000,  # Solo tiene $2.000 COP
            status=AccountStatus.ACTIVE.value,
            account_number="ACC-POOR",
        )
        self.session.add_all([creator, contributor, contributor_acc])

        cow = await CowService.create_cow(
            session=self.session,  # type: ignore
            creator_user_id=creator_id,
            title="Vaca Fondos",
            description=None,
            target_amount=50000000,
            visibility_type=CowVisibilityType.PUBLIC,
        )

        with self.assertRaises(InsufficientFundsError):
            await CowService.contribute(
                session=self.session,  # type: ignore
                cow_id=cow.id,
                contributor_user_id=contributor_id,
                amount=500000,  # Intenta aportar $5.000 COP
            )

    async def test_contribute_inactive_cow_rejected(self) -> None:
        """Verifica que no se acepten aportes a una vaca que no esté en estado ACTIVE."""
        creator_id = uuid.uuid4()
        contributor_id = uuid.uuid4()

        creator = User(id=creator_id, email="c@h.com", full_name="C", phone_number="+571")
        contributor = User(id=contributor_id, email="a@h.com", full_name="A", phone_number="+572")
        contributor_acc = Account(
            id=uuid.uuid4(),
            user_id=contributor_id,
            account_type=AccountType.USER.value,
            balance=5000000,
            status=AccountStatus.ACTIVE.value,
            account_number="ACC-CONTRIB",
        )
        self.session.add_all([creator, contributor, contributor_acc])

        cow = await CowService.create_cow(
            session=self.session,  # type: ignore
            creator_user_id=creator_id,
            title="Vaca Cancelada Previa",
            description=None,
            target_amount=5000000,
            visibility_type=CowVisibilityType.PUBLIC,
        )
        cow.status = CowStatus.CANCELLED.value

        with self.assertRaises(CowNotActiveError):
            await CowService.contribute(
                session=self.session,  # type: ignore
                cow_id=cow.id,
                contributor_user_id=contributor_id,
                amount=100000,
            )

    async def test_disburse_by_creator_success(self) -> None:
        """Verifica la liquidación total: transfiere el 100% de la bóveda al creador y deja la bóveda en 0."""
        creator_id = uuid.uuid4()
        creator = User(id=creator_id, email="creador@habi.com", full_name="Creador", phone_number="+571")
        creator_acc = Account(
            id=uuid.uuid4(),
            user_id=creator_id,
            account_type=AccountType.USER.value,
            balance=1000000,  # Saldo previo: $10.000 COP
            status=AccountStatus.ACTIVE.value,
            account_number="ACC-CREATOR",
        )
        self.session.add_all([creator, creator_acc])

        cow = await CowService.create_cow(
            session=self.session,  # type: ignore
            creator_user_id=creator_id,
            title="Vaca Lista Para Desembolso",
            description=None,
            target_amount=10000000,
            visibility_type=CowVisibilityType.PUBLIC,
        )
        vault = self.session.accounts[cow.vault_account_id]
        vault.balance = 10000000  # $100.000 COP recaudados
        cow.status = CowStatus.COMPLETED.value

        tx = await CowService.disburse(
            session=self.session,  # type: ignore
            cow_id=cow.id,
            requesting_user_id=creator_id,
        )

        # 1. Bóveda drena al 100%
        self.assertEqual(vault.balance, 0)

        # 2. Cuenta personal del creador recibe todo el dinero
        self.assertEqual(creator_acc.balance, 11000000)

        # 3. Transacción contable y estado
        self.assertEqual(tx.transaction_type, TransactionType.COW_DISBURSEMENT.value)
        self.assertEqual(tx.amount, 10000000)
        self.assertEqual(cow.status, CowStatus.DISBURSED.value)

    async def test_disburse_by_non_creator_rejected(self) -> None:
        """Verifica que un tercero que intente liquidar los fondos sea rechazado con UnauthorizedError."""
        creator_id = uuid.uuid4()
        impostor_id = uuid.uuid4()

        creator = User(id=creator_id, email="c@h.com", full_name="C", phone_number="+571")
        self.session.add(creator)

        cow = await CowService.create_cow(
            session=self.session,  # type: ignore
            creator_user_id=creator_id,
            title="Vaca Protegida",
            description=None,
            target_amount=10000000,
            visibility_type=CowVisibilityType.PUBLIC,
        )
        vault = self.session.accounts[cow.vault_account_id]
        vault.balance = 10000000

        with self.assertRaises(UnauthorizedError):
            await CowService.disburse(
                session=self.session,  # type: ignore
                cow_id=cow.id,
                requesting_user_id=impostor_id,
            )

    async def test_disburse_zero_balance_rejected(self) -> None:
        """Verifica que no se permita desembolsar una vaca con saldo 0 en la bóveda."""
        creator_id = uuid.uuid4()
        creator = User(id=creator_id, email="c@h.com", full_name="C", phone_number="+571")
        creator_acc = Account(
            id=uuid.uuid4(),
            user_id=creator_id,
            account_type=AccountType.USER.value,
            balance=0,
            status=AccountStatus.ACTIVE.value,
            account_number="ACC-C",
        )
        self.session.add_all([creator, creator_acc])

        cow = await CowService.create_cow(
            session=self.session,  # type: ignore
            creator_user_id=creator_id,
            title="Vaca Vacía",
            description=None,
            target_amount=10000000,
            visibility_type=CowVisibilityType.PUBLIC,
        )

        with self.assertRaises(CowDisbursementError):
            await CowService.disburse(
                session=self.session,  # type: ignore
                cow_id=cow.id,
                requesting_user_id=creator_id,
            )

    async def test_cancel_and_refund_success_and_balance_conservation(self) -> None:
        """Verifica la cancelación con reembolsos exactos a múltiples miembros dejando la bóveda en 0."""
        creator_id = uuid.uuid4()
        user_1_id = uuid.uuid4()
        user_2_id = uuid.uuid4()

        creator = User(id=creator_id, email="c@h.com", full_name="C", phone_number="+571")
        user_1 = User(id=user_1_id, email="u1@h.com", full_name="U1", phone_number="+572")
        user_2 = User(id=user_2_id, email="u2@h.com", full_name="U2", phone_number="+573")

        u1_acc = Account(id=uuid.uuid4(), user_id=user_1_id, account_type="USER", balance=0, status="ACTIVE", account_number="ACC-U1")
        u2_acc = Account(id=uuid.uuid4(), user_id=user_2_id, account_type="USER", balance=10000, status="ACTIVE", account_number="ACC-U2")
        self.session.add_all([creator, user_1, user_2, u1_acc, u2_acc])

        cow = await CowService.create_cow(
            session=self.session,  # type: ignore
            creator_user_id=creator_id,
            title="Viaje Cancelado",
            description="Se cancela por lluvias",
            target_amount=20000000,
            visibility_type=CowVisibilityType.PUBLIC,
        )

        vault = self.session.accounts[cow.vault_account_id]
        # Simula aportes registrados
        vault.balance = 15000000  # $150.000 COP en bóveda
        self.session.members[(cow.id, user_1_id)] = CowMember(cow_id=cow.id, user_id=user_1_id, total_contributed=10000000)
        self.session.members[(cow.id, user_2_id)] = CowMember(cow_id=cow.id, user_id=user_2_id, total_contributed=5000000)

        # Ejecuta la cancelación con compensación
        refund_txs = await CowService.cancel_and_refund(
            session=self.session,  # type: ignore
            cow_id=cow.id,
            requesting_user_id=creator_id,
        )

        self.assertEqual(len(refund_txs), 2)

        # Invariante 1: La bóveda drena exactamente a 0 centavos
        self.assertEqual(vault.balance, 0)

        # Invariante 2: Cada usuario recibe exactamente lo que aportó
        self.assertEqual(u1_acc.balance, 10000000)
        self.assertEqual(u2_acc.balance, 10000 + 5000000)

        # Invariante 3: Los aportes acumulados se reconcilian en 0
        self.assertEqual(self.session.members[(cow.id, user_1_id)].total_contributed, 0)
        self.assertEqual(self.session.members[(cow.id, user_2_id)].total_contributed, 0)

        # Invariante 4: Estado transiciona a CANCELLED
        self.assertEqual(cow.status, CowStatus.CANCELLED.value)

    async def test_cancel_by_non_creator_rejected(self) -> None:
        """Verifica que solo el creador pueda cancelar la vaca."""
        creator_id = uuid.uuid4()
        other_id = uuid.uuid4()

        creator = User(id=creator_id, email="c@h.com", full_name="C", phone_number="+571")
        self.session.add(creator)

        cow = await CowService.create_cow(
            session=self.session,  # type: ignore
            creator_user_id=creator_id,
            title="Vaca Intocable",
            description=None,
            target_amount=10000000,
            visibility_type=CowVisibilityType.PUBLIC,
        )

        with self.assertRaises(UnauthorizedError):
            await CowService.cancel_and_refund(
                session=self.session,  # type: ignore
                cow_id=cow.id,
                requesting_user_id=other_id,
            )

    async def test_cancel_disbursed_cow_rejected(self) -> None:
        """Verifica que no se pueda cancelar una vaca cuyos fondos ya fueron desembolsados."""
        creator_id = uuid.uuid4()
        creator = User(id=creator_id, email="c@h.com", full_name="C", phone_number="+571")
        self.session.add(creator)

        cow = await CowService.create_cow(
            session=self.session,  # type: ignore
            creator_user_id=creator_id,
            title="Vaca Ya Cobrada",
            description=None,
            target_amount=10000000,
            visibility_type=CowVisibilityType.PUBLIC,
        )
        cow.status = CowStatus.DISBURSED.value

        with self.assertRaises(CowDisbursementError):
            await CowService.cancel_and_refund(
                session=self.session,  # type: ignore
                cow_id=cow.id,
                requesting_user_id=creator_id,
            )


if __name__ == "__main__":
    unittest.main()
