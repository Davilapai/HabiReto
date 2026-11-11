"""Modelos relacionales del producto diferenciador: Vacas (Fondos Colaborativos).

Implementa la estructura de datos para fondos transitorios con metas de recaudación,
las reglas de visibilidad (Abierta vs Anónima) y el registro de participantes.
"""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from habireto.core.database import Base

if TYPE_CHECKING:
    from habireto.models.account import Account
    from habireto.models.ledger import Transaction
    from habireto.models.user import User


class CowVisibilityType(str, enum.Enum):
    """Políticas de visibilidad y privacidad para los aportes de una Vaca.

    - PUBLIC (Vaca Abierta / Pública):
      Todos los miembros ven el listado completo de participantes con su nombre
      y el monto exacto aportado por cada uno. Ideal para gastos compartidos
      auditables como arriendos, cuentas de restaurantes o servicios compartidos.

    - ANONYMOUS (Vaca Privada / Anónima):
      Todos los miembros (incluyendo estrictamente al Creador de la vaca) ven únicamente
      la barra de progreso global (monto total acumulado / meta) y la lista de nombres
      de quienes se han unido. Los valores individuales aportados permanecen completamente
      ocultos para terceros; únicamente cada usuario puede consultar su propio aporte personal.
      Esta decisión elimina de raíz la presión social y el sesgo en regalos sorpresa o colectas.
    """

    PUBLIC = "PUBLIC"
    ANONYMOUS = "ANONYMOUS"


class CowStatus(str, enum.Enum):
    """Estados del ciclo de vida de una Vaca.

    - ACTIVE: Vaca abierta recibiendo aportes atómicos de los participantes.
    - COMPLETED: Meta de recaudación alcanzada o cerrada por el administrador para desembolso.
    - DISBURSED: Fondos transferidos atómicamente desde la cuenta bóveda al titular o destino final.
    - CANCELLED: Fondo cancelado; los saldos son devueltos mediante transferencias compensatorias.
    """

    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    DISBURSED = "DISBURSED"
    CANCELLED = "CANCELLED"


class CowMemberRole(str, enum.Enum):
    """Roles operativos de los participantes dentro de una Vaca."""

    CREATOR = "CREATOR"
    CONTRIBUTOR = "CONTRIBUTOR"


class Cow(Base):
    """Fondo colaborativo transitorio administrado por un titular para una meta colectiva.

    Decisiones Técnicas Clave:
    1. Aislamiento Contable mediante Bóveda Propia:
       Cada Vaca creada tiene asociada una cuenta bancaria única (`vault_account_id`), de tipo
       `COW_VAULT`. Al aportar, el dinero sale de la cuenta del usuario y entra a la bóveda.
       Esto garantiza el principio de conservación de saldo en el ledger contable y evita
       fondos virtuales o estimaciones en memoria.
    2. Meta Estrictamente Positiva:
       Se impone la restricción física `CHECK (target_amount > 0)` para rechazar metas inválidas.
    """

    __tablename__ = "cows"
    __table_args__ = (
        CheckConstraint(
            "target_amount > 0",
            name="target_amount_positive",
        ),
    )

    # Identificador único de la Vaca (UUIDv4)
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Usuario titular y responsable administrativo del fondo
    creator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Cuenta bancaria exclusiva de custodia de los fondos de esta Vaca (relación 1:1)
    vault_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        unique=True,
        nullable=False,
    )

    # Título descriptivo de la iniciativa (ej. "Regalo sorpresa cumpleaños de Laura")
    title: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
    )

    # Explicación o detalle contextual del propósito de la recaudación
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Monto objetivo a recaudar expresado en centavos de COP
    target_amount: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    # Política de privacidad que gobierna la visualización de los aportes individuales
    visibility_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=CowVisibilityType.PUBLIC.value,
    )

    # Estado del fondo en su ciclo de vida
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=CowStatus.ACTIVE.value,
    )

    # Fecha límite opcional fijada por el administrador para completar la recaudación
    deadline: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Marcas de tiempo de auditoría
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

    # Relaciones relacionales
    creator: Mapped["User"] = relationship(
        "User",
        back_populates="created_cows",
    )
    vault_account: Mapped["Account"] = relationship(
        "Account",
        back_populates="vault_cow",
    )
    members: Mapped[list["CowMember"]] = relationship(
        "CowMember",
        back_populates="cow",
        cascade="all, delete-orphan",
    )
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction",
        back_populates="cow",
    )


class CowMember(Base):
    """Membresía y consolidado de aportes de un participante en una Vaca.

    Permite consultar en tiempo constante O(1) si un usuario ya forma parte de una Vaca
    y el total histórico que ha aportado a la iniciativa, sin requerir agregaciones
    pesadas sobre la tabla de movimientos contables para la vista de usuario.
    """

    __tablename__ = "cow_members"
    __table_args__ = (
        CheckConstraint(
            "total_contributed >= 0",
            name="total_contributed_non_negative",
        ),
        UniqueConstraint(
            "cow_id",
            "user_id",
            name="uq_cow_members_cow_user",
        ),
    )

    # Identificador único de la membresía (UUIDv4)
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Vaca a la que pertenece la membresía (eliminación en cascada si se borra el fondo)
    cow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cows.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Usuario que participa en la Vaca
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Monto acumulado total aportado por este miembro específico (en centavos COP)
    total_contributed: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
    )

    # Rol del participante en la vaca (CREATOR o CONTRIBUTOR)
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=CowMemberRole.CONTRIBUTOR.value,
    )

    # Fecha y hora en la que el miembro se unió a la iniciativa
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relaciones relacionales
    cow: Mapped["Cow"] = relationship(
        "Cow",
        back_populates="members",
    )
    user: Mapped["User"] = relationship(
        "User",
        back_populates="cow_memberships",
    )
