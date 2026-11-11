"""Punto de entrada de la aplicación FastAPI para HabiReto.

Configura la API REST, monta los enrutadores v1 (cuentas, transferencias y vacas),
registra los manejadores de excepciones de dominio financiero y expone la sonda
de salud /healthcheck.
"""

from fastapi import FastAPI

from habireto.api.errors import register_exception_handlers
from habireto.api.v1 import api_router

app = FastAPI(
    title="HabiCapital Transfer Core API",
    version="0.1.0",
    description="Núcleo bancario de transferencias P2P y fondos colaborativos con libro mayor de partida doble.",
)

# Registro de manejadores de excepciones sanitizadas de dominio
register_exception_handlers(app)

# Montaje de la API REST versión 1
app.include_router(api_router)


@app.get("/healthcheck", tags=["Health"])
async def healthcheck() -> dict[str, str]:
    """Sonda de monitoreo para orquestadores y balanceadores de carga."""
    return {"status": "ok"}
