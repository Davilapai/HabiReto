"""Servicio de gestión de fondos colaborativos ("Vacas").

Administra el ciclo de vida completo de las iniciativas colaborativas:
creación de la vaca con su cuenta bóveda custodia dedicada, recepción atómica de aportes,
transición automática al alcanzar la meta, liquidación total al creador
y cancelaciones con reembolsos compensatorios exactos.
"""

import uuid
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from habireto.core.exceptions import (
    AccountNotFoundError,
    CowDisbursementError,
    CowNotActiveError,
    CowNotFoundError,
    InsufficientFundsError,
    InvalidAmountError,
    UnauthorizedError,
    UserNotFoundError,
)
from habireto.models.account import Account, AccountStatus, AccountType
from habireto.models.cow import (
    Cow,
    CowMember,
    CowMemberRole,
    CowStatus,
    CowVisibilityType,
)
from habireto.models.ledger import (
    EntryType,
    LedgerEntry,
    Transaction,
    TransactionStatus,
    TransactionType,
)
from habireto.models.user import User
from habireto.services.account_service import generate_account_number


class CowService:
    """Servicio transaccional para la administración de Vacas y sus cuentas bóveda."""

    @staticmethod
    async def create_cow(
        session: AsyncSession,
        creator_user_id: uuid.UUID,
        title: str,
        description: str | None,
        target_amount: int,
        visibility_type: CowVisibilityType,
        deadline: datetime | None = None,
        invited_user_ids: list[uuid.UUID] | None = None,
    ) -> Cow:
        """Crea un nuevo fondo colaborativo ("Vaca") con su cuenta bóveda custodia dedicada.

        Arquitectura Contable:
        En lugar de mantener un saldo virtual en memoria, cada Vaca cuenta con una cuenta
        bancaria real de tipo COW_VAULT. Esto garantiza que todos los aportes sean transferencias
        contables estándar en el libro mayor de partida doble.

        Args:
            session: Sesión asíncrona de base de datos activa.
            creator_user_id: Identificador del usuario creador y administrador del fondo.
            title: Título descriptivo de la iniciativa de recaudo.
            description: Detalle o motivo social de la Vaca.
            target_amount: Meta monetaria en centavos COP (debe ser estrictamente > 0).
            visibility_type: Política de privacidad (PUBLIC o ANONYMOUS).
            deadline: Fecha límite opcional fijada para completar el objetivo.
            invited_user_ids: Lista opcional de identificadores de usuarios invitados a participar.

        Returns:
            Cow: Entidad de la Vaca creada y vinculada a su cuenta bóveda.

        Raises:
            InvalidAmountError: Si target_amount <= 0.
            UserNotFoundError: Si el creador no existe en el registro del sistema.
        """
        if target_amount <= 0:
            raise InvalidAmountError("La meta de recaudación de la vaca debe ser estrictamente positiva (> 0).")

        creator_stmt = select(User).where(User.id == creator_user_id)
        creator = (await session.execute(creator_stmt)).scalar_one_or_none()
        if creator is None:
            raise UserNotFoundError(f"Usuario creador no encontrado: {creator_user_id}")

        # Instancia la cuenta bóveda dedicada que custodiará los fondos del fondo
        vault_account = Account(
            user_id=None,
            account_number=generate_account_number("VAULT"),
            account_type=AccountType.COW_VAULT.value,
            balance=0,
            currency="COP",
            status=AccountStatus.ACTIVE.value,
        )
        session.add(vault_account)
        await session.flush()

        vis_str = (
            visibility_type.value
            if isinstance(visibility_type, CowVisibilityType)
            else str(visibility_type)
        )

        cow = Cow(
            creator_id=creator_user_id,
            vault_account_id=vault_account.id,
            title=title,
            description=description,
            target_amount=target_amount,
            visibility_type=vis_str,
            status=CowStatus.ACTIVE.value,
            deadline=deadline,
        )
        session.add(cow)
        await session.flush()

        creator_member = CowMember(
            cow_id=cow.id,
            user_id=creator_user_id,
            total_contributed=0,
            role=CowMemberRole.CREATOR.value,
        )
        session.add(creator_member)

        # Registra a los participantes invitados como miembros con rol CONTRIBUTOR
        if invited_user_ids:
            for invited_id in invited_user_ids:
                if invited_id != creator_user_id:
                    invited_member = CowMember(
                        cow_id=cow.id,
                        user_id=invited_id,
                        total_contributed=0,
                        role=CowMemberRole.CONTRIBUTOR.value,
                    )
                    session.add(invited_member)

        await session.flush()

        return cow

    @staticmethod
    async def contribute(
        session: AsyncSession,
        cow_id: uuid.UUID,
        contributor_user_id: uuid.UUID,
        amount: int,
        idempotency_key: str | None = None,
    ) -> Transaction:
        """Ejecuta un aporte monetario atómico desde la cuenta de un usuario hacia la bóveda de la Vaca.

        Concurrencia e Integridad:
        - Bloquea pesimistamente la fila de la Vaca para validar su estado ACTIVE.
        - Adquiere bloqueos ordenados lexicográficamente entre la cuenta personal del aportante
          y la cuenta bóveda (first_id < second_id) para evitar deadlocks con otras operaciones.
        - Asienta la transacción contable COW_CONTRIBUTION con débitos y créditos en el libro mayor.
        - Actualiza el aporte acumulado en cow_members.
        - Evalúa la regla de transición automática: si vault.balance >= target_amount,
          marca el estado de la Vaca como COMPLETED.

        Args:
            session: Sesión asíncrona de base de datos activa.
            cow_id: Identificador de la Vaca receptora del aporte.
            contributor_user_id: Identificador del usuario que realiza la contribución.
            amount: Monto en centavos COP a aportar (debe ser estrictamente > 0).
            idempotency_key: Clave opcional para prevenir aportes duplicados.

        Returns:
            Transaction: Registro de la transacción financiera confirmada.

        Raises:
            InvalidAmountError: Si amount <= 0.
            CowNotFoundError: Si la vaca no existe.
            CowNotActiveError: Si la vaca no se encuentra en estado ACTIVE.
            AccountNotFoundError: Si el usuario aportante no posee una cuenta personal activa.
            InsufficientFundsError: Si el saldo del aportante no cubre el monto.
        """
        if amount <= 0:
            raise InvalidAmountError("El monto a aportar debe ser estrictamente positivo (> 0).")

        if idempotency_key is not None:
            existing_tx_stmt = select(Transaction).where(
                Transaction.idempotency_key == idempotency_key
            )
            existing_tx = (await session.execute(existing_tx_stmt)).scalar_one_or_none()
            if existing_tx is not None:
                return existing_tx

        # Bloqueo exclusivo sobre la entidad Vaca para serializar transiciones de estado
        cow_stmt = select(Cow).where(Cow.id == cow_id).with_for_update()
        cow = (await session.execute(cow_stmt)).scalar_one_or_none()
        if cow is None:
            raise CowNotFoundError(f"Fondo colaborativo no encontrado: {cow_id}")

        if cow.status != CowStatus.ACTIVE.value:
            raise CowNotActiveError(
                f"La vaca '{cow.title}' no está activa para recibir aportes (estado: {cow.status})."
            )

        # Localiza la cuenta bancaria activa del usuario aportante
        contributor_acc_stmt = select(Account).where(
            Account.user_id == contributor_user_id,
            Account.account_type == AccountType.USER.value,
            Account.status == AccountStatus.ACTIVE.value,
        )
        contributor_acc = (await session.execute(contributor_acc_stmt)).scalars().first()
        if contributor_acc is None:
            raise AccountNotFoundError(
                f"No se encontró una cuenta activa para el usuario aportante {contributor_user_id}."
            )

        # Adquisición de bloqueos ordenados entre cuenta de usuario y cuenta bóveda
        first_id, second_id = (
            (contributor_acc.id, cow.vault_account_id)
            if contributor_acc.id < cow.vault_account_id
            else (cow.vault_account_id, contributor_acc.id)
        )

        first_acc_stmt = select(Account).where(Account.id == first_id).with_for_update()
        second_acc_stmt = select(Account).where(Account.id == second_id).with_for_update()

        first_acc = (await session.execute(first_acc_stmt)).scalar_one()
        second_acc = (await session.execute(second_acc_stmt)).scalar_one()

        contributor_locked = first_acc if first_acc.id == contributor_acc.id else second_acc
        vault_locked = second_acc if second_acc.id == cow.vault_account_id else first_acc

        if contributor_locked.balance < amount:
            raise InsufficientFundsError(
                available=contributor_locked.balance,
                required=amount,
                account_id=contributor_locked.id,
            )

        # Transferencia atómica de fondos hacia la bóveda
        contributor_locked.balance -= amount
        vault_locked.balance += amount

        tx = Transaction(
            idempotency_key=idempotency_key,
            transaction_type=TransactionType.COW_CONTRIBUTION.value,
            source_account_id=contributor_locked.id,
            destination_account_id=vault_locked.id,
            amount=amount,
            currency=contributor_locked.currency,
            cow_id=cow.id,
            description=f"Aporte a vaca: {cow.title}",
            metadata_json={
                "contributor_user_id": str(contributor_user_id),
                "cow_id": str(cow.id),
            },
            status=TransactionStatus.SUCCESS.value,
        )
        session.add(tx)
        await session.flush()

        debit_entry = LedgerEntry(
            transaction_id=tx.id,
            account_id=contributor_locked.id,
            entry_type=EntryType.DEBIT.value,
            amount=amount,
            balance_after=contributor_locked.balance,
        )
        credit_entry = LedgerEntry(
            transaction_id=tx.id,
            account_id=vault_locked.id,
            entry_type=EntryType.CREDIT.value,
            amount=amount,
            balance_after=vault_locked.balance,
        )
        session.add_all([debit_entry, credit_entry])
        await session.flush()

        # Registro o actualización de membresía en cow_members
        member_stmt = (
            select(CowMember)
            .where(
                CowMember.cow_id == cow.id,
                CowMember.user_id == contributor_user_id,
            )
            .with_for_update()
        )
        member = (await session.execute(member_stmt)).scalar_one_or_none()

        if member is not None:
            member.total_contributed += amount
        else:
            member = CowMember(
                cow_id=cow.id,
                user_id=contributor_user_id,
                total_contributed=amount,
                role=CowMemberRole.CONTRIBUTOR.value,
            )
            session.add(member)

        # Regla de Negocio: Transición automática si se alcanza la meta de recaudación
        if vault_locked.balance >= cow.target_amount:
            cow.status = CowStatus.COMPLETED.value

        await session.flush()
        return tx

    @staticmethod
    async def disburse(
        session: AsyncSession,
        cow_id: uuid.UUID,
        requesting_user_id: uuid.UUID,
    ) -> Transaction:
        """Liquida los fondos recaudados en la bóveda transfiriéndolos al 100% a la cuenta del creador.

        Reglas de Negocio y Seguridad:
        - Solo el creador original de la iniciativa puede solicitar el desembolso.
        - La vaca debe estar en estado ACTIVE o COMPLETED y disponer de fondos (> 0).
        - La cuenta bóveda queda con saldo exactamente en cero (0).
        - Transiciona el estado de la Vaca a DISBURSED.

        Args:
            session: Sesión asíncrona de base de datos activa.
            cow_id: Identificador de la Vaca a desembolsar.
            requesting_user_id: Identificador del usuario que solicita la liquidación.

        Returns:
            Transaction: Registro contable del desembolso ejecutado.

        Raises:
            CowNotFoundError: Si la vaca no existe.
            UnauthorizedError: Si el usuario solicitante no es el creador de la vaca.
            CowDisbursementError: Si el estado no permite liquidar o el saldo es 0.
            AccountNotFoundError: Si el creador no posee una cuenta personal activa.
        """
        cow_stmt = select(Cow).where(Cow.id == cow_id).with_for_update()
        cow = (await session.execute(cow_stmt)).scalar_one_or_none()
        if cow is None:
            raise CowNotFoundError(f"Fondo colaborativo no encontrado: {cow_id}")

        if cow.creator_id != requesting_user_id:
            raise UnauthorizedError("Solo el creador de la vaca puede liquidar y desembolsar los fondos recaudados.")

        if cow.status not in (CowStatus.COMPLETED.value, CowStatus.ACTIVE.value):
            raise CowDisbursementError(
                f"No es posible desembolsar una vaca en estado '{cow.status}'."
            )

        creator_acc_stmt = select(Account).where(
            Account.user_id == requesting_user_id,
            Account.account_type == AccountType.USER.value,
            Account.status == AccountStatus.ACTIVE.value,
        )
        creator_acc = (await session.execute(creator_acc_stmt)).scalars().first()
        if creator_acc is None:
            raise AccountNotFoundError(
                f"No se encontró una cuenta activa para el creador titular {requesting_user_id}."
            )

        # Adquisición ordenada de locks entre la cuenta bóveda y la cuenta del creador
        first_id, second_id = (
            (cow.vault_account_id, creator_acc.id)
            if cow.vault_account_id < creator_acc.id
            else (creator_acc.id, cow.vault_account_id)
        )

        first_acc_stmt = select(Account).where(Account.id == first_id).with_for_update()
        second_acc_stmt = select(Account).where(Account.id == second_id).with_for_update()

        first_acc = (await session.execute(first_acc_stmt)).scalar_one()
        second_acc = (await session.execute(second_acc_stmt)).scalar_one()

        vault_locked = first_acc if first_acc.id == cow.vault_account_id else second_acc
        creator_locked = second_acc if second_acc.id == creator_acc.id else first_acc

        if vault_locked.balance <= 0:
            raise CowDisbursementError("La bóveda de la vaca no dispone de fondos para desembolsar (saldo actual: 0).")

        disburse_amount = vault_locked.balance
        vault_locked.balance = 0
        creator_locked.balance += disburse_amount

        tx = Transaction(
            transaction_type=TransactionType.COW_DISBURSEMENT.value,
            source_account_id=vault_locked.id,
            destination_account_id=creator_locked.id,
            amount=disburse_amount,
            currency=vault_locked.currency,
            cow_id=cow.id,
            description=f"Desembolso total de fondos de la vaca: {cow.title}",
            metadata_json={
                "disbursed_amount": disburse_amount,
                "target_amount": cow.target_amount,
                "creator_id": str(requesting_user_id),
            },
            status=TransactionStatus.SUCCESS.value,
        )
        session.add(tx)
        await session.flush()

        debit_entry = LedgerEntry(
            transaction_id=tx.id,
            account_id=vault_locked.id,
            entry_type=EntryType.DEBIT.value,
            amount=disburse_amount,
            balance_after=0,
        )
        credit_entry = LedgerEntry(
            transaction_id=tx.id,
            account_id=creator_locked.id,
            entry_type=EntryType.CREDIT.value,
            amount=disburse_amount,
            balance_after=creator_locked.balance,
        )
        session.add_all([debit_entry, credit_entry])

        cow.status = CowStatus.DISBURSED.value
        await session.flush()

        return tx

    @staticmethod
    async def cancel_and_refund(
        session: AsyncSession,
        cow_id: uuid.UUID,
        requesting_user_id: uuid.UUID,
    ) -> list[Transaction]:
        """Cancela la Vaca y ejecuta transferencias compensatorias exactas a cada aportante.

        Conservación de la Masa Monetaria:
        - Cada usuario que haya aportado recibe exactamente el monto acumulado en su cuenta personal.
        - Se generan transacciones individuales de tipo COW_REFUND con sus respectivos asientos
          de débito en la bóveda y crédito en el participante.
        - El saldo de la bóveda drena exactamente a cero (0 centavos).
        - Transiciona el estado de la Vaca a CANCELLED.

        Args:
            session: Sesión asíncrona de base de datos activa.
            cow_id: Identificador de la Vaca a cancelar.
            requesting_user_id: Identificador del usuario que solicita la cancelación.

        Returns:
            list[Transaction]: Lista de transacciones compensatorias emitidas a los participantes.

        Raises:
            CowNotFoundError: Si la vaca no existe.
            UnauthorizedError: Si el usuario solicitante no es el creador de la vaca.
            CowDisbursementError: Si la vaca ya fue desembolsada o ya está cancelada.
            AccountNotFoundError: Si no se encuentra la cuenta de algún miembro a reembolsar.
        """
        cow_stmt = select(Cow).where(Cow.id == cow_id).with_for_update()
        cow = (await session.execute(cow_stmt)).scalar_one_or_none()
        if cow is None:
            raise CowNotFoundError(f"Fondo colaborativo no encontrado: {cow_id}")

        if cow.creator_id != requesting_user_id:
            raise UnauthorizedError("Solo el creador puede cancelar la iniciativa colaborativa.")

        if cow.status == CowStatus.DISBURSED.value:
            raise CowDisbursementError(
                "No es posible cancelar una vaca cuyos fondos ya fueron desembolsados oficialmente."
            )

        if cow.status == CowStatus.CANCELLED.value:
            raise CowDisbursementError("La vaca ya se encuentra cancelada.")

        vault_stmt = select(Account).where(Account.id == cow.vault_account_id).with_for_update()
        vault_acc = (await session.execute(vault_stmt)).scalar_one()

        members_stmt = (
            select(CowMember)
            .where(
                CowMember.cow_id == cow.id,
                CowMember.total_contributed > 0,
            )
            .order_by(CowMember.user_id)
            .with_for_update()
        )
        members = list((await session.execute(members_stmt)).scalars().all())

        refund_txs: list[Transaction] = []

        for member in members:
            refund_amount = member.total_contributed
            if refund_amount <= 0:
                continue

            member_acc_stmt = (
                select(Account)
                .where(
                    Account.user_id == member.user_id,
                    Account.account_type == AccountType.USER.value,
                    Account.status == AccountStatus.ACTIVE.value,
                )
                .with_for_update()
            )
            member_acc = (await session.execute(member_acc_stmt)).scalars().first()
            if member_acc is None:
                raise AccountNotFoundError(
                    f"No se encontró una cuenta activa para procesar el reembolso al usuario {member.user_id}."
                )

            vault_acc.balance -= refund_amount
            member_acc.balance += refund_amount
            member.total_contributed = 0

            tx = Transaction(
                transaction_type=TransactionType.COW_REFUND.value,
                source_account_id=vault_acc.id,
                destination_account_id=member_acc.id,
                amount=refund_amount,
                currency=vault_acc.currency,
                cow_id=cow.id,
                description=f"Reembolso por cancelación de vaca: {cow.title}",
                metadata_json={
                    "user_id": str(member.user_id),
                    "refunded_amount": refund_amount,
                },
                status=TransactionStatus.SUCCESS.value,
            )
            session.add(tx)
            await session.flush()

            debit_entry = LedgerEntry(
                transaction_id=tx.id,
                account_id=vault_acc.id,
                entry_type=EntryType.DEBIT.value,
                amount=refund_amount,
                balance_after=vault_acc.balance,
            )
            credit_entry = LedgerEntry(
                transaction_id=tx.id,
                account_id=member_acc.id,
                entry_type=EntryType.CREDIT.value,
                amount=refund_amount,
                balance_after=member_acc.balance,
            )
            session.add_all([debit_entry, credit_entry])
            refund_txs.append(tx)

        cow.status = CowStatus.CANCELLED.value
        await session.flush()

        return refund_txs

    @staticmethod
    async def get_cow_by_id(session: AsyncSession, cow_id: uuid.UUID) -> Cow | None:
        """Obtiene una Vaca con carga ansiosa de sus miembros, usuarios y cuenta bóveda.

        Utiliza selectinload para precargar las relaciones y evitar excepciones
        MissingGreenlet al serializar los datos en entornos asíncronos.

        Args:
            session: Sesión asíncrona de base de datos activa.
            cow_id: Identificador único de la Vaca.

        Returns:
            Cow | None: Entidad de la Vaca cargada o None si no existe.
        """
        stmt = (
            select(Cow)
            .where(Cow.id == cow_id)
            .options(
                selectinload(Cow.members).selectinload(CowMember.user),
                selectinload(Cow.vault_account),
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def list_cows(
        session: AsyncSession,
        status: str | None = None,
        participant_user_id: uuid.UUID | None = None,
    ) -> list[Cow]:
        """Recupera el listado de fondos colaborativos con carga ansiosa de relaciones.

        Args:
            session: Sesión asíncrona de base de datos activa.
            status: Filtro opcional por estado operativo (ej. ACTIVE, COMPLETED).
            participant_user_id: Identificador opcional para restringir la consulta
                exclusivamente a las vacas en las que el usuario es creador o miembro invitado.

        Returns:
            list[Cow]: Lista de Vacas ordenadas por fecha de creación descendente.
        """
        stmt = (
            select(Cow)
            .options(
                selectinload(Cow.members).selectinload(CowMember.user),
                selectinload(Cow.vault_account),
            )
            .order_by(Cow.created_at.desc())
        )
        if status is not None:
            stmt = stmt.where(Cow.status == status)
        if participant_user_id is not None:
            stmt = stmt.where(Cow.members.any(CowMember.user_id == participant_user_id))
        return list((await session.execute(stmt)).scalars().all())
