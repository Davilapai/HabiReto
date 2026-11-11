"""Esquemas Pydantic v2 para la gestión y privacidad de Vacas (Fondos Colaborativos).

Implementa los contratos de entrada y salida con aplicación estricta de la regla
de privacidad en servidor: en fondos anónimos, los aportes individuales de terceros
son completamente omitidos (None) del payload para prevenir fugas de información.
"""

import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from habireto.models.cow import Cow, CowMember, CowStatus, CowVisibilityType


class CowCreateRequest(BaseModel):
    """Cuerpo de petición para la creación de un nuevo fondo colaborativo."""

    title: str = Field(
        ...,
        min_length=1,
        max_length=120,
        description="Título descriptivo de la iniciativa o campaña.",
    )
    description: str | None = Field(
        default=None,
        description="Detalle o propósito social de la recaudación.",
    )
    target_amount: int = Field(
        ...,
        gt=0,
        description="Meta de recaudo en centavos COP (debe ser estrictamente > 0).",
    )
    visibility_type: CowVisibilityType = Field(
        default=CowVisibilityType.PUBLIC,
        description="Política de privacidad de los aportes (PUBLIC o ANONYMOUS).",
    )
    deadline: datetime | None = Field(
        default=None,
        description="Fecha límite opcional para alcanzar el objetivo.",
    )


class CowContributeRequest(BaseModel):
    """Cuerpo de petición para realizar un aporte económico a una Vaca."""

    amount: int = Field(
        ...,
        gt=0,
        description="Monto en centavos COP a transferir desde la cuenta personal a la bóveda.",
    )


class CowMemberView(BaseModel):
    """Vista de un participante dentro del detalle de una Vaca.

    En modo anónimo, amount_contributed es estrictamente None para todos los usuarios
    distintos al propio participante que consulta la información.
    """

    user_id: uuid.UUID = Field(..., description="Identificador único del participante.")
    full_name: str = Field(..., description="Nombre completo del miembro de la vaca.")
    role: str = Field(..., description="Rol operativo en el fondo (CREATOR o CONTRIBUTOR).")
    joined_at: datetime = Field(..., description="Fecha y hora de vinculación al fondo.")
    amount_contributed: int | None = Field(
        default=None,
        description="Monto aportado en centavos COP. Es None en modo anónimo para terceros.",
    )

    model_config = ConfigDict(from_attributes=True)


class CowDetailResponse(BaseModel):
    """Detalle consolidado de un fondo colaborativo con serialización de privacidad resuelta."""

    id: uuid.UUID = Field(..., description="Identificador único del fondo colaborativo.")
    title: str = Field(..., description="Título de la iniciativa.")
    description: str | None = Field(None, description="Descripción o motivo del recaudo.")
    target_amount: int = Field(..., description="Meta monetaria en centavos COP.")
    collected_amount: int = Field(
        ...,
        description="Monto total acumulado actualmente en la cuenta bóveda custodia.",
    )
    progress_percentage: float = Field(
        ...,
        description="Porcentaje de avance hacia la meta (0.0 a 100.0+).",
    )
    visibility_type: CowVisibilityType = Field(
        ...,
        description="Política de visibilidad configurada para el fondo.",
    )
    status: CowStatus = Field(..., description="Estado del ciclo de vida de la vaca.")
    deadline: datetime | None = Field(None, description="Fecha límite opcional de recaudación.")
    my_contribution: int = Field(
        default=0,
        description="Monto acumulado aportado por el usuario autenticado que consulta.",
    )
    members: list[CowMemberView] = Field(
        default_factory=list,
        description="Listado de miembros con visibilidad de aportes resuelta en servidor.",
    )
    created_at: datetime = Field(..., description="Fecha de creación de la vaca.")

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_cow(
        cls,
        cow: Cow,
        requesting_user_id: uuid.UUID,
        collected_amount: int,
    ) -> "CowDetailResponse":
        """Construye la respuesta aplicando serialización de privacidad estricta en servidor.

        Regla de Serialización de Privacidad:
        - Si la Vaca es PUBLIC: Todos los observadores ven los montos exactos de todos los miembros.
        - Si la Vaca es ANONYMOUS: Los montos individuales quedan ESTRICTAMENTE OCULTOS para todos
          (incluyendo de forma innegociable al creador de la vaca). Únicamente cada usuario
          puede ver cuánto puso él mismo a través de amount_contributed y my_contribution.

        Args:
            cow: Entidad ORM de la Vaca con sus miembros y relaciones cargadas.
            requesting_user_id: Identificador del usuario que realiza la petición HTTP.
            collected_amount: Saldo actual en centavos de la cuenta bóveda custodia.

        Returns:
            CowDetailResponse: Objeto serializado sanitizado sin fuga de datos privados.
        """
        my_contribution = 0
        for member in cow.members:
            if member.user_id == requesting_user_id:
                my_contribution = member.total_contributed
                break

        is_public = (
            cow.visibility_type == CowVisibilityType.PUBLIC.value
            or cow.visibility_type == CowVisibilityType.PUBLIC
        )

        members_view: list[CowMemberView] = []
        for member in cow.members:
            # Obtiene el nombre completo del usuario asociado a la membresía
            full_name = (
                member.user.full_name
                if member.user is not None
                else "Participante"
            )

            if is_public:
                # Modo Público: Todos ven los montos exactos
                monto: int | None = member.total_contributed
            else:
                # Modo Anónimo: ESTRICTAMENTE OCULTO PARA TODOS (incluyendo al creador)
                # Solo el propio usuario puede ver cuánto puso él mismo
                monto = (
                    member.total_contributed
                    if member.user_id == requesting_user_id
                    else None
                )

            members_view.append(
                CowMemberView(
                    user_id=member.user_id,
                    full_name=full_name,
                    role=member.role,
                    joined_at=member.joined_at,
                    amount_contributed=monto,
                )
            )

        progress = (
            round((collected_amount / cow.target_amount) * 100, 2)
            if cow.target_amount > 0
            else 0.0
        )

        vis_enum = (
            cow.visibility_type
            if isinstance(cow.visibility_type, CowVisibilityType)
            else CowVisibilityType(cow.visibility_type)
        )
        status_enum = (
            cow.status
            if isinstance(cow.status, CowStatus)
            else CowStatus(cow.status)
        )

        return cls(
            id=cow.id,
            title=cow.title,
            description=cow.description,
            target_amount=cow.target_amount,
            collected_amount=collected_amount,
            progress_percentage=progress,
            visibility_type=vis_enum,
            status=status_enum,
            deadline=cow.deadline,
            my_contribution=my_contribution,
            members=members_view,
            created_at=cow.created_at,
        )
