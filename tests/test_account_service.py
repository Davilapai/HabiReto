"""Pruebas unitarias para AccountService.

Valida la gestión atómica de cuentas, recargas simuladas, prevención matemática
de deadlocks en transferencias P2P mediante bloqueo ordenado, partidas dobles
y reglas de integridad de fondos.
"""

import unittest
import uuid

from habireto.core.exceptions import (
    AccountNotActiveError,
    AccountNotFoundError,
    CurrencyMismatchError,
    InsufficientFundsError,
    InvalidAmountError,
    SelfTransferError,
)
from habireto.models.account import Account, AccountStatus, AccountType
from habireto.models.ledger import EntryType, LedgerEntry, Transaction, TransactionType
from habireto.services.account_service import AccountService
from tests.mock_session import InMemoryAsyncSession


class TestAccountService(unittest.IsolatedAsyncioTestCase):
    """Batería de pruebas unitarias para AccountService."""

    def setUp(self) -> None:
        self.session = InMemoryAsyncSession()

    async def test_create_user_with_account_zero_balance(self) -> None:
        """Verifica la creación atómica de usuario y cuenta con saldo 0."""
        user, account = await AccountService.create_user_with_account(
            session=self.session,  # type: ignore
            email="carlos@ejemplo.com",
            full_name="Carlos Gómez",
            phone_number="+573001112233",
            initial_balance=0,
        )

        self.assertEqual(user.email, "carlos@ejemplo.com")
        self.assertEqual(account.balance, 0)
        self.assertEqual(account.account_type, AccountType.USER.value)
        self.assertEqual(account.currency, "COP")
        self.assertTrue(account.account_number.startswith("ACC-"))
        self.assertIn(user.id, self.session.users)
        self.assertIn(account.id, self.session.accounts)

    async def test_create_user_with_account_negative_balance_rejected(self) -> None:
        """Verifica que un saldo inicial negativo sea rechazado con InvalidAmountError."""
        with self.assertRaises(InvalidAmountError):
            await AccountService.create_user_with_account(
                session=self.session,  # type: ignore
                email="invalido@ejemplo.com",
                full_name="Usuario Inválido",
                phone_number="+573000000000",
                initial_balance=-5000,
            )

    async def test_create_user_with_account_positive_initial_balance(self) -> None:
        """Verifica que un saldo inicial positivo ejecute load_balance y asiente el crédito."""
        user, account = await AccountService.create_user_with_account(
            session=self.session,  # type: ignore
            email="ana@ejemplo.com",
            full_name="Ana Torres",
            phone_number="+573109998877",
            initial_balance=10000000,  # $100.000 COP
        )

        self.assertEqual(account.balance, 10000000)
        # Verifica que se haya registrado la transacción de recarga
        self.assertEqual(len(self.session.transactions_by_id), 1)
        tx = list(self.session.transactions_by_id.values())[0]
        self.assertEqual(tx.transaction_type, TransactionType.TOP_UP.value)
        self.assertEqual(tx.amount, 10000000)

        # Verifica el asiento en el libro mayor
        self.assertEqual(len(self.session.ledger_entries), 1)
        entry = self.session.ledger_entries[0]
        self.assertEqual(entry.entry_type, EntryType.CREDIT.value)
        self.assertEqual(entry.balance_after, 10000000)

    async def test_load_balance_success(self) -> None:
        """Verifica una recarga de saldo exitosa y la emisión de partida doble."""
        account = Account(
            id=uuid.uuid4(),
            account_number="ACC-TEST",
            account_type=AccountType.USER.value,
            balance=5000000,
            currency="COP",
            status=AccountStatus.ACTIVE.value,
        )
        self.session.add(account)

        tx = await AccountService.load_balance(
            session=self.session,  # type: ignore
            account_id=account.id,
            amount=2000000,
            idempotency_key="topup-key-1",
            description="Recarga PSE simulada",
        )

        self.assertEqual(account.balance, 7000000)
        self.assertEqual(tx.transaction_type, TransactionType.TOP_UP.value)
        self.assertEqual(tx.amount, 2000000)
        self.assertIsNone(tx.source_account_id)
        self.assertEqual(tx.destination_account_id, account.id)

        # Verifica el asiento de crédito
        self.assertEqual(len(self.session.ledger_entries), 1)
        entry = self.session.ledger_entries[0]
        self.assertEqual(entry.entry_type, EntryType.CREDIT.value)
        self.assertEqual(entry.balance_after, 7000000)

    async def test_load_balance_invalid_amount(self) -> None:
        """Verifica el rechazo de recargas con monto <= 0."""
        with self.assertRaises(InvalidAmountError):
            await AccountService.load_balance(
                session=self.session,  # type: ignore
                account_id=uuid.uuid4(),
                amount=0,
            )

    async def test_load_balance_account_not_found(self) -> None:
        """Verifica el rechazo si la cuenta a recargar no existe."""
        with self.assertRaises(AccountNotFoundError):
            await AccountService.load_balance(
                session=self.session,  # type: ignore
                account_id=uuid.uuid4(),
                amount=500000,
            )

    async def test_load_balance_account_blocked(self) -> None:
        """Verifica que una cuenta bloqueada no reciba recargas."""
        account = Account(
            id=uuid.uuid4(),
            account_number="ACC-BLOCKED",
            balance=0,
            status=AccountStatus.BLOCKED.value,
        )
        self.session.add(account)

        with self.assertRaises(AccountNotActiveError):
            await AccountService.load_balance(
                session=self.session,  # type: ignore
                account_id=account.id,
                amount=100000,
            )

    async def test_load_balance_idempotency_cached_response(self) -> None:
        """Verifica que enviar una clave existente retorne la transacción previa sin duplicar saldo."""
        account = Account(
            id=uuid.uuid4(),
            account_number="ACC-IDEMP",
            balance=1000000,
            status=AccountStatus.ACTIVE.value,
        )
        self.session.add(account)

        tx1 = await AccountService.load_balance(
            session=self.session,  # type: ignore
            account_id=account.id,
            amount=500000,
            idempotency_key="key-idemp-topup",
        )
        self.assertEqual(account.balance, 1500000)

        # Reintento con la misma clave
        tx2 = await AccountService.load_balance(
            session=self.session,  # type: ignore
            account_id=account.id,
            amount=500000,
            idempotency_key="key-idemp-topup",
        )
        self.assertEqual(tx1.id, tx2.id)
        # El saldo no debe haber subido a 2000000
        self.assertEqual(account.balance, 1500000)

    async def test_transfer_success_and_ledger_double_entry(self) -> None:
        """Verifica una transferencia P2P con balance exacto y partida doble."""
        source_id = uuid.uuid4()
        dest_id = uuid.uuid4()

        source_acc = Account(
            id=source_id,
            account_number="ACC-SRC",
            balance=10000000,  # $100.000 COP
            currency="COP",
            status=AccountStatus.ACTIVE.value,
        )
        dest_acc = Account(
            id=dest_id,
            account_number="ACC-DEST",
            balance=2000000,  # $20.000 COP
            currency="COP",
            status=AccountStatus.ACTIVE.value,
        )
        self.session.add(source_acc)
        self.session.add(dest_acc)

        tx = await AccountService.transfer(
            session=self.session,  # type: ignore
            source_account_id=source_id,
            destination_account_id=dest_id,
            amount=4000000,  # $40.000 COP
            description="Pago arriendo",
        )

        # Invariante 1: Saldos mutados exactamente
        self.assertEqual(source_acc.balance, 6000000)
        self.assertEqual(dest_acc.balance, 6000000)

        # Invariante 2: Conservación de masa monetaria
        # (10000000 + 2000000) == (6000000 + 6000000) = 12000000
        self.assertEqual(source_acc.balance + dest_acc.balance, 12000000)

        # Invariante 3: Asientos contables de partida doble
        self.assertEqual(len(self.session.ledger_entries), 2)
        debit = next(e for e in self.session.ledger_entries if e.entry_type == EntryType.DEBIT.value)
        credit = next(e for e in self.session.ledger_entries if e.entry_type == EntryType.CREDIT.value)

        self.assertEqual(debit.account_id, source_id)
        self.assertEqual(debit.amount, 4000000)
        self.assertEqual(debit.balance_after, 6000000)

        self.assertEqual(credit.account_id, dest_id)
        self.assertEqual(credit.amount, 4000000)
        self.assertEqual(credit.balance_after, 6000000)

    async def test_transfer_ordered_locking_prevents_deadlock(self) -> None:
        """Verifica que los locks se soliciten siempre en orden ascendente independientemente de los argumentos."""
        id_a = uuid.UUID("00000000-0000-0000-0000-000000000001")
        id_b = uuid.UUID("00000000-0000-0000-0000-000000000002")

        acc_a = Account(id=id_a, balance=5000000, currency="COP", status="ACTIVE")
        acc_b = Account(id=id_b, balance=5000000, currency="COP", status="ACTIVE")
        self.session.add(acc_a)
        self.session.add(acc_b)

        # Caso 1: Origen id_b (mayor), Destino id_a (menor)
        self.session.lock_history.clear()
        await AccountService.transfer(
            session=self.session,  # type: ignore
            source_account_id=id_b,
            destination_account_id=id_a,
            amount=100000,
        )

        # Debe bloquear primero id_a y luego id_b
        self.assertEqual(self.session.lock_history, [id_a, id_b])

        # Caso 2: Origen id_a (menor), Destino id_b (mayor)
        self.session.lock_history.clear()
        await AccountService.transfer(
            session=self.session,  # type: ignore
            source_account_id=id_a,
            destination_account_id=id_b,
            amount=100000,
        )

        # Debe seguir bloqueando primero id_a y luego id_b
        self.assertEqual(self.session.lock_history, [id_a, id_b])

    async def test_transfer_insufficient_funds(self) -> None:
        """Verifica el rechazo si el saldo es menor al monto solicitado."""
        source_id = uuid.uuid4()
        dest_id = uuid.uuid4()

        source_acc = Account(id=source_id, balance=10000, currency="COP", status="ACTIVE")
        dest_acc = Account(id=dest_id, balance=0, currency="COP", status="ACTIVE")
        self.session.add(source_acc)
        self.session.add(dest_acc)

        with self.assertRaises(InsufficientFundsError) as ctx:
            await AccountService.transfer(
                session=self.session,  # type: ignore
                source_account_id=source_id,
                destination_account_id=dest_id,
                amount=50000,
            )

        self.assertEqual(ctx.exception.available, 10000)
        self.assertEqual(ctx.exception.required, 50000)

    async def test_transfer_self_account_rejected(self) -> None:
        """Verifica el rechazo de transferencias hacia la misma cuenta de origen."""
        same_id = uuid.uuid4()
        with self.assertRaises(SelfTransferError):
            await AccountService.transfer(
                session=self.session,  # type: ignore
                source_account_id=same_id,
                destination_account_id=same_id,
                amount=50000,
            )

    async def test_transfer_currency_mismatch_rejected(self) -> None:
        """Verifica el rechazo si las cuentas operan en divisas diferentes."""
        source_id = uuid.uuid4()
        dest_id = uuid.uuid4()

        source_acc = Account(id=source_id, balance=100000, currency="COP", status="ACTIVE")
        dest_acc = Account(id=dest_id, balance=0, currency="USD", status="ACTIVE")
        self.session.add(source_acc)
        self.session.add(dest_acc)

        with self.assertRaises(CurrencyMismatchError):
            await AccountService.transfer(
                session=self.session,  # type: ignore
                source_account_id=source_id,
                destination_account_id=dest_id,
                amount=50000,
            )

    async def test_get_balance_success(self) -> None:
        """Verifica la consulta de saldo en tiempo O(1)."""
        account = Account(id=uuid.uuid4(), balance=3500000, status="ACTIVE")
        self.session.add(account)

        bal = await AccountService.get_balance(session=self.session, account_id=account.id)  # type: ignore
        self.assertEqual(bal, 3500000)

    async def test_get_balance_account_not_found(self) -> None:
        """Verifica AccountNotFoundError si la cuenta a consultar no existe."""
        with self.assertRaises(AccountNotFoundError):
            await AccountService.get_balance(session=self.session, account_id=uuid.uuid4())  # type: ignore

    async def test_get_history_success(self) -> None:
        """Verifica la consulta de historial de asientos contables."""
        acc_id = uuid.uuid4()
        account = Account(id=acc_id, balance=3000, status="ACTIVE")
        self.session.add(account)

        entry1 = LedgerEntry(account_id=acc_id, amount=1000, balance_after=1000, entry_type="CREDIT")
        entry2 = LedgerEntry(account_id=acc_id, amount=2000, balance_after=3000, entry_type="CREDIT")
        self.session.add(entry1)
        self.session.add(entry2)

        history = await AccountService.get_history(session=self.session, account_id=acc_id)  # type: ignore
        self.assertEqual(len(history), 2)


if __name__ == "__main__":
    unittest.main()
