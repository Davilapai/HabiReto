"""Servicio de gestión de cuentas bancarias y transferencias P2P.

Implementa las operaciones financieras del núcleo bancario personal:
creación atómica de usuarios y cuentas, recargas simuladas, transferencias
persona a persona con prevención matemática de deadlocks y consulta de saldos e historial.
"""

import uuid
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from habireto.core.exceptions import (
    AccountNotActiveError,
    AccountNotFoundError,
    CurrencyMismatchError,
    InsufficientFundsError,
    InvalidAmountError,
    SelfTransferError,
)
from habireto.models.account import Account, AccountStatus, AccountType
from habireto.models.ledger import (
    EntryType,
    LedgerEntry,
    Transaction,
    TransactionStatus,
    TransactionType,
)
from habireto.models.user import User
from habireto.schemas.user import compute_user_key


def generate_account_number(prefix: str = "ACC") -> str:
    """Genera un número de cuenta bancaria unívoco y legible.

    Utiliza una sección de entropía de UUIDv4 en mayúsculas para evitar
    colisiones manteniendo un identificador contable legible.

    Args:
        prefix: Prefijo del tipo de cuenta (ej. ACC para usuario, VAULT para bóveda).

    Returns:
        str: Cadena identificadora formateada (ej. 'ACC-7A3B9F2E1D').
    """
    token = uuid.uuid4().hex[:10].upper()
    return f"{prefix}-{token}"


class AccountService:
    """Servicio transaccional para la administración de cuentas y movimientos P2P."""

    @staticmethod
    async def create_user_with_account(
        session: AsyncSession,
        email: str,
        full_name: str,
        phone_number: str,
        initial_balance: int = 0,
    ) -> tuple[User, Account]:
        """Crea atómicamente un nuevo usuario y su cuenta bancaria personal inicial.

        Si se especifica un saldo inicial positivo, la recarga se procesa mediante
        la creación formal de un asiento contable de tipo TOP_UP y un crédito en el
        libro mayor, garantizando la conservación de la partida doble desde la apertura.

        Args:
            session: Sesión asíncrona de base de datos activa.
            email: Correo electrónico único del usuario.
            full_name: Nombre completo o razón social del titular.
            phone_number: Número de teléfono celular único para resolución P2P.
            initial_balance: Saldo inicial en centavos COP (por defecto 0).

        Returns:
            tuple[User, Account]: Tupla con la entidad User y la entidad Account creadas.

        Raises:
            InvalidAmountError: Si initial_balance es estrictamente negativo (< 0).
        """
        if initial_balance < 0:
            raise InvalidAmountError("El saldo inicial de la cuenta no puede ser negativo.")

        user = User(
            email=email,
            full_name=full_name,
            phone_number=phone_number,
        )
        session.add(user)
        await session.flush()

        account = Account(
            user_id=user.id,
            account_number=generate_account_number("ACC"),
            account_type=AccountType.USER.value,
            balance=0,
            currency="COP",
            status=AccountStatus.ACTIVE.value,
        )
        session.add(account)
        await session.flush()

        if initial_balance > 0:
            await AccountService.load_balance(
                session=session,
                account_id=account.id,
                amount=initial_balance,
                description="Depósito de apertura de cuenta",
            )

        return user, account

    @staticmethod
    async def load_balance(
        session: AsyncSession,
        account_id: uuid.UUID,
        amount: int,
        idempotency_key: str | None = None,
        description: str | None = None,
    ) -> Transaction:
        """Acredita fondos a una cuenta bancaria mediante una recarga simulada (TOP_UP).

        Bloquea pesimistamente la fila de la cuenta con SELECT ... FOR UPDATE,
        incrementa el saldo y asienta un registro maestro de transacción y un asiento
        de crédito en el libro mayor contable con el saldo resultante (balance_after).

        Args:
            session: Sesión asíncrona de base de datos activa.
            account_id: Identificador de la cuenta receptora de los fondos.
            amount: Monto en centavos COP a recargar (debe ser estrictamente > 0).
            idempotency_key: Clave opcional para prevenir recargas duplicadas.
            description: Concepto descriptivo opcional de la operación.

        Returns:
            Transaction: Registro inmutable de la transacción confirmada.

        Raises:
            InvalidAmountError: Si amount <= 0.
            AccountNotFoundError: Si la cuenta no existe.
            AccountNotActiveError: Si la cuenta está bloqueada o cerrada.
        """
        if amount <= 0:
            raise InvalidAmountError("El monto a recargar debe ser estrictamente positivo (> 0).")

        if idempotency_key is not None:
            existing_tx_stmt = select(Transaction).where(
                Transaction.idempotency_key == idempotency_key
            )
            existing_tx = (await session.execute(existing_tx_stmt)).scalar_one_or_none()
            if existing_tx is not None:
                return existing_tx

        stmt = select(Account).where(Account.id == account_id).with_for_update()
        account = (await session.execute(stmt)).scalar_one_or_none()
        if account is None:
            raise AccountNotFoundError(f"Cuenta no encontrada: {account_id}")

        if account.status != AccountStatus.ACTIVE.value:
            raise AccountNotActiveError(
                f"La cuenta {account_id} no está activa (estado actual: {account.status})."
            )

        account.balance += amount

        tx = Transaction(
            idempotency_key=idempotency_key,
            transaction_type=TransactionType.TOP_UP.value,
            source_account_id=None,
            destination_account_id=account.id,
            amount=amount,
            currency=account.currency,
            description=description or "Recarga de saldo simulada",
            metadata_json={"operation": "load_balance"},
            status=TransactionStatus.SUCCESS.value,
        )
        session.add(tx)
        await session.flush()

        credit_entry = LedgerEntry(
            transaction_id=tx.id,
            account_id=account.id,
            entry_type=EntryType.CREDIT.value,
            amount=amount,
            balance_after=account.balance,
        )
        session.add(credit_entry)
        await session.flush()

        return tx

    @staticmethod
    async def transfer(
        session: AsyncSession,
        source_account_id: uuid.UUID,
        destination_account_id: uuid.UUID,
        amount: int,
        idempotency_key: str | None = None,
        description: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Transaction:
        """Ejecuta una transferencia atómica P2P entre dos cuentas bancarias.

        Algoritmo Anti-Deadlock:
        Para evitar interbloqueos circulares ante transferencias bidireccionales concurrentes,
        los bloqueos pesimistas (SELECT ... FOR UPDATE) se adquieren siempre en estricto
        orden lexicográfico de identificadores (first_id < second_id).

        Principios Financieros:
        - Valida fondos disponibles antes de debitar (balance >= amount).
        - Genera exactamente 1 registro maestro en transactions y 2 asientos simétricos
          en ledger_entries (DEBIT en origen y CREDIT en destino) conservando la masa monetaria.

        Args:
            session: Sesión asíncrona de base de datos activa.
            source_account_id: Identificador de la cuenta origen que envía el dinero.
            destination_account_id: Identificador de la cuenta destino que recibe el dinero.
            amount: Monto en centavos COP a transferir (debe ser estrictamente > 0).
            idempotency_key: Clave opcional provista por el cliente para semántica Exactly-Once.
            description: Motivo o concepto de la transferencia.
            metadata: Contexto adicional en formato diccionario para auditoría.

        Returns:
            Transaction: Registro inmutable de la transferencia realizada.

        Raises:
            InvalidAmountError: Si amount <= 0.
            SelfTransferError: Si la cuenta origen y destino son idénticas.
            AccountNotFoundError: Si alguna de las cuentas no existe.
            AccountNotActiveError: Si alguna de las cuentas no se encuentra activa.
            CurrencyMismatchError: Si las divisas de las cuentas no coinciden.
            InsufficientFundsError: Si la cuenta origen no tiene saldo suficiente.
        """
        if amount <= 0:
            raise InvalidAmountError("El monto a transferir debe ser estrictamente positivo (> 0).")

        if source_account_id == destination_account_id:
            raise SelfTransferError("No es posible transferir fondos hacia la misma cuenta de origen.")

        if idempotency_key is not None:
            existing_tx_stmt = select(Transaction).where(
                Transaction.idempotency_key == idempotency_key
            )
            existing_tx = (await session.execute(existing_tx_stmt)).scalar_one_or_none()
            if existing_tx is not None:
                return existing_tx

        # Adquisición de bloqueos pesimistas en orden determinista lexicográfico
        first_id, second_id = (
            (source_account_id, destination_account_id)
            if source_account_id < destination_account_id
            else (destination_account_id, source_account_id)
        )

        first_acc_stmt = select(Account).where(Account.id == first_id).with_for_update()
        second_acc_stmt = select(Account).where(Account.id == second_id).with_for_update()

        first_acc = (await session.execute(first_acc_stmt)).scalar_one_or_none()
        second_acc = (await session.execute(second_acc_stmt)).scalar_one_or_none()

        if first_acc is None or second_acc is None:
            missing_id = first_id if first_acc is None else second_id
            raise AccountNotFoundError(f"Cuenta bancaria no encontrada: {missing_id}")

        source_acc = first_acc if first_acc.id == source_account_id else second_acc
        dest_acc = second_acc if second_acc.id == destination_account_id else first_acc

        if source_acc.status != AccountStatus.ACTIVE.value:
            raise AccountNotActiveError(
                f"La cuenta origen {source_account_id} no está activa (estado: {source_acc.status})."
            )

        if dest_acc.status != AccountStatus.ACTIVE.value:
            raise AccountNotActiveError(
                f"La cuenta destino {destination_account_id} no está activa (estado: {dest_acc.status})."
            )

        if source_acc.currency != dest_acc.currency:
            raise CurrencyMismatchError(
                f"Discrepancia de divisas: {source_acc.currency} != {dest_acc.currency}."
            )

        if source_acc.balance < amount:
            raise InsufficientFundsError(
                available=source_acc.balance,
                required=amount,
                account_id=source_acc.id,
            )

        # Mutación de saldos en memoria dentro de la transacción protegida
        source_acc.balance -= amount
        dest_acc.balance += amount

        tx = Transaction(
            idempotency_key=idempotency_key,
            transaction_type=TransactionType.TRANSFER.value,
            source_account_id=source_acc.id,
            destination_account_id=dest_acc.id,
            amount=amount,
            currency=source_acc.currency,
            description=description,
            metadata_json=metadata or {},
            status=TransactionStatus.SUCCESS.value,
        )
        session.add(tx)
        await session.flush()

        debit_entry = LedgerEntry(
            transaction_id=tx.id,
            account_id=source_acc.id,
            entry_type=EntryType.DEBIT.value,
            amount=amount,
            balance_after=source_acc.balance,
        )
        credit_entry = LedgerEntry(
            transaction_id=tx.id,
            account_id=dest_acc.id,
            entry_type=EntryType.CREDIT.value,
            amount=amount,
            balance_after=dest_acc.balance,
        )
        session.add_all([debit_entry, credit_entry])
        await session.flush()

        return tx

    @staticmethod
    async def get_account_by_id(
        session: AsyncSession,
        account_id: uuid.UUID,
    ) -> Account | None:
        """Obtiene la entidad de una cuenta bancaria por su identificador único.

        Args:
            session: Sesión asíncrona de base de datos activa.
            account_id: Identificador de la cuenta a localizar.

        Returns:
            Account | None: Entidad de la cuenta encontrada o None si no existe.
        """
        stmt = select(Account).where(Account.id == account_id)
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def get_balance(
        session: AsyncSession,
        account_id: uuid.UUID,
    ) -> int:
        """Obtiene el saldo disponible actual de una cuenta en tiempo O(1).

        Args:
            session: Sesión asíncrona de base de datos activa.
            account_id: Identificador de la cuenta a consultar.

        Returns:
            int: Saldo actual expresado en centavos COP.

        Raises:
            AccountNotFoundError: Si la cuenta no existe.
        """
        stmt = select(Account.balance).where(Account.id == account_id)
        balance = (await session.execute(stmt)).scalar_one_or_none()
        if balance is None:
            raise AccountNotFoundError(f"Cuenta no encontrada: {account_id}")
        return balance

    @staticmethod
    async def get_history(
        session: AsyncSession,
        account_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[LedgerEntry]:
        """Recupera los extractos contables históricos de una cuenta ordenados cronológicamente.

        Args:
            session: Sesión asíncrona de base de datos activa.
            account_id: Identificador de la cuenta a auditar.
            limit: Número máximo de registros a retornar (por defecto 50).
            offset: Número de registros a omitir para paginación (por defecto 0).

        Returns:
            list[LedgerEntry]: Lista de asientos contables ordenados de más reciente a más antiguo.

        Raises:
            AccountNotFoundError: Si la cuenta no existe.
        """
        acc_exists_stmt = select(Account.id).where(Account.id == account_id)
        acc_exists = (await session.execute(acc_exists_stmt)).scalar_one_or_none()
        if acc_exists is None:
            raise AccountNotFoundError(f"Cuenta no encontrada: {account_id}")

        stmt = (
            select(LedgerEntry)
            .where(LedgerEntry.account_id == account_id)
            .order_by(LedgerEntry.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list((await session.execute(stmt)).scalars().all())

    @staticmethod
    async def get_user_by_key(
        session: AsyncSession,
        user_key: str,
    ) -> User | None:
        """Localiza a un usuario registrado mediante su llave única estilo Bre-B (@ABC123).

        Args:
            session: Sesión asíncrona de base de datos activa.
            user_key: Llave con formato '@ABC123' (insensible a mayúsculas/minúsculas).

        Returns:
            User | None: Entidad del usuario correspondiente o None si no existe.
        """
        normalized_key = (user_key or "").strip().upper()
        if not normalized_key.startswith("@"):
            normalized_key = f"@{normalized_key}"

        stmt = select(User)
        users = (await session.execute(stmt)).scalars().all()
        for user in users:
            if compute_user_key(user.id, user.full_name) == normalized_key:
                return user
        return None

    @staticmethod
    async def get_account_by_user_key(
        session: AsyncSession,
        user_key: str,
    ) -> Account | None:
        """Obtiene la cuenta personal principal asociada a la llave @ABC123 de un usuario.

        Args:
            session: Sesión asíncrona de base de datos activa.
            user_key: Llave única estilo Bre-B (@ABC123) del usuario destinatario.

        Returns:
            Account | None: Cuenta personal principal del usuario o None si no existe.
        """
        user = await AccountService.get_user_by_key(session, user_key)
        if user is None:
            return None

        stmt = (
            select(Account)
            .where(
                Account.user_id == user.id,
                Account.account_type == AccountType.USER.value,
            )
            .order_by(Account.created_at.asc())
        )
        return (await session.execute(stmt)).scalars().first()
