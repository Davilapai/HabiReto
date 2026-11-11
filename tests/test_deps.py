"""Pruebas unitarias para dependencias de API y manejo de errores.

Valida la extracción y validación de la cabecera X-User-Id, la sanitización de errores
de dominio y la traducción exacta a códigos de estado HTTP semánticos.
"""

import unittest
import uuid
from fastapi import Depends, FastAPI

from habireto.api.deps import get_current_user_id
from habireto.api.errors import register_exception_handlers
from habireto.core.exceptions import (
    AccountNotFoundError,
    IdempotencyConflictError,
    InsufficientFundsError,
    SelfTransferError,
    UnauthorizedError,
)
from tests.asgi_client import ASGIClient


class TestApiDepsAndErrors(unittest.IsolatedAsyncioTestCase):
    """Batería de pruebas para dependencias y manejadores de error."""

    def setUp(self) -> None:
        self.app = FastAPI()
        register_exception_handlers(self.app)

        @self.app.get("/test/auth")
        async def auth_endpoint(user_id: uuid.UUID = Depends(get_current_user_id)) -> dict[str, str]:
            return {"user_id": str(user_id)}

        @self.app.get("/test/insufficient-funds")
        async def insufficient_funds_endpoint() -> None:
            raise InsufficientFundsError(available=1000, required=5000)

        @self.app.get("/test/not-found")
        async def not_found_endpoint() -> None:
            raise AccountNotFoundError("Cuenta no localizada")

        @self.app.get("/test/unauthorized")
        async def unauthorized_endpoint() -> None:
            raise UnauthorizedError("Acceso no autorizado a cuenta ajena")

        @self.app.get("/test/idempotency-conflict")
        async def idempotency_conflict_endpoint() -> None:
            raise IdempotencyConflictError("Clave de idempotencia duplicada con payload diferente")

        @self.app.get("/test/self-transfer")
        async def self_transfer_endpoint() -> None:
            raise SelfTransferError("No es posible transferir a la misma cuenta")

        self.client = ASGIClient(self.app)

    async def test_auth_header_valid_uuid(self) -> None:
        """Verifica que una cabecera X-User-Id válida sea inyectada exitosamente."""
        user_uuid = uuid.uuid4()
        res = await self.client.get("/test/auth", headers={"X-User-Id": str(user_uuid)})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"user_id": str(user_uuid)})

    async def test_auth_header_missing_rejected_422(self) -> None:
        """Verifica que la omisión de la cabecera X-User-Id retorne HTTP 422."""
        res = await self.client.get("/test/auth")
        self.assertEqual(res.status_code, 422)

    async def test_auth_header_invalid_uuid_rejected_422(self) -> None:
        """Verifica que una cabecera X-User-Id que no sea UUIDv4 retorne HTTP 422."""
        res = await self.client.get("/test/auth", headers={"X-User-Id": "no-es-un-uuid"})
        self.assertEqual(res.status_code, 422)

    async def test_insufficient_funds_handler_422(self) -> None:
        """Verifica que InsufficientFundsError sea mapeado a HTTP 422 con mensaje sanitizado."""
        res = await self.client.get("/test/insufficient-funds")
        self.assertEqual(res.status_code, 422)
        body = res.json()
        self.assertIn("Fondos insuficientes", body["detail"])
        self.assertEqual(body["error_type"], "InsufficientFundsError")

    async def test_not_found_handler_404(self) -> None:
        """Verifica que AccountNotFoundError retorne HTTP 404."""
        res = await self.client.get("/test/not-found")
        self.assertEqual(res.status_code, 404)
        body = res.json()
        self.assertEqual(body["error_type"], "AccountNotFoundError")

    async def test_unauthorized_handler_403(self) -> None:
        """Verifica que UnauthorizedError retorne HTTP 403 Forbidden."""
        res = await self.client.get("/test/unauthorized")
        self.assertEqual(res.status_code, 403)
        body = res.json()
        self.assertEqual(body["error_type"], "UnauthorizedError")

    async def test_idempotency_conflict_handler_409(self) -> None:
        """Verifica que IdempotencyConflictError retorne HTTP 409 Conflict."""
        res = await self.client.get("/test/idempotency-conflict")
        self.assertEqual(res.status_code, 409)
        body = res.json()
        self.assertEqual(body["error_type"], "IdempotencyConflictError")

    async def test_self_transfer_handler_400(self) -> None:
        """Verifica que SelfTransferError retorne HTTP 400 Bad Request."""
        res = await self.client.get("/test/self-transfer")
        self.assertEqual(res.status_code, 400)
        body = res.json()
        self.assertEqual(body["error_type"], "SelfTransferError")
