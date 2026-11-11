"""Módulo de configuración central de la aplicación.

Gestiona las variables de entorno y los parámetros operativos de la plataforma
utilizando Pydantic Settings para garantizar validación en tiempo de arranque.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración global del sistema cargada desde el entorno o archivo .env.

    Esta clase centraliza las credenciales, cadenas de conexión a PostgreSQL
    y parámetros de rendimiento del pool de conexiones para evitar dependencias
    dispersas en la base de código.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_ENV: str = "development"
    DATABASE_URL: str = "postgresql+asyncpg://habi_user:habi_password@localhost:5432/habidb"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_ECHO: bool = False


settings = Settings()
