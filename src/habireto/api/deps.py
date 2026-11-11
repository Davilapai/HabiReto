"""Dependencias de inyección para la capa de presentación API (FastAPI).

Provee la extracción validada de identidad mock mediante la cabecera HTTP X-User-Id
y la gestión de sesiones de base de datos con ciclo de vida transaccional atómico
(BEGIN ... COMMIT / ROLLBACK).
"""

import uuid
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Header
from sqlalchemy.ext.asyncio import AsyncSession

from habireto.core.database import AsyncSessionLocal


def get_current_user_id(
    x_user_id: Annotated[
        uuid.UUID,
        Header(
            alias="X-User-Id",
            description="Identificador único del usuario autenticado (Mock Auth).",
        ),
    ],
) -> uuid.UUID:
    """Extrae y valida el identificador del usuario autenticado desde la cabecera X-User-Id.

    Implementa el esquema de identidad mock liviano para mantener el foco en la integridad
    financiera y la prevención de fraudes o fugas de información.

    Args:
        x_user_id: Identificador provisto en la cabecera HTTP X-User-Id.

    Returns:
        uuid.UUID: Identificador verificado del usuario en sesión.
    """
    return x_user_id


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Inyecta una sesión asíncrona de base de datos con gestión transaccional limpia.

    Abre un bloque de transacción limpia (BEGIN) para la petición HTTP en curso.
    - Si el procesamiento concluye sin errores, el context manager ejecuta COMMIT atómico.
    - Si se produce cualquier excepción o error de dominio, ejecuta ROLLBACK total,
      garantizando la integridad absoluta de los saldos e invariantes contables.

    Yields:
        AsyncSession: Sesión transaccional de SQLAlchemy lista para operaciones ACID.
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            yield session
