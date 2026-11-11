"""Esquemas Pydantic v2 para la gestión de cuentas bancarias y libro mayor.

Define los contratos de entrada y salida para la creación de cuentas personales,
recargas simuladas de saldo, consulta de saldos y extractos de auditoría.
"""

import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class AccountCreateRequest(BaseModel):
    """Cuerpo de petición para el registro de usuario y apertura de cuenta inicial."""

    email: str = Field(
        ...,
        description="Correo electrónico único del usuario titular.",
        min_length=5,
        max_length=255,
    )
    full_name: str = Field(
        ...,
        description="Nombre completo o razón social del titular.",
        min_length=1,
        max_length=255,
    )
    phone_number: str = Field(
        ...,
        description="Número de teléfono celular para transferencias persona a persona.",
        min_length=7,
        max_length=50,
    )
    initial_balance: int = Field(
        default=0,
        ge=0,
        description="Saldo inicial en centavos COP para apertura (por defecto 0).",
    )


class AccountResponse(BaseModel):
    """Representación pública estructurada de una cuenta bancaria."""

    id: uuid.UUID = Field(..., description="Identificador único inmutable de la cuenta (UUIDv4).")
    user_id: uuid.UUID | None = Field(
        ...,
        description="Identificador del usuario propietario (nulo para cuentas bóveda).",
    )
    account_number: str = Field(..., description="Número de cuenta bancaria formateado y legible.")
    account_type: str = Field(..., description="Tipo operativo de cuenta (USER o COW_VAULT).")
    balance: int = Field(..., description="Saldo contable actual expresado en centavos COP.")
    currency: str = Field(..., description="Código de divisa ISO-4217 (ej. COP).")
    status: str = Field(..., description="Estado operativo de la cuenta (ACTIVE, BLOCKED, CLOSED).")
    created_at: datetime = Field(..., description="Marca temporal de apertura de la cuenta.")

    model_config = ConfigDict(from_attributes=True)


class LoadBalanceRequest(BaseModel):
    """Cuerpo de petición para una recarga simulada de saldo."""

    amount: int = Field(
        ...,
        gt=0,
        description="Monto en centavos COP a acreditar en la cuenta (debe ser estrictamente > 0).",
    )
    description: str | None = Field(
        default=None,
        max_length=255,
        description="Concepto o descripción opcional del depósito.",
    )


class BalanceResponse(BaseModel):
    """Respuesta con el saldo contable actual de una cuenta."""

    account_id: uuid.UUID = Field(..., description="Identificador único de la cuenta consultada.")
    balance: int = Field(..., description="Saldo disponible expresado en centavos COP.")
    currency: str = Field(default="COP", description="Código de divisa ISO-4217.")


class LedgerEntryResponse(BaseModel):
    """Extracto de un asiento individual en el libro mayor contable (partida doble)."""

    id: uuid.UUID = Field(..., description="Identificador único del asiento contable.")
    transaction_id: uuid.UUID = Field(..., description="Transacción maestra que originó el asiento.")
    account_id: uuid.UUID = Field(..., description="Cuenta bancaria impactada.")
    entry_type: str = Field(..., description="Lado contable del movimiento (DEBIT o CREDIT).")
    amount: int = Field(..., description="Monto del movimiento en centavos COP.")
    balance_after: int = Field(
        ...,
        description="Saldo contable exacto posterior al impacto del asiento.",
    )
    created_at: datetime = Field(..., description="Fecha y hora de registro inmutable del asiento.")

    model_config = ConfigDict(from_attributes=True)
