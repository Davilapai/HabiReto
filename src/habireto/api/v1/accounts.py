"""Endpoints REST para la gestión de cuentas bancarias personales y libro mayor.

Expone las operaciones de creación de cuentas, recargas simuladas, consulta de saldos
y extractos históricos auditables, aplicando verificación estricta de autorización
en frontera mediante la cabecera X-User-Id.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from habireto.api.deps import get_current_user_id, get_db_session
from habireto.core.exceptions import AccountNotFoundError, UnauthorizedError
from habireto.schemas.account import (
    AccountCreateRequest,
    AccountResponse,
    BalanceResponse,
    LedgerEntryResponse,
    LoadBalanceRequest,
)
from habireto.services.account_service import AccountService
from habireto.services.idempotency_service import IdempotencyService

router = APIRouter(prefix="/accounts", tags=["Accounts"])


@router.post(
    "",
    response_model=AccountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear usuario y cuenta personal inicial",
    description="Registra un nuevo usuario en la plataforma y le asigna su cuenta corriente con saldo inicial.",
)
async def create_account(
    payload: AccountCreateRequest,
    session: AsyncSession = Depends(get_db_session),
) -> AccountResponse:
    """Crea atómicamente un nuevo usuario y su cuenta bancaria personal."""
    _, account = await AccountService.create_user_with_account(
        session=session,
        email=payload.email,
        full_name=payload.full_name,
        phone_number=payload.phone_number,
        initial_balance=payload.initial_balance,
    )
    return AccountResponse.model_validate(account)


@router.post(
    "/{account_id}/load",
    response_model=BalanceResponse,
    status_code=status.HTTP_200_OK,
    summary="Recarga simulada de saldo",
    description="Acredita fondos a una cuenta bancaria con soporte de idempotencia y validación de titularidad.",
)
async def load_balance(
    account_id: uuid.UUID,
    payload: LoadBalanceRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    idempotency_key: Annotated[
        str | None,
        Header(
            alias="Idempotency-Key",
            description="Clave para deduplicación idempotente Exactly-Once.",
        ),
    ] = None,
    session: AsyncSession = Depends(get_db_session),
) -> BalanceResponse:
    """Ejecuta una recarga simulada garantizando que el usuario autenticado sea el titular."""
    account = await AccountService.get_account_by_id(session, account_id)
    if account is None:
        raise AccountNotFoundError(f"Cuenta no encontrada: {account_id}")

    if account.user_id != current_user_id:
        raise UnauthorizedError("No está autorizado para recargar una cuenta ajena.")

    request_hash = ""
    if idempotency_key is not None:
        request_hash = IdempotencyService.compute_request_hash(payload.model_dump())
        is_dup, record = await IdempotencyService.check_or_start(
            session=session,
            key=idempotency_key,
            user_id=current_user_id,
            request_path=f"/api/v1/accounts/{account_id}/load",
            request_hash=request_hash,
        )
        if is_dup and record is not None:
            return BalanceResponse.model_validate(record.response_body)

    await AccountService.load_balance(
        session=session,
        account_id=account.id,
        amount=payload.amount,
        idempotency_key=idempotency_key,
        description=payload.description,
    )

    response_data = BalanceResponse(
        account_id=account.id,
        balance=account.balance,
        currency=account.currency,
    )

    if idempotency_key is not None:
        await IdempotencyService.store_record(
            session=session,
            key=idempotency_key,
            user_id=current_user_id,
            request_path=f"/api/v1/accounts/{account_id}/load",
            request_hash=request_hash,
            response_status=status.HTTP_200_OK,
            response_body=response_data.model_dump(mode="json"),
        )

    return response_data


@router.get(
    "/{account_id}/balance",
    response_model=BalanceResponse,
    status_code=status.HTTP_200_OK,
    summary="Consultar saldo disponible",
    description="Retorna el balance contable actual de la cuenta en latencia O(1).",
)
async def get_balance(
    account_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> BalanceResponse:
    """Consulta el saldo de la cuenta validando la autorización del titular."""
    account = await AccountService.get_account_by_id(session, account_id)
    if account is None:
        raise AccountNotFoundError(f"Cuenta no encontrada: {account_id}")

    if account.user_id != current_user_id:
        raise UnauthorizedError("No está autorizado para consultar el saldo de una cuenta ajena.")

    return BalanceResponse(
        account_id=account.id,
        balance=account.balance,
        currency=account.currency,
    )


@router.get(
    "/{account_id}/history",
    response_model=list[LedgerEntryResponse],
    status_code=status.HTTP_200_OK,
    summary="Consultar extractos del libro mayor",
    description="Recupera los asientos contables históricos con saldos resultantes balance_after.",
)
async def get_history(
    account_id: uuid.UUID,
    limit: Annotated[int, Query(ge=1, le=100, description="Cantidad de registros")] = 50,
    offset: Annotated[int, Query(ge=0, description="Paginación")] = 0,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> list[LedgerEntryResponse]:
    """Obtiene los movimientos contables auditables de la cuenta."""
    account = await AccountService.get_account_by_id(session, account_id)
    if account is None:
        raise AccountNotFoundError(f"Cuenta no encontrada: {account_id}")

    if account.user_id != current_user_id:
        raise UnauthorizedError("No está autorizado para consultar los extractos de una cuenta ajena.")

    entries = await AccountService.get_history(
        session=session,
        account_id=account.id,
        limit=limit,
        offset=offset,
    )
    return [LedgerEntryResponse.model_validate(e) for e in entries]
