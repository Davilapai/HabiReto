"""Script de línea de comandos para sembrar los datos de demostración en la base de datos.

Ejecución:
    python -m habireto.scripts.seed_demo
"""

import asyncio
import logging
from habireto.core.database import AsyncSessionLocal, engine, Base
from habireto.services.seed_service import SeedService

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


async def main() -> None:
    """Ejecuta la creación de tablas si no existen y el sembrado determinista."""
    logger.info("Iniciando verificación de esquema relacional...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("Sembrando identidades y vacas de demostración...")
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await SeedService.seed_all(session)

    logger.info("Sembrado de datos de demostración completado exitosamente.")


if __name__ == "__main__":
    asyncio.run(main())
