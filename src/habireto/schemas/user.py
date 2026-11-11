"""Esquemas Pydantic v2 para la consulta y representación de identidades y usuarios.

Define los contratos para la exposición de perfiles de usuario y vinculación
con sus cuentas bancarias principales en la plataforma HabiReto.
"""

import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class UserResponse(BaseModel):
    """Representación pública estructurada de un usuario registrado en la plataforma."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(..., description="Identificador único inmutable del usuario (UUIDv4).")
    email: str = Field(..., description="Correo electrónico único del usuario.")
    full_name: str = Field(..., description="Nombre completo del usuario.")
    phone_number: str = Field(..., description="Número celular para transferencias persona a persona.")
    account_id: uuid.UUID | None = Field(
        default=None,
        description="Identificador único de la cuenta personal principal del usuario.",
    )
    account_number: str | None = Field(
        default=None,
        description="Número legible de la cuenta corriente personal.",
    )
    balance: int | None = Field(
        default=None,
        description="Saldo contable actual en centavos COP de la cuenta personal.",
    )
    created_at: datetime = Field(..., description="Fecha y hora de registro.")
