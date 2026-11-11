"""Servicio de idempotencia distribuida y semántica Exactly-Once.

Calcula el hash criptográfico SHA-256 de las peticiones mutantes y gestiona
el ciclo de vida de los registros en idempotency_records para evitar duplicaciones
financieras ante timeouts o reintentos de red.
"""

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from habireto.core.exceptions import IdempotencyConflictError
from habireto.models.idempotency import IdempotencyRecord


class IdempotencyService:
    """Motor transaccional para el control de peticiones idempotentes."""

    @staticmethod
    def compute_request_hash(payload: Any) -> str:
        """Calcula el hash SHA-256 determinista del cuerpo de una petición.

        Ordena lexicográficamente las claves JSON y elimina espacios en blanco superfluos
        para asegurar que dos representaciones del mismo payload produzcan exactamente
        el mismo resumen criptográfico.

        Args:
            payload: Estructura de datos serializable (dict, list, str, etc.).

        Returns:
            str: Resumen hexadecimal SHA-256 de 64 caracteres.
        """
        canonical_json = json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

    @staticmethod
    async def get_record(
        session: AsyncSession,
        key: str,
    ) -> IdempotencyRecord | None:
        """Recupera un registro de idempotencia existente por su clave única.

        Args:
            session: Sesión asíncrona de base de datos activa.
            key: Clave provista en la cabecera HTTP Idempotency-Key.

        Returns:
            IdempotencyRecord | None: Registro encontrado o None si es una petición nueva.
        """
        stmt = select(IdempotencyRecord).where(IdempotencyRecord.key == key)
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def check_or_start(
        session: AsyncSession,
        key: str,
        user_id: uuid.UUID,
        request_path: str,
        request_hash: str,
    ) -> tuple[bool, IdempotencyRecord | None]:
        """Evalúa si una petición ya fue procesada previamente o si presenta conflicto de payload.

        Reglas:
        - Si no existe: Retorna (False, None), autorizando la ejecución del caso de uso financiero.
        - Si existe y el request_hash coincide: Retorna (True, record), permitiendo servir
          la respuesta en caché sin volver a impactar los saldos del libro mayor.
        - Si existe y el request_hash difiere: Lanza IdempotencyConflictError (HTTP 409 Conflict),
          impidiendo la reutilización maliciosa o errónea de una clave para operaciones distintas.

        Args:
            session: Sesión asíncrona de base de datos activa.
            key: Clave de idempotencia única del cliente.
            user_id: Identificador del usuario autenticado que realiza la petición.
            request_path: Ruta del endpoint solicitado (ej. '/api/v1/transfers').
            request_hash: Resumen SHA-256 del cuerpo actual de la solicitud.

        Returns:
            tuple[bool, IdempotencyRecord | None]: (es_duplicada, registro_previo).

        Raises:
            IdempotencyConflictError: Si la clave ya fue utilizada con un payload diferente.
        """
        record = await IdempotencyService.get_record(session, key)
        if record is None:
            return False, None

        if record.request_hash != request_hash:
            raise IdempotencyConflictError(
                f"La clave de idempotencia '{key}' ya fue utilizada previamente con un payload diferente."
            )

        return True, record

    @staticmethod
    async def store_record(
        session: AsyncSession,
        key: str,
        user_id: uuid.UUID,
        request_path: str,
        request_hash: str,
        response_status: int,
        response_body: dict[str, Any],
        ttl_seconds: int = 86400,
    ) -> IdempotencyRecord:
        """Almacena el resultado de una mutación financiera para responder a futuros reintentos.

        Args:
            session: Sesión asíncrona de base de datos activa.
            key: Clave de idempotencia validada.
            user_id: Identificador del usuario titular.
            request_path: Ruta del endpoint HTTP consumido.
            request_hash: Resumen criptográfico del payload original.
            response_status: Código de estado HTTP retornado (ej. 200, 201).
            response_body: Diccionario con la respuesta estructurada enviada al cliente.
            ttl_seconds: Tiempo de vida útil del registro en segundos (por defecto 24 horas).

        Returns:
            IdempotencyRecord: Registro persistido en la base de datos.
        """
        now = datetime.now(timezone.utc)
        record = IdempotencyRecord(
            key=key,
            user_id=user_id,
            request_path=request_path,
            request_hash=request_hash,
            response_status=response_status,
            response_body=response_body,
            created_at=now,
            expires_at=now + timedelta(seconds=ttl_seconds),
        )
        session.add(record)
        await session.flush()
        return record
