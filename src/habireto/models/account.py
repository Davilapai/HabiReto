"""Modelo relacional de cuentas financieras y bóvedas de fondos colaborativos.

Define la estructura de las cuentas contables, la representación monetaria
en centavos enteros y la restricción física innegociable contra saldos negativos.
"""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from habireto.core.database import Base

if TYPE_CHECKING:
    from habireto.models.cow import Cow
    from habireto.models.ledger import LedgerEntry
    from habireto.models.user import User


class AccountType(str, enum.Enum):
    """Tipos de cuentas operativas soportadas en el sistema.

    - USER: Cuenta corriente o de ahorros personal asignada a un usuario del sistema.
    - COW_VAULT: Bóveda contable dedicada asignada a un fondo colaborativo ("Vaca").
      Permite aislar contablemente los recursos recolectados sin mezclarlos con el saldo
      personal del creador antes del desembolso oficial.
    """

    USER = "USER"
    COW_VAULT = "COW_VAULT"


class AccountStatus(str, enum.Enum):
    """Estados operativos del ciclo de vida de una cuenta bancaria."""

    ACTIVE = "ACTIVE"
    BLOCKED = "BLOCKED"
    CLOSED = "CLOSED"


class Account(Base):
    """Cuenta financiera que custodia fondos y garantiza la conservación de saldo.

    Principios de Integridad Financiera implementados:
    1. Representación Monetaria Exacta: El saldo (`balance`) se almacena en enteros de 64 bits
       (`BIGINT`) representando centavos de peso colombiano (COP). Esto elimina de raíz cualquier
       error de redondeo o pérdida de precisión binaria intrínseca a tipos de coma flotante.
    2. Restricción Física contra Sobregiros: La base de datos impone la restricción física
       `CHECK (balance >= 0)`. Incluso ante una falla catastrófica de concurrencia en la capa
       de aplicación, PostgreSQL rechazará físicamente cualquier mutación que intente debitar
       más allá del saldo disponible.
    """

    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint(
            "balance >= 0",
            name="balance_non_negative",
        ),
    )

    # Identificador único inmutable de la cuenta (UUIDv4)
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Propietario de la cuenta. Es anulable (nullable=True) porque las cuentas bóveda
    # de las Vacas (`COW_VAULT`) o cuentas del sistema son administradas por entidades específicas.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    # Número de cuenta bancaria legible y público para depósitos o referencias
    account_number: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        index=True,
        nullable=False,
    )

    # Clasificación de la cuenta (personal o bóveda de fondo colaborativo)
    account_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=AccountType.USER.value,
    )

    # Saldo actual en centavos COP ($50.000 COP = 5000000 centavos)
    balance: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
    )

    # Divisa internacional bajo estándar ISO-4217 (por defecto COP)
    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="COP",
    )

    # Estado de operatividad (activa, bloqueada por fraude, o cerrada)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=AccountStatus.ACTIVE.value,
    )

    # Trazabilidad temporal de creación y última actualización
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relaciones ORM
    user: Mapped["User | None"] = relationship(
        "User",
        back_populates="accounts",
    )
    vault_cow: Mapped["Cow | None"] = relationship(
        "Cow",
        back_populates="vault_account",
        uselist=False,
    )
    ledger_entries: Mapped[list["LedgerEntry"]] = relationship(
        "LedgerEntry",
        back_populates="account",
    )
