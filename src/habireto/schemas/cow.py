"""Esquemas Pydantic v2 para la gestión y privacidad de Vacas (Fondos Colaborativos).

Implementa los contratos de entrada y salida con aplicación estricta de las dos políticas
de visibilidad en servidor (Zero-Trust Data Leaks):
- Vaca Pública (PUBLIC): El creador ve a todos los invitados (incluso con $0); los invitados
  solo ven a los participantes que ya han realizado aportes (> $0) con nombre y monto.
- Vaca Privada (ANONYMOUS): Solo el creador conoce la lista de personas invitadas (con montos
  de terceros ocultos en None); el resto de participantes no ve la lista de invitados y todos
  observan cómo se llena la vaca mediante aportes individuales anónimos.
"""

import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from habireto.models.cow import Cow, CowMemberRole, CowStatus, CowVisibilityType
from habireto.models.ledger import TransactionStatus, TransactionType


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
    invited_user_ids: list[uuid.UUID] = Field(
        default_factory=list,
        description="Lista de identificadores de usuarios invitados formalmente a participar.",
    )
    invited_keys: list[str] = Field(
        default_factory=list,
        description="Lista de llaves únicas estilo Bre-B (@ABC123) de usuarios invitados a participar.",
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

    En modo anónimo, solo se expone la lista de invitados al creador y con
    amount_contributed en None para terceros.
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


class CowContributionView(BaseModel):
    """Vista de un evento individual de aporte realizado a la bóveda de una Vaca.

    En vacas privadas (ANONYMOUS), contributor_name es estrictamente None para que la
    interfaz muestre mensajes anónimos del tipo 'Alguien ha aportado $60.000' sin revelar
    la identidad del aportante.
    """

    id: uuid.UUID = Field(..., description="Identificador único de la transacción de aporte.")
    amount: int = Field(..., description="Monto del aporte individual en centavos COP.")
    contributor_name: str | None = Field(
        default=None,
        description="Nombre del aportante en vacas públicas; None en vacas privadas.",
    )
    created_at: datetime = Field(..., description="Fecha y hora en que se efectuó el aporte.")

    model_config = ConfigDict(from_attributes=True)


class CowDetailResponse(BaseModel):
    """Detalle consolidado de un fondo colaborativo con serialización de privacidad resuelta."""

    id: uuid.UUID = Field(..., description="Identificador único del fondo colaborativo.")
    creator_id: uuid.UUID = Field(..., description="Identificador del usuario creador de la vaca.")
    creator_name: str = Field(
        default="Organizador",
        description="Nombre del usuario creador de la vaca.",
    )
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
        description="Listado de miembros filtrado según el rol del solicitante y la privacidad.",
    )
    contributions: list[CowContributionView] = Field(
        default_factory=list,
        description="Historial de aportes individuales realizados a la vaca.",
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

        Reglas de Serialización por Caso:
        1. Vaca Pública (PUBLIC):
           - Si consulta el Creador: recibe todos los miembros invitados (incluso con $0) y sus montos.
           - Si consulta un Invitado: recibe únicamente los miembros que ya han aportado (> $0) con nombre y monto.
        2. Vaca Privada (ANONYMOUS):
           - Si consulta el Creador: recibe la lista de personas invitadas, pero con amount_contributed = None
             para terceros (sabe a quién invitó, pero no cuánto puso cada quien).
           - Si consulta un Invitado: members se devuelve vacío ([]) para no revelar quiénes más fueron invitados.
           - Para todos: contributions expone cada aporte individual con contributor_name = None.

        Args:
            cow: Entidad ORM de la Vaca con sus miembros y relaciones cargadas.
            requesting_user_id: Identificador del usuario que realiza la petición HTTP.
            collected_amount: Saldo actual en centavos de la cuenta bóveda custodia.

        Returns:
            CowDetailResponse: Objeto serializado sanitizado sin fuga de datos privados.
        """
        my_contribution = 0
        creator_name = "Organizador"
        member_names_by_user_id: dict[str, str] = {}

        for member in cow.members:
            full_name = (
                member.user.full_name
                if member.user is not None
                else "Participante"
            )
            member_names_by_user_id[str(member.user_id)] = full_name
            if member.role == CowMemberRole.CREATOR.value or member.user_id == cow.creator_id:
                creator_name = full_name
            if member.user_id == requesting_user_id:
                my_contribution = member.total_contributed

        is_public = (
            cow.visibility_type == CowVisibilityType.PUBLIC.value
            or cow.visibility_type == CowVisibilityType.PUBLIC
        )
        is_creator = requesting_user_id == cow.creator_id

        members_view: list[CowMemberView] = []
        for member in cow.members:
            full_name = (
                member.user.full_name
                if member.user is not None
                else "Participante"
            )

            if is_public:
                # En vacas públicas, el creador ve a todos los invitados;
                # los invitados solo ven a quienes ya han aportado (> 0).
                if not is_creator and member.total_contributed <= 0:
                    continue
                monto: int | None = member.total_contributed
            else:
                # En vacas privadas, solo el creador conoce la lista de personas invitadas.
                if not is_creator:
                    continue
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

        # Construcción del listado cronológico de aportes individuales (COW_CONTRIBUTION)
        raw_txs = getattr(cow, "transactions", None) or []
        contrib_txs = [
            tx
            for tx in raw_txs
            if tx.transaction_type == TransactionType.COW_CONTRIBUTION.value
            and tx.status == TransactionStatus.SUCCESS.value
        ]
        contrib_txs.sort(key=lambda t: t.created_at, reverse=True)

        contributions_view: list[CowContributionView] = []
        for tx in contrib_txs:
            contributor_name: str | None = None
            if is_public:
                meta = tx.metadata_json or {}
                uid = str(meta.get("contributor_user_id", ""))
                contributor_name = member_names_by_user_id.get(uid, "Participante")

            contributions_view.append(
                CowContributionView(
                    id=tx.id,
                    amount=tx.amount,
                    contributor_name=contributor_name,
                    created_at=tx.created_at,
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
            creator_id=cow.creator_id,
            creator_name=creator_name,
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
            contributions=contributions_view,
            created_at=cow.created_at,
        )
