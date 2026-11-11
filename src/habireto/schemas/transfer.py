"""Esquemas Pydantic v2 para transferencias entre cuentas persona a persona (P2P).

Define los contratos de validación de entrada con rechazo estricto de auto-transferencias
y montos no positivos, así como la respuesta de la transacción confirmada.
"""

import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, model_validator


class TransferRequest(BaseModel):
    """Cuerpo de petición para ejecutar una transferencia de fondos entre dos cuentas."""

    source_account_id: uuid.UUID = Field(
        ...,
        description="Identificador único de la cuenta origen que envía el dinero.",
    )
    destination_account_id: uuid.UUID = Field(
        ...,
        description="Identificador único de la cuenta destino receptora de los fondos.",
    )
    amount: int = Field(
        ...,
        gt=0,
        description="Monto en centavos COP a transferir (debe ser estrictamente > 0).",
    )
    description: str | None = Field(
        default=None,
        max_length=255,
        description="Concepto o descripción legible de la transferencia.",
    )

    @model_validator(mode="after")
    def validate_different_accounts(self) -> "TransferRequest":
        """Valida que la cuenta origen y destino sean estrictamente diferentes."""
        if self.source_account_id == self.destination_account_id:
            raise ValueError("No es posible transferir fondos hacia la misma cuenta de origen.")
        return self


class TransferResponse(BaseModel):
    """Representación de una transacción financiera completada exitosamente."""

    id: uuid.UUID = Field(..., description="Identificador único inmutable de la transacción.")
    transaction_type: str = Field(
        ...,
        description="Tipo contable de transacción (TRANSFER, COW_CONTRIBUTION, etc.).",
    )
    source_account_id: uuid.UUID | None = Field(
        ...,
        description="Cuenta origen del dinero (nulo para recargas externas TOP_UP).",
    )
    destination_account_id: uuid.UUID = Field(
        ...,
        description="Cuenta receptora de los fondos.",
    )
    amount: int = Field(..., description="Monto transferido en centavos COP.")
    currency: str = Field(default="COP", description="Divisa ISO-4217 de la operación.")
    description: str | None = Field(None, description="Concepto descriptivo registrado.")
    status: str = Field(..., description="Estado final del procesamiento contable.")
    created_at: datetime = Field(..., description="Fecha y hora de ejecución inmutable.")

    model_config = ConfigDict(from_attributes=True)
