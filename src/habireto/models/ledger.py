"""Modelos relacionales del libro mayor contable y auditoría de transacciones.

Implementa un sistema de partida doble (Double-Entry Ledger) inmutable de tipo append-only.
Garantiza que ningún movimiento financiero sea modificado o eliminado una vez asentado.
"""

import enum
import uuid
from datetime import datetime
from typing import Any, TYPE_CHECKING
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from habireto.core.database import Base

if TYPE_CHECKING:
    from habireto.models.account import Account
    from habireto.models.cow import Cow


class TransactionType(str, enum.Enum):
    """Tipos de eventos transaccionales soportados por el motor contable.

    - TOP_UP: Recarga externa de saldo simulada (depósito hacia una cuenta de usuario).
    - TRANSFER: Transferencia directa persona a persona (P2P) entre cuentas del sistema.
    - COW_CONTRIBUTION: Aporte directo desde la cuenta de un usuario hacia la bóveda de una Vaca.
    - COW_DISBURSEMENT: Liquidación y desembolso de los fondos de la Vaca hacia el titular o destino.
    - COW_REFUND: Reembolso compensatorio desde la bóveda de la Vaca hacia el aportante original.
    """

    TOP_UP = "TOP_UP"
    TRANSFER = "TRANSFER"
    COW_CONTRIBUTION = "COW_CONTRIBUTION"
    COW_DISBURSEMENT = "COW_DISBURSEMENT"
    COW_REFUND = "COW_REFUND"


class TransactionStatus(str, enum.Enum):
    """Estado del resultado operativo de una transacción financiera."""

    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class EntryType(str, enum.Enum):
    """Lado contable del asiento en el sistema de partida doble.

    - DEBIT: Débito o cargo (disminución de saldo en la cuenta origen).
    - CREDIT: Crédito o abono (incremento de saldo en la cuenta destino).
    """

    DEBIT = "DEBIT"
    CREDIT = "CREDIT"


class Transaction(Base):
    """Registro maestro e inmutable de un evento de transferencia financiera.

    Responsabilidades:
    - Conservar el registro histórico inmutable del origen, destino, monto y contexto social.
    - Respaldar la idempotencia mediante la clave única `idempotency_key` provista por el cliente.
    - Agrupar los asientos de partida doble correspondientes (`ledger_entries`).
    - Almacenar metadatos contextuales en formato JSONB (ej. categoría, motivo, contexto social).
    """

    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint(
            "amount > 0",
            name="amount_positive",
        ),
    )

    # Identificador único universal de la transacción (UUIDv4)
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Clave de idempotencia única opcional enviada en la cabecera HTTP Idempotency-Key
    idempotency_key: Mapped[str | None] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=True,
    )

    # Clasificación del evento transaccional
    transaction_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    # Cuenta de origen del dinero (es NULL únicamente para recargas externas simuladas TOP_UP)
    source_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    # Cuenta receptora de los fondos
    destination_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Monto de la operación en centavos de COP (siempre estrictamente positivo)
    amount: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    # Divisa ISO-4217
    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="COP",
    )

    # Identificador opcional de la Vaca asociada cuando la transacción ocurre en dicho contexto
    cow_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cows.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Descripción o concepto legible de la transferencia provisto por el usuario
    description: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    # Información contextual estructurada (categoría, división de gastos, etiquetas sociales)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
    )

    # Estado final del procesamiento
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=TransactionStatus.SUCCESS.value,
    )

    # Marca temporal inmutable de ejecución
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relaciones relacionales
    source_account: Mapped["Account | None"] = relationship(
        "Account",
        foreign_keys=[source_account_id],
    )
    destination_account: Mapped["Account"] = relationship(
        "Account",
        foreign_keys=[destination_account_id],
    )
    cow: Mapped["Cow | None"] = relationship(
        "Cow",
        back_populates="transactions",
    )
    ledger_entries: Mapped[list["LedgerEntry"]] = relationship(
        "LedgerEntry",
        back_populates="transaction",
        cascade="all, delete-orphan",
    )


class LedgerEntry(Base):
    """Asiento individual del libro mayor contable (Double-Entry Journal Entry).

    Decisiones Técnicas Clave:
    1. Modelo de Partida Doble: Toda transferencia genera dos asientos atómicos e inmutables:
       un débito (DEBIT) en la cuenta origen y un crédito (CREDIT) en la cuenta destino.
    2. Saldo Resultante Instantáneo (`balance_after`):
       Almacenar el saldo posterior inmediatamente después de aplicar el asiento permite
       consultar extractos y auditar la historia de saldo de cualquier cuenta en latencia O(1),
       sin necesidad de recalcular sumas históricas completas desde el origen de los tiempos.
    3. Restricciones Físicas de Integridad:
       `CHECK (amount > 0)` y `CHECK (balance_after >= 0)` previenen corrupciones contables.
    """

    __tablename__ = "ledger_entries"
    __table_args__ = (
        CheckConstraint(
            "amount > 0",
            name="amount_positive",
        ),
        CheckConstraint(
            "balance_after >= 0",
            name="balance_after_non_negative",
        ),
    )

    # Identificador único inmutable del asiento (UUIDv4)
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Transacción maestra que originó el asiento
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Cuenta bancaria impactada por el asiento
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Lado contable del movimiento (DEBIT o CREDIT)
    entry_type: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )

    # Monto transferido en centavos COP
    amount: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    # Saldo exacto en el que quedó la cuenta inmediatamente después de este movimiento
    balance_after: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    # Fecha y hora exacta de registro del asiento
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relaciones relacionales
    transaction: Mapped["Transaction"] = relationship(
        "Transaction",
        back_populates="ledger_entries",
    )
    account: Mapped["Account"] = relationship(
        "Account",
        back_populates="ledger_entries",
    )
