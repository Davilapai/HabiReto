"""Endpoints REST para la consulta y registro de usuarios en HabiReto.

Expone la consulta de usuarios registrados junto con su cuenta bancaria personal principal,
permitiendo la sincronización dinámica del selector de identidades, destinatarios de transferencias P2P
y participantes para fondos colaborativos ("Vacas").
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from habireto.api.deps import get_db_session
from habireto.models.account import AccountType
from habireto.models.user import User
from habireto.schemas.account import AccountCreateRequest
from habireto.schemas.user import UserResponse
from habireto.services.account_service import AccountService

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "",
    response_model=list[UserResponse],
    status_code=status.HTTP_200_OK,
    summary="Listar usuarios registrados",
    description="Retorna la lista de usuarios registrados en el sistema con los datos de su cuenta personal principal.",
)
async def list_users(
    session: AsyncSession = Depends(get_db_session),
) -> list[UserResponse]:
    """Recupera todos los usuarios registrados y asocia su cuenta bancaria personal."""
    stmt = (
        select(User)
        .options(selectinload(User.accounts))
        .order_by(User.created_at.asc())
    )
    users = list((await session.execute(stmt)).scalars().all())

    results: list[UserResponse] = []
    for u in users:
        primary_acc = next(
            (a for a in u.accounts if a.account_type in (AccountType.USER.value, AccountType.USER)),
            None,
        )
        results.append(
            UserResponse(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                phone_number=u.phone_number,
                account_id=primary_acc.id if primary_acc else None,
                account_number=primary_acc.account_number if primary_acc else None,
                balance=primary_acc.balance if primary_acc else None,
                created_at=u.created_at,
            )
        )
    return results


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar una nueva persona y su cuenta personal",
    description="Crea de forma atómica una nueva entidad User y su cuenta bancaria personal con saldo inicial opcional.",
)
async def create_user(
    payload: AccountCreateRequest,
    session: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    """Registra atómicamente a una persona y su cuenta personal."""
    user, account = await AccountService.create_user_with_account(
        session=session,
        email=payload.email,
        full_name=payload.full_name,
        phone_number=payload.phone_number,
        initial_balance=payload.initial_balance,
    )
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone_number=user.phone_number,
        account_id=account.id,
        account_number=account.account_number,
        balance=account.balance,
        created_at=user.created_at,
    )
