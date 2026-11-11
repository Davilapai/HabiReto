"""Configuración del entorno de migraciones de Alembic en modo asíncrono.

Conecta hacia PostgreSQL usando asyncpg y la configuración centralizada de la aplicación,
leyendo la metadata compartida del ORM desde habireto.core.database.Base.metadata.
"""

import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from habireto.core.config import settings
from habireto.core.database import Base
import habireto.models  # Asegura el registro de todas las 7 entidades maestras

# Objeto de configuración de Alembic que lee los valores de alembic.ini
config = context.config

# Interpreta el archivo de configuración para el registro de logs
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Inyecta la URL de base de datos desde los settings de la aplicación
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Metadata compartida para soporte de autogeneración e inspección de esquema
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Ejecuta las migraciones en modo 'offline'.

    Configura el contexto únicamente con una URL y no con un Engine activo,
    emitiendo las sentencias SQL directamente a la salida estándar sin conexión en vivo.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Aplica las migraciones sobre una conexión síncrona dentro del wrapper asíncrono."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Establece la conexión asíncrona mediante asyncpg y ejecuta las migraciones."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Punto de entrada para la ejecución de migraciones en modo 'online'."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
