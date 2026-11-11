"""Módulo de enrutamiento API versión 1 (v1).

Agrupa los routers de cuentas bancarias, transferencias persona a persona
y fondos colaborativos bajo el prefijo unificado /api/v1.
"""

from fastapi import APIRouter

from habireto.api.v1.accounts import router as accounts_router
from habireto.api.v1.cows import router as cows_router
from habireto.api.v1.transfers import router as transfers_router
from habireto.api.v1.users import router as users_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(users_router)
api_router.include_router(accounts_router)
api_router.include_router(transfers_router)
api_router.include_router(cows_router)

__all__ = ["api_router"]
