"""Pruebas unitarias para IdempotencyService.

Valida el cálculo determinista del resumen SHA-256, el almacenamiento en caché
y la detección de conflictos de payload duplicado.
"""

import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock

from habireto.core.exceptions import IdempotencyConflictError
from habireto.models.idempotency import IdempotencyRecord
from habireto.services.idempotency_service import IdempotencyService


class TestIdempotencyService(unittest.IsolatedAsyncioTestCase):
    """Conjunto de pruebas para el motor de idempotencia."""

    def test_compute_request_hash_is_deterministic(self) -> None:
        """Verifica que payloads equivalentes con diferente orden de claves generen el mismo hash."""
        payload_1 = {"destination_account_id": "acc-1", "amount": 5000000, "note": "Almuerzo"}
        payload_2 = {"note": "Almuerzo", "amount": 5000000, "destination_account_id": "acc-1"}

        hash_1 = IdempotencyService.compute_request_hash(payload_1)
        hash_2 = IdempotencyService.compute_request_hash(payload_2)

        self.assertEqual(hash_1, hash_2)
        self.assertEqual(len(hash_1), 64)

    def test_compute_request_hash_differs_on_content(self) -> None:
        """Verifica que diferencias de montos generen hashes criptográficos distintos."""
        payload_1 = {"amount": 5000000}
        payload_2 = {"amount": 5000001}

        self.assertNotEqual(
            IdempotencyService.compute_request_hash(payload_1),
            IdempotencyService.compute_request_hash(payload_2),
        )

    async def test_check_or_start_new_request(self) -> None:
        """Verifica que una clave no registrada retorne (False, None)."""
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        session.execute.return_value = mock_result

        is_dup, record = await IdempotencyService.check_or_start(
            session=session,
            key="key-new-123",
            user_id=uuid.uuid4(),
            request_path="/api/v1/transfers",
            request_hash="a" * 64,
        )

        self.assertFalse(is_dup)
        self.assertIsNone(record)

    async def test_check_or_start_duplicate_matching_hash(self) -> None:
        """Verifica que una petición duplicada con idéntico hash retorne (True, record)."""
        session = AsyncMock()
        expected_hash = "f" * 64
        existing_record = IdempotencyRecord(
            key="key-existing",
            user_id=uuid.uuid4(),
            request_path="/api/v1/transfers",
            request_hash=expected_hash,
            response_status=200,
            response_body={"status": "success"},
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_record
        session.execute.return_value = mock_result

        is_dup, record = await IdempotencyService.check_or_start(
            session=session,
            key="key-existing",
            user_id=uuid.uuid4(),
            request_path="/api/v1/transfers",
            request_hash=expected_hash,
        )

        self.assertTrue(is_dup)
        self.assertIs(record, existing_record)

    async def test_check_or_start_conflict_on_different_hash(self) -> None:
        """Verifica que reutilizar una clave con distinto payload lance IdempotencyConflictError."""
        session = AsyncMock()
        existing_record = IdempotencyRecord(
            key="key-reused",
            user_id=uuid.uuid4(),
            request_path="/api/v1/transfers",
            request_hash="a" * 64,
            response_status=200,
            response_body={"status": "success"},
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_record
        session.execute.return_value = mock_result

        with self.assertRaises(IdempotencyConflictError) as ctx:
            await IdempotencyService.check_or_start(
                session=session,
                key="key-reused",
                user_id=uuid.uuid4(),
                request_path="/api/v1/transfers",
                request_hash="b" * 64,
            )

        self.assertIn("key-reused", str(ctx.exception))

    async def test_store_record(self) -> None:
        """Verifica la persistencia de un registro de idempotencia con expiración calculada."""
        session = AsyncMock()
        session.add = MagicMock()
        user_id = uuid.uuid4()

        record = await IdempotencyService.store_record(
            session=session,
            key="key-save-1",
            user_id=user_id,
            request_path="/api/v1/transfers",
            request_hash="c" * 64,
            response_status=201,
            response_body={"id": "tx-123"},
            ttl_seconds=3600,
        )

        session.add.assert_called_once_with(record)
        session.flush.assert_awaited_once()
        self.assertEqual(record.key, "key-save-1")
        self.assertEqual(record.user_id, user_id)
        self.assertEqual(record.response_status, 201)
        self.assertGreater(record.expires_at, record.created_at)


if __name__ == "__main__":
    unittest.main()
