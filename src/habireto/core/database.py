"""Configuración del motor asíncrono y gestión de sesiones de base de datos.

Establece la conexión asíncrona hacia PostgreSQL mediante SQLAlchemy 2.0 y asyncpg,
definiendo convenciones estrictas de nombrado para índices y restricciones de integridad.
"""

from collections.abc import AsyncGenerator
from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from habireto.core.config import settings

# Convenciones de nomenclatura explícitas para restricciones e índices en PostgreSQL.
# Esto asegura nombres deterministas y predecibles para migraciones en Alembic y pruebas.
POSTGRES_NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

metadata = MetaData(naming_convention=POSTGRES_NAMING_CONVENTION)


class Base(DeclarativeBase):
    """Clase base declarativa para todos los modelos ORM de SQLAlchemy.

    Hereda la metadata compartida con las convenciones de nombrado para garantizar
    que las restricciones físicas (CHECK, UNIQUE, FOREIGN KEY) queden correctamente
    registradas a nivel de catálogo relacional.
    """

    metadata = metadata


# Motor asíncrono configurado con pool de conexiones pre-dimensionado para cargas concurrentes
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DATABASE_ECHO,
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
)

# Fábrica de sesiones asíncronas configurada con expire_on_commit=False para evitar
# recargas diferidas fuera del contexto de la transacción abierta.
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Generador de dependencias para proveer sesiones de base de datos asíncronas a FastAPI.

    Garantiza que cada petición HTTP disponga de un ciclo de vida transaccional aislado,
    cerrando la sesión adecuadamente al completar o fallar la operación.

    Yields:
        AsyncSession: Sesión activa de SQLAlchemy para interactuar con la base de datos.
    """
    async with AsyncSessionLocal() as session:
        yield session
