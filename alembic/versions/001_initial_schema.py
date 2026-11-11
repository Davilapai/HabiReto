"""Esquema relacional inicial con 7 tablas maestras e invariantes financieras.

Revision ID: 001_initial_schema
Revises: None
Create Date: 2026-11-11 00:15:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Identificadores de revisión utilizados por Alembic
revision: str = "001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Crea las 7 tablas maestras con sus restricciones físicas e índices en PostgreSQL."""
    # 1. Tabla: users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("phone_number", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.UniqueConstraint("phone_number", name="uq_users_phone_number"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_phone_number", "users", ["phone_number"], unique=True)

    # 2. Tabla: accounts
    op.create_table(
        "accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("account_number", sa.String(length=32), nullable=False),
        sa.Column("account_type", sa.String(length=20), server_default="USER", nullable=False),
        sa.Column("balance", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="COP", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="ACTIVE", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_accounts_user_id_users", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_accounts"),
        sa.UniqueConstraint("account_number", name="uq_accounts_account_number"),
        sa.CheckConstraint("balance >= 0", name="ck_accounts_balance_non_negative"),
    )
    op.create_index("ix_accounts_user_id", "accounts", ["user_id"])
    op.create_index("ix_accounts_account_number", "accounts", ["account_number"], unique=True)

    # 3. Tabla: cows
    op.create_table(
        "cows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("creator_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("vault_account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("target_amount", sa.BigInteger(), nullable=False),
        sa.Column("visibility_type", sa.String(length=20), server_default="PUBLIC", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="ACTIVE", nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["creator_id"], ["users.id"], name="fk_cows_creator_id_users", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["vault_account_id"], ["accounts.id"], name="fk_cows_vault_account_id_accounts", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_cows"),
        sa.UniqueConstraint("vault_account_id", name="uq_cows_vault_account_id"),
        sa.CheckConstraint("target_amount > 0", name="ck_cows_target_amount_positive"),
    )
    op.create_index("ix_cows_creator_id", "cows", ["creator_id"])

    # 4. Tabla: cow_members
    op.create_table(
        "cow_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("cow_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("total_contributed", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("role", sa.String(length=20), server_default="CONTRIBUTOR", nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["cow_id"], ["cows.id"], name="fk_cow_members_cow_id_cows", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_cow_members_user_id_users", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_cow_members"),
        sa.UniqueConstraint("cow_id", "user_id", name="uq_cow_members_cow_user"),
        sa.CheckConstraint("total_contributed >= 0", name="ck_cow_members_total_contributed_non_negative"),
    )
    op.create_index("ix_cow_members_cow_id", "cow_members", ["cow_id"])
    op.create_index("ix_cow_members_user_id", "cow_members", ["user_id"])

    # 5. Tabla: transactions
    op.create_table(
        "transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
        sa.Column("transaction_type", sa.String(length=30), nullable=False),
        sa.Column("source_account_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("destination_account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="COP", nullable=False),
        sa.Column("cow_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="SUCCESS", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["source_account_id"], ["accounts.id"], name="fk_transactions_source_account_id_accounts", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["destination_account_id"], ["accounts.id"], name="fk_transactions_destination_account_id_accounts", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["cow_id"], ["cows.id"], name="fk_transactions_cow_id_cows", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_transactions"),
        sa.UniqueConstraint("idempotency_key", name="uq_transactions_idempotency_key"),
        sa.CheckConstraint("amount > 0", name="ck_transactions_amount_positive"),
    )
    op.create_index("ix_transactions_idempotency_key", "transactions", ["idempotency_key"], unique=True)
    op.create_index("ix_transactions_source_account_id", "transactions", ["source_account_id"])
    op.create_index("ix_transactions_destination_account_id", "transactions", ["destination_account_id"])
    op.create_index("ix_transactions_cow_id", "transactions", ["cow_id"])

    # 6. Tabla: ledger_entries
    op.create_table(
        "ledger_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entry_type", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("balance_after", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], name="fk_ledger_entries_transaction_id_transactions", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], name="fk_ledger_entries_account_id_accounts", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_ledger_entries"),
        sa.CheckConstraint("amount > 0", name="ck_ledger_entries_amount_positive"),
        sa.CheckConstraint("balance_after >= 0", name="ck_ledger_entries_balance_after_non_negative"),
    )
    op.create_index("ix_ledger_entries_transaction_id", "ledger_entries", ["transaction_id"])
    op.create_index("ix_ledger_entries_account_id", "ledger_entries", ["account_id"])

    # 7. Tabla: idempotency_records
    op.create_table(
        "idempotency_records",
        sa.Column("key", sa.String(length=255), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_path", sa.String(length=255), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("response_status", sa.Integer(), nullable=False),
        sa.Column("response_body", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_idempotency_records_user_id_users", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("key", name="pk_idempotency_records"),
    )
    op.create_index("ix_idempotency_records_user_id", "idempotency_records", ["user_id"])
    op.create_index("ix_idempotency_records_expires_at", "idempotency_records", ["expires_at"])


def downgrade() -> None:
    """Elimina las tablas en orden inverso respetando las restricciones de integridad."""
    op.drop_table("idempotency_records")
    op.drop_table("ledger_entries")
    op.drop_table("transactions")
    op.drop_table("cow_members")
    op.drop_table("cows")
    op.drop_table("accounts")
    op.drop_table("users")
