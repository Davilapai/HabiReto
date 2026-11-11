"""Endpoint REST para transferencias atómicas persona a persona (P2P).

Ejecuta movimientos financieros entre cuentas aplicando autorización en frontera,
deduplicación Exactly-Once con Idempotency-Key y prevención determinista de deadlocks
mediante adquisición ordenada de bloqueos pesimistas en el libro mayor.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.ext.asyncio import AsyncSession

from habireto.api.deps import get_current_user_id, get_db_session
from habireto.core.exceptions import AccountNotFoundError, UnauthorizedError
from habireto.schemas.transfer import TransferRequest, TransferResponse
from habireto.services.account_service import AccountService
from habireto.services.idempotency_service import IdempotencyService

router = APIRouter(prefix="/transfers", tags=["Transfers"])


@router.post(
    "",
    response_model=TransferResponse,
    status_code=status.HTTP_200_OK,
    summary="Transferencia atómica P2P",
    description="Transfiere fondos entre dos cuentas con control anti-deadlock, partida doble e idempotencia.",
)
async def create_transfer(
    payload: TransferRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    idempotency_key: Annotated[
        str | None,
        Header(
            alias="Idempotency-Key",
            description="Clave única provista por el cliente para deduplicación Exactly-Once.",
        ),
    ] = None,
    session: AsyncSession = Depends(get_db_session),
) -> TransferResponse:
    """Ejecuta una transferencia entre cuentas asegurando la titularidad de origen."""
    # Autorización en frontera: Verifica que la cuenta origen pertenezca al usuario autenticado
    source_acc = await AccountService.get_account_by_id(session, payload.source_account_id)
    if source_acc is None:
        raise AccountNotFoundError(f"Cuenta de origen no encontrada: {payload.source_account_id}")

    if source_acc.user_id != current_user_id:
        raise UnauthorizedError("No está autorizado para transferir fondos desde una cuenta ajena.")

    request_hash = ""
    if idempotency_key is not None:
        request_hash = IdempotencyService.compute_request_hash(payload.model_dump())
        is_dup, record = await IdempotencyService.check_or_start(
            session=session,
            key=idempotency_key,
            user_id=current_user_id,
            request_path="/api/v1/transfers",
            request_hash=request_hash,
        )
        if is_dup and record is not None:
            return TransferResponse.model_validate(record.response_body)

    # Delegación al servicio transaccional con adquisición de locks en orden lexicográfico
    tx = await AccountService.transfer(
        session=session,
        source_account_id=payload.source_account_id,
        destination_account_id=payload.destination_account_id,
        amount=payload.amount,
        idempotency_key=idempotency_key,
        description=payload.description,
    )

    response_data = TransferResponse.model_validate(tx)

    if idempotency_key is not None:
        await IdempotencyService.store_record(
            session=session,
            key=idempotency_key,
            user_id=current_user_id,
            request_path="/api/v1/transfers",
            request_hash=request_hash,
            response_status=status.HTTP_200_OK,
            response_body=response_data.model_dump(mode="json"),
        )

    return response_data
