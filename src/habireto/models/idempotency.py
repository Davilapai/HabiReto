"""Modelo relacional del almacén de idempotencia distribuida.

Garantiza la ejecución exacta de mutaciones financieras (Exactly-Once Semantics),
evitando cargos dobles o transferencias duplicadas provocadas por reintentos de red.
"""

import uuid
from datetime import datetime
from typing import Any, TYPE_CHECKING
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from habireto.core.database import Base

if TYPE_CHECKING:
    from habireto.models.user import User


class IdempotencyRecord(Base):
    """Registro persistente de peticiones financieras idempotentes.

    Decisiones Técnicas Clave:
    1. Prevención de Duplicación Financiera: Si un cliente experimenta un timeout de red
       tras enviar una transferencia o recarga y reintenta con la misma clave `Idempotency-Key`,
       el sistema no vuelve a impactar los saldos en el libro mayor. En su lugar, recupera
       la respuesta previa almacenada en `response_body` con su código HTTP original.
    2. Detección de Conflicto de Payload: Se almacena el hash SHA-256 de la petición original
       en `request_hash`. Si un cliente reutiliza la misma clave con un cuerpo de petición
       distinto (diferente monto o destino), la API rechaza la petición con un error HTTP 409
       (Conflict) protegiendo la integridad del sistema.
    """

    __tablename__ = "idempotency_records"

    # Clave de idempotencia única provista por el cliente (ej. UUIDv4 generado en el frontend)
    key: Mapped[str] = mapped_column(
        String(255),
        primary_key=True,
    )

    # Identidad autenticada del usuario que originó la petición
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Ruta del endpoint HTTP consumido (ej. /api/v1/transfers)
    request_path: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # Hash criptográfico SHA-256 del cuerpo de la petición serializado
    request_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    # Código de estado HTTP retornado originalmente (ej. 200, 201)
    response_status: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # Cuerpo de respuesta serializado en JSONB retornado en la primera ejecución
    response_body: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
    )

    # Marca temporal de creación del registro
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Fecha límite de expiración para limpieza periódica de registros obsoletos
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    # Relación con el usuario titular
    user: Mapped["User"] = relationship(
        "User",
        back_populates="idempotency_records",
    )
