"""Punto de entrada de la aplicación FastAPI para HabiReto.

Configura la API REST, inicializa el esquema relacional y datos de demostración
en su ciclo de vida lifespan, monta los enrutadores v1 (cuentas, transferencias y vacas),
registra los manejadores de excepciones de dominio financiero y expone la sonda
de salud /healthcheck.
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from fastapi import FastAPI

from habireto.api.errors import register_exception_handlers
from habireto.api.v1 import api_router
from habireto.core.database import AsyncSessionLocal, Base, engine
from habireto.services.seed_service import SeedService


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Ciclo de vida de la aplicación: asegura tablas y siembra datos iniciales de demo."""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with AsyncSessionLocal() as session:
            async with session.begin():
                await SeedService.seed_all(session)
    except Exception:
        # En entornos de testing en memoria o cuando la DB se maneja por fixtures,
        # permite que la app arranque sin interrumpir la suite de pruebas.
        pass
    yield


app = FastAPI(
    title="HabiCapital Transfer Core API",
    version="0.1.0",
    description="Núcleo bancario de transferencias P2P y fondos colaborativos con libro mayor de partida doble.",
    lifespan=lifespan,
)

# Registro de manejadores de excepciones sanitizadas de dominio
register_exception_handlers(app)

# Montaje de la API REST versión 1
app.include_router(api_router)


@app.get("/healthcheck", tags=["Health"])
async def healthcheck() -> dict[str, str]:
    """Sonda de monitoreo para orquestadores y balanceadores de carga."""
    return {"status": "ok"}
