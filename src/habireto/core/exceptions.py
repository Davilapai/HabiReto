"""Excepciones de dominio financiero e integridad transaccional.

Define la jerarquía tipada de errores del sistema para rechazar de manera segura
operaciones inválidas (sobregiros, montos negativos, conflictos de idempotencia
o violaciones de autorización) sin filtrar detalles internos o trazas al cliente.
"""

from typing import Any


class HabiRetoError(Exception):
    """Excepción raíz del ecosistema HabiReto."""

    pass


class FinancialDomainError(HabiRetoError):
    """Excepción base para violaciones de invariantes de negocio o integridad financiera."""

    pass


class InsufficientFundsError(FinancialDomainError):
    """Lanzada cuando una cuenta bancaria no dispone de saldo suficiente para cubrir un débito.

    Garantiza la defensa en la capa de aplicación antes de alcanzar la restricción
    física SQL CHECK (balance >= 0) en PostgreSQL.
    """

    def __init__(
        self,
        available: int,
        required: int,
        account_id: Any | None = None,
    ) -> None:
        """Inicializa la excepción con los montos en conflicto.

        Args:
            available: Saldo disponible actualmente en centavos.
            required: Monto requerido para la operación en centavos.
            account_id: Identificador opcional de la cuenta afectada.
        """
        self.available = available
        self.required = required
        self.account_id = str(account_id) if account_id else None
        super().__init__(
            f"Fondos insuficientes: saldo disponible {available} centavos, "
            f"monto requerido {required} centavos."
        )


class InvalidAmountError(FinancialDomainError):
    """Lanzada cuando un monto monetario no es estrictamente positivo (> 0).

    Previene mutaciones financieras nulas o montos negativos que violen la partida doble.
    """

    pass


class AccountNotFoundError(FinancialDomainError):
    """Lanzada cuando un identificador de cuenta bancaria no existe en el sistema."""

    pass


class AccountNotActiveError(FinancialDomainError):
    """Lanzada cuando se intenta operar sobre una cuenta inactiva, bloqueada o cerrada."""

    pass


class SelfTransferError(FinancialDomainError):
    """Lanzada cuando la cuenta origen y destino de una transferencia son idénticas."""

    pass


class CurrencyMismatchError(FinancialDomainError):
    """Lanzada cuando se intenta transferir fondos entre cuentas con divisas distintas.

    Rechaza conversiones implícitas de divisa protegiendo la paridad monetaria.
    """

    pass


class CowNotFoundError(FinancialDomainError):
    """Lanzada cuando el identificador de un fondo colaborativo (Vaca) no existe."""

    pass


class CowNotActiveError(FinancialDomainError):
    """Lanzada cuando se intenta aportar a una Vaca que no se encuentra en estado ACTIVE."""

    pass


class CowDisbursementError(FinancialDomainError):
    """Lanzada ante condiciones inválidas para el desembolso de un fondo colaborativo."""

    pass


class UnauthorizedError(FinancialDomainError):
    """Lanzada cuando un usuario intenta realizar una operación sin ser el titular autorizado."""

    pass


class IdempotencyConflictError(FinancialDomainError):
    """Lanzada cuando se reutiliza una clave Idempotency-Key con un cuerpo de petición diferente.

    Previene colisiones de hash y ataques de manipulación de payloads duplicados.
    """

    pass


class UserNotFoundError(FinancialDomainError):
    """Lanzada cuando un usuario referenciado no existe en el registro del sistema."""

    pass


class DuplicateUserError(FinancialDomainError):
    """Lanzada cuando se intenta registrar un correo electrónico o número de celular ya existente."""

    pass
