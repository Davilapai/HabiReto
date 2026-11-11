"""Pruebas unitarias de integridad de esquemas relacionales y restricciones financieras.

Valida que el catálogo de metadatos de SQLAlchemy contenga todas las entidades
del negocio financiero, las restricciones físicas de PostgreSQL (CHECK, UNIQUE, FK)
y la generación correcta de DDL con tipado UUID nativo y enteros de 64 bits.
"""

import unittest
import uuid
from sqlalchemy import CheckConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from habireto.core.database import Base
from habireto.models import (
    Account,
    AccountStatus,
    AccountType,
    Cow,
    CowMember,
    CowMemberRole,
    CowStatus,
    CowVisibilityType,
    EntryType,
    IdempotencyRecord,
    LedgerEntry,
    Transaction,
    TransactionStatus,
    TransactionType,
    User,
)


class TestDatabaseSchema(unittest.TestCase):
    """Conjunto de validaciones para el esquema de datos e invariantes financieras."""

    def test_all_expected_tables_are_registered(self) -> None:
        """Verifica que las 7 tablas maestras estén registradas en Base.metadata."""
        expected_tables = {
            "users",
            "accounts",
            "cows",
            "cow_members",
            "transactions",
            "ledger_entries",
            "idempotency_records",
        }
        actual_tables = set(Base.metadata.tables.keys())
        self.assertTrue(
            expected_tables.issubset(actual_tables),
            f"Faltan tablas requeridas en la metadata del ORM: {expected_tables - actual_tables}",
        )

    def test_account_check_constraints(self) -> None:
        """Valida que la restricción física de saldo no negativo exista en la tabla accounts."""
        account_table = Base.metadata.tables["accounts"]
        ck_names = [ck.name for ck in account_table.constraints if hasattr(ck, "name")]
        self.assertIn("ck_accounts_balance_non_negative", ck_names)

        ck = next(
            c
            for c in account_table.constraints
            if isinstance(c, CheckConstraint)
            and getattr(c, "name", None) == "ck_accounts_balance_non_negative"
        )
        self.assertIn("balance >= 0", str(ck.sqltext))

    def test_cow_target_amount_check_constraint(self) -> None:
        """Valida que la meta de recaudación de una Vaca sea estrictamente positiva (> 0)."""
        cow_table = Base.metadata.tables["cows"]
        ck_names = [ck.name for ck in cow_table.constraints if hasattr(ck, "name")]
        self.assertIn("ck_cows_target_amount_positive", ck_names)

        ck = next(
            c
            for c in cow_table.constraints
            if isinstance(c, CheckConstraint)
            and getattr(c, "name", None) == "ck_cows_target_amount_positive"
        )
        self.assertIn("target_amount > 0", str(ck.sqltext))

    def test_cow_member_unique_and_check_constraints(self) -> None:
        """Valida la unicidad de membresía (cow_id, user_id) y aporte acumulado no negativo."""
        members_table = Base.metadata.tables["cow_members"]
        uq_names = [
            uq.name
            for uq in members_table.constraints
            if hasattr(uq, "name") and isinstance(uq.name, str)
        ]
        self.assertTrue(
            any(name.startswith("uq_cow_members") for name in uq_names),
            f"Falta la restricción de unicidad para miembros de vaca en: {uq_names}",
        )

        ck = next(
            c
            for c in members_table.constraints
            if isinstance(c, CheckConstraint)
            and getattr(c, "name", None)
            == "ck_cow_members_total_contributed_non_negative"
        )
        self.assertIn("total_contributed >= 0", str(ck.sqltext))

    def test_transaction_and_ledger_entry_constraints(self) -> None:
        """Valida montos estrictamente positivos y saldo posterior no negativo en el libro mayor."""
        tx_table = Base.metadata.tables["transactions"]
        tx_ck = next(
            c
            for c in tx_table.constraints
            if isinstance(c, CheckConstraint)
            and getattr(c, "name", None) == "ck_transactions_amount_positive"
        )
        self.assertIn("amount > 0", str(tx_ck.sqltext))

        ledger_table = Base.metadata.tables["ledger_entries"]
        amt_ck = next(
            c
            for c in ledger_table.constraints
            if isinstance(c, CheckConstraint)
            and getattr(c, "name", None) == "ck_ledger_entries_amount_positive"
        )
        self.assertIn("amount > 0", str(amt_ck.sqltext))

        bal_ck = next(
            c
            for c in ledger_table.constraints
            if isinstance(c, CheckConstraint)
            and getattr(c, "name", None)
            == "ck_ledger_entries_balance_after_non_negative"
        )
        self.assertIn("balance_after >= 0", str(bal_ck.sqltext))

    def test_postgresql_ddl_compilation(self) -> None:
        """Verifica que el DDL compilado para el dialecto PostgreSQL sea sintácticamente válido."""
        dialect = postgresql.dialect()
        for table_name, table in Base.metadata.tables.items():
            ddl_stmt = str(CreateTable(table).compile(dialect=dialect))
            self.assertIn(f"CREATE TABLE {table_name}", ddl_stmt)
            if "id" in table.c:
                self.assertIn("UUID", ddl_stmt)

    def test_model_instantiation(self) -> None:
        """Verifica la instanciación e inicialización en memoria de las entidades del modelo."""
        user_id = uuid.uuid4()
        user = User(
            id=user_id,
            email="test@habicapital.com",
            full_name="Usuario Prueba",
            phone_number="+573001234567",
        )
        self.assertEqual(user.email, "test@habicapital.com")

        vault_account_id = uuid.uuid4()
        vault_account = Account(
            id=vault_account_id,
            account_number="ACC-VAULT-001",
            account_type=AccountType.COW_VAULT.value,
            balance=0,
            currency="COP",
            status=AccountStatus.ACTIVE.value,
        )
        self.assertEqual(vault_account.account_type, AccountType.COW_VAULT.value)

        cow_id = uuid.uuid4()
        cow_public = Cow(
            id=cow_id,
            creator_id=user_id,
            vault_account_id=vault_account_id,
            title="Arriendo Roommates Diciembre",
            target_amount=150000000,  # $1.500.000 COP en centavos
            visibility_type=CowVisibilityType.PUBLIC.value,
            status=CowStatus.ACTIVE.value,
        )
        self.assertEqual(cow_public.visibility_type, "PUBLIC")

        cow_anon = Cow(
            id=uuid.uuid4(),
            creator_id=user_id,
            vault_account_id=uuid.uuid4(),
            title="Regalo Sorpresa Mamá",
            target_amount=50000000,  # $500.000 COP en centavos
            visibility_type=CowVisibilityType.ANONYMOUS.value,
            status=CowStatus.ACTIVE.value,
        )
        self.assertEqual(cow_anon.visibility_type, "ANONYMOUS")

        member = CowMember(
            cow_id=cow_id,
            user_id=user_id,
            total_contributed=50000000,
            role=CowMemberRole.CREATOR.value,
        )
        self.assertEqual(member.total_contributed, 50000000)

        tx = Transaction(
            transaction_type=TransactionType.COW_CONTRIBUTION.value,
            destination_account_id=vault_account_id,
            amount=50000000,
            currency="COP",
            cow_id=cow_id,
            metadata_json={"note": "Aporte arriendo"},
            status=TransactionStatus.SUCCESS.value,
        )
        self.assertEqual(tx.amount, 50000000)

        ledger_debit = LedgerEntry(
            transaction_id=tx.id,
            account_id=uuid.uuid4(),
            entry_type=EntryType.DEBIT.value,
            amount=50000000,
            balance_after=100000000,
        )
        self.assertEqual(ledger_debit.entry_type, "DEBIT")


if __name__ == "__main__":
    unittest.main()
