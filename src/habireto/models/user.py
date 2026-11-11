"""Modelo relacional de usuarios e identidades del sistema.

Representa a los titulares de las cuentas en la plataforma de transferencias P2P
y administradores o miembros de fondos colaborativos ("Vacas").
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from habireto.core.database import Base

if TYPE_CHECKING:
    from habireto.models.account import Account
    from habireto.models.cow import Cow, CowMember
    from habireto.models.idempotency import IdempotencyRecord


class User(Base):
    """Entidad que representa un usuario registrado en la plataforma.

    Responsabilidades:
    - Identificar de manera unívoca a los participantes del sistema mediante UUIDv4.
    - Proporcionar datos de contacto verificables (correo electrónico y número móvil)
      para resolución de transferencias persona a persona sin requerir números de cuenta extensos.
    - Mantener las relaciones de propiedad con cuentas bancarias, iniciativas de Vacas
      y registros de idempotencia.
    """

    __tablename__ = "users"

    # Identificador único global (UUIDv4) para evitar la enumeración maliciosa de identidades
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Correo electrónico único con índice B-tree para autenticación y notificaciones
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )

    # Nombre completo o razón de la persona para despliegue en transacciones y extractos
    full_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # Número telefónico utilizado como alias principal de transferencia (modelo Nequi / Bre-B)
    phone_number: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
    )

    # Registro de auditoría temporal con zona horaria explícita
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

    # Relaciones relacionales del usuario
    accounts: Mapped[list["Account"]] = relationship(
        "Account",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    created_cows: Mapped[list["Cow"]] = relationship(
        "Cow",
        back_populates="creator",
    )
    cow_memberships: Mapped[list["CowMember"]] = relationship(
        "CowMember",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    idempotency_records: Mapped[list["IdempotencyRecord"]] = relationship(
        "IdempotencyRecord",
        back_populates="user",
        cascade="all, delete-orphan",
    )
