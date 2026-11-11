"""Pruebas unitarias para la jerarquía de excepciones de dominio financiero.

Valida la herencia correcta desde FinancialDomainError y HabiRetoError,
así como la preservación de atributos de diagnóstico estructurado.
"""

import unittest
import uuid

from habireto.core.exceptions import (
    AccountNotActiveError,
    AccountNotFoundError,
    CowDisbursementError,
    CowNotActiveError,
    CowNotFoundError,
    CurrencyMismatchError,
    FinancialDomainError,
    HabiRetoError,
    IdempotencyConflictError,
    InsufficientFundsError,
    InvalidAmountError,
    SelfTransferError,
    UnauthorizedError,
    UserNotFoundError,
)


class TestFinancialExceptions(unittest.TestCase):
    """Valida los contratos de excepciones de dominio."""

    def test_hierarchy_inheritance(self) -> None:
        """Verifica que todas las excepciones financieras hereden de FinancialDomainError."""
        exceptions = [
            InsufficientFundsError(available=1000, required=5000),
            InvalidAmountError("Monto inválido"),
            AccountNotFoundError("Cuenta no existe"),
            AccountNotActiveError("Cuenta inactiva"),
            SelfTransferError("Auto-transferencia"),
            CurrencyMismatchError("Divisas no coinciden"),
            CowNotFoundError("Vaca no existe"),
            CowNotActiveError("Vaca no activa"),
            CowDisbursementError("Error de desembolso"),
            UnauthorizedError("No autorizado"),
            IdempotencyConflictError("Conflicto"),
            UserNotFoundError("Usuario no existe"),
        ]

        for exc in exceptions:
            self.assertIsInstance(exc, FinancialDomainError)
            self.assertIsInstance(exc, HabiRetoError)
            self.assertIsInstance(exc, Exception)

    def test_insufficient_funds_attributes(self) -> None:
        """Verifica los atributos estructurados de InsufficientFundsError."""
        acc_id = uuid.uuid4()
        exc = InsufficientFundsError(available=100000, required=500000, account_id=acc_id)
        self.assertEqual(exc.available, 100000)
        self.assertEqual(exc.required, 500000)
        self.assertEqual(exc.account_id, str(acc_id))
        self.assertIn("100000", str(exc))
        self.assertIn("500000", str(exc))


if __name__ == "__main__":
    unittest.main()
