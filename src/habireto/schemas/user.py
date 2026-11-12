"""Esquemas Pydantic v2 para la consulta y representación de identidades y usuarios.

Define los contratos para la exposición de perfiles de usuario, su llave única
estilo Bre-B (@ABC123) y la vinculación con sus cuentas bancarias principales
en la plataforma HabiReto.
"""

import unicodedata
import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, model_validator

DEMO_USER_KEYS: dict[uuid.UUID, str] = {
    uuid.UUID("11111111-1111-4111-8111-111111111111"): "@ALI111",
    uuid.UUID("22222222-1111-4222-8222-222222222222"): "@BOB222",
    uuid.UUID("33333333-1111-4333-8333-333333333333"): "@CHA333",
    uuid.UUID("11111111-1111-1111-1111-111111111111"): "@ALI111",
    uuid.UUID("22222222-2222-2222-2222-222222222222"): "@BOB222",
    uuid.UUID("33333333-3333-3333-3333-333333333333"): "@CHA333",
}


def compute_user_key(user_id: uuid.UUID, full_name: str) -> str:
    """Genera de forma determinista la llave única estilo Bre-B (@ + 3 letras + 3 números).

    Para los usuarios semilla utiliza las llaves canónicas (@ALI111, @BOB222, @CHA333).
    Para cualquier otro usuario toma las primeras 3 letras alfabéticas ASCII del nombre
    en mayúsculas y 3 dígitos derivados del identificador único.
    """
    if user_id in DEMO_USER_KEYS:
        return DEMO_USER_KEYS[user_id]

    normalized = unicodedata.normalize("NFKD", full_name or "")
    letters = "".join(
        ch.upper() for ch in normalized if ch.isascii() and ch.isalpha()
    )[:3].ljust(3, "X")
    digits = f"{user_id.int % 1000:03d}"
    return f"@{letters}{digits}"


class UserResponse(BaseModel):
    """Representación pública estructurada de un usuario registrado en la plataforma."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(..., description="Identificador único inmutable del usuario (UUIDv4).")
    email: str = Field(..., description="Correo electrónico único del usuario.")
    full_name: str = Field(..., description="Nombre completo del usuario.")
    phone_number: str = Field(..., description="Número celular para transferencias persona a persona.")
    user_key: str = Field(
        default="",
        description="Llave única estilo Bre-B (@ + 3 letras + 3 números, ej. @ALI111).",
    )
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

    @model_validator(mode="after")
    def populate_user_key(self) -> "UserResponse":
        """Asigna automáticamente la llave @ABC123 cuando no se especifica de forma explícita."""
        if not self.user_key:
            self.user_key = compute_user_key(self.id, self.full_name)
        return self
