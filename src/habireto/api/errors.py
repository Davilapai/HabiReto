"""Mapeo y sanitización centralizada de excepciones de dominio financiero en FastAPI.

Traduce las excepciones de lógica de negocio y restricciones relacionales a códigos
de estado HTTP semánticos (400, 403, 404, 409, 422) garantizando que no se filtren
trazas de depuración, consultas SQL ni estructuras de base de datos al cliente.
"""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from habireto.core.exceptions import (
    AccountNotActiveError,
    AccountNotFoundError,
    CowDisbursementError,
    CowNotActiveError,
    CowNotFoundError,
    CurrencyMismatchError,
    FinancialDomainError,
    IdempotencyConflictError,
    InsufficientFundsError,
    InvalidAmountError,
    SelfTransferError,
    UnauthorizedError,
    UserNotFoundError,
)


def register_exception_handlers(app: FastAPI) -> None:
    """Registra los manejadores globales para capturar excepciones del dominio bancario."""

    @app.exception_handler(AccountNotFoundError)
    @app.exception_handler(CowNotFoundError)
    @app.exception_handler(UserNotFoundError)
    async def not_found_handler(request: Request, exc: FinancialDomainError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "detail": str(exc),
                "error_type": exc.__class__.__name__,
            },
        )

    @app.exception_handler(UnauthorizedError)
    async def unauthorized_handler(request: Request, exc: UnauthorizedError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "detail": str(exc),
                "error_type": exc.__class__.__name__,
            },
        )

    @app.exception_handler(IdempotencyConflictError)
    async def idempotency_conflict_handler(request: Request, exc: IdempotencyConflictError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": str(exc),
                "error_type": exc.__class__.__name__,
            },
        )

    @app.exception_handler(InsufficientFundsError)
    @app.exception_handler(InvalidAmountError)
    async def unprocessable_entity_handler(request: Request, exc: FinancialDomainError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "detail": str(exc),
                "error_type": exc.__class__.__name__,
            },
        )

    @app.exception_handler(SelfTransferError)
    @app.exception_handler(CurrencyMismatchError)
    @app.exception_handler(AccountNotActiveError)
    @app.exception_handler(CowNotActiveError)
    @app.exception_handler(CowDisbursementError)
    async def bad_request_handler(request: Request, exc: FinancialDomainError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "detail": str(exc),
                "error_type": exc.__class__.__name__,
            },
        )

    @app.exception_handler(FinancialDomainError)
    async def generic_financial_error_handler(request: Request, exc: FinancialDomainError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "detail": str(exc),
                "error_type": exc.__class__.__name__,
            },
        )
