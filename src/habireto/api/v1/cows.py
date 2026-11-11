"""Endpoints REST para la gestión de fondos colaborativos ("Vacas").

Expone las operaciones del ciclo de vida de las Vacas: creación, consulta con
serialización de privacidad en servidor (Zero-Trust Data Leaks), aportes atómicos,
liquidación por desembolso y cancelaciones con reembolsos compensatorios exactos.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from habireto.api.deps import get_current_user_id, get_db_session
from habireto.core.exceptions import CowNotFoundError
from habireto.schemas.cow import (
    CowContributeRequest,
    CowCreateRequest,
    CowDetailResponse,
)
from habireto.schemas.transfer import TransferResponse
from habireto.services.cow_service import CowService
from habireto.services.idempotency_service import IdempotencyService

router = APIRouter(prefix="/cows", tags=["Cows"])


@router.post(
    "",
    response_model=CowDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear fondo colaborativo (Vaca)",
    description="Crea una nueva Vaca con su cuenta bóveda custodia dedicada y vincula al creador.",
)
async def create_cow(
    payload: CowCreateRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> CowDetailResponse:
    """Crea una nueva iniciativa colaborativa con su bóveda custodia."""
    cow = await CowService.create_cow(
        session=session,
        creator_user_id=current_user_id,
        title=payload.title,
        description=payload.description,
        target_amount=payload.target_amount,
        visibility_type=payload.visibility_type,
        deadline=payload.deadline,
        invited_user_ids=payload.invited_user_ids,
    )

    # Carga completa para serialización
    full_cow = await CowService.get_cow_by_id(session, cow.id)
    if full_cow is None:
        full_cow = cow

    vault_balance = full_cow.vault_account.balance if full_cow.vault_account is not None else 0
    return CowDetailResponse.from_cow(
        cow=full_cow,
        requesting_user_id=current_user_id,
        collected_amount=vault_balance,
    )


@router.get(
    "/{cow_id}",
    response_model=CowDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Consultar detalle de una Vaca",
    description="Obtiene el estado de la Vaca aplicando serialización de privacidad estricta en servidor.",
)
async def get_cow_detail(
    cow_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> CowDetailResponse:
    """Consulta la Vaca resolviendo en servidor la visibilidad de los aportes individuales."""
    cow = await CowService.get_cow_by_id(session, cow_id)
    if cow is None:
        raise CowNotFoundError(f"Fondo colaborativo no encontrado: {cow_id}")

    vault_balance = cow.vault_account.balance if cow.vault_account is not None else 0
    return CowDetailResponse.from_cow(
        cow=cow,
        requesting_user_id=current_user_id,
        collected_amount=vault_balance,
    )


@router.get(
    "",
    response_model=list[CowDetailResponse],
    status_code=status.HTTP_200_OK,
    summary="Listar fondos colaborativos",
    description="Retorna las iniciativas registradas aplicando la política de privacidad a cada una.",
)
async def list_cows(
    status_filter: Annotated[
        str | None,
        Query(
            alias="status",
            description="Filtrar por estado (ACTIVE, COMPLETED, DISBURSED, CANCELLED)",
        ),
    ] = None,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> list[CowDetailResponse]:
    """Lista fondos colaborativos resolviendo la privacidad según el usuario autenticado.

    Aplica el filtro de visibilidad por membresía: solo se listan las iniciativas donde
    el usuario solicitante es el creador o un participante formalmente invitado.
    """
    cows = await CowService.list_cows(
        session,
        status=status_filter,
        participant_user_id=current_user_id,
    )
    responses: list[CowDetailResponse] = []
    for c in cows:
        vault_balance = c.vault_account.balance if c.vault_account is not None else 0
        responses.append(
            CowDetailResponse.from_cow(
                cow=c,
                requesting_user_id=current_user_id,
                collected_amount=vault_balance,
            )
        )
    return responses


@router.post(
    "/{cow_id}/contributions",
    response_model=TransferResponse,
    status_code=status.HTTP_200_OK,
    summary="Aportar a una Vaca",
    description="Debita fondos de la cuenta del usuario y acredita la cuenta bóveda de la Vaca.",
)
async def contribute_to_cow(
    cow_id: uuid.UUID,
    payload: CowContributeRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    idempotency_key: Annotated[
        str | None,
        Header(
            alias="Idempotency-Key",
            description="Clave de deduplicación Exactly-Once.",
        ),
    ] = None,
    session: AsyncSession = Depends(get_db_session),
) -> TransferResponse:
    """Ejecuta un aporte económico atómico a la cuenta custodia de la Vaca."""
    request_hash = ""
    if idempotency_key is not None:
        request_hash = IdempotencyService.compute_request_hash(payload.model_dump())
        is_dup, record = await IdempotencyService.check_or_start(
            session=session,
            key=idempotency_key,
            user_id=current_user_id,
            request_path=f"/api/v1/cows/{cow_id}/contributions",
            request_hash=request_hash,
        )
        if is_dup and record is not None:
            return TransferResponse.model_validate(record.response_body)

    tx = await CowService.contribute(
        session=session,
        cow_id=cow_id,
        contributor_user_id=current_user_id,
        amount=payload.amount,
        idempotency_key=idempotency_key,
    )

    response_data = TransferResponse.model_validate(tx)

    if idempotency_key is not None:
        await IdempotencyService.store_record(
            session=session,
            key=idempotency_key,
            user_id=current_user_id,
            request_path=f"/api/v1/cows/{cow_id}/contributions",
            request_hash=request_hash,
            response_status=status.HTTP_200_OK,
            response_body=response_data.model_dump(mode="json"),
        )

    return response_data


@router.post(
    "/{cow_id}/disburse",
    response_model=TransferResponse,
    status_code=status.HTTP_200_OK,
    summary="Desembolsar fondos recaudados",
    description="Transfiere el 100% de los fondos de la bóveda a la cuenta personal del creador titular.",
)
async def disburse_cow(
    cow_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> TransferResponse:
    """Liquida y transfiere los fondos de la Vaca al creador autorizado."""
    tx = await CowService.disburse(
        session=session,
        cow_id=cow_id,
        requesting_user_id=current_user_id,
    )
    return TransferResponse.model_validate(tx)


@router.post(
    "/{cow_id}/cancel",
    response_model=list[TransferResponse],
    status_code=status.HTTP_200_OK,
    summary="Cancelar fondo y reembolsar aportes",
    description="Cancela la Vaca y emite transferencias compensatorias exactas a cada participante.",
)
async def cancel_cow(
    cow_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db_session),
) -> list[TransferResponse]:
    """Cancela la Vaca y restituye exactamente los fondos a los miembros aportantes."""
    txs = await CowService.cancel_and_refund(
        session=session,
        cow_id=cow_id,
        requesting_user_id=current_user_id,
    )
    return [TransferResponse.model_validate(tx) for tx in txs]
