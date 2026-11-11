"""Pruebas unitarias de integridad de la infraestructura de migraciones de Alembic.

Valida que el archivo alembic.ini esté configurado correctamente, que la migración
inicial 001_initial_schema.py sea sintácticamente válida, exporte las funciones
upgrade/downgrade y contenga todas las 7 tablas maestras con sus restricciones físicas.
"""

import configparser
import importlib.util
import os
import unittest

from habireto.core.database import Base


class TestMigrations(unittest.TestCase):
    """Valida la configuración de Alembic y el script inicial de migración."""

    def test_alembic_ini_configuration(self) -> None:
        """Verifica la validez y directivas de configuración en alembic.ini."""
        self.assertTrue(os.path.exists("alembic.ini"), "El archivo alembic.ini no existe en la raíz.")

        config = configparser.ConfigParser()
        config.read("alembic.ini")

        self.assertIn("alembic", config.sections())
        self.assertEqual(config.get("alembic", "script_location"), "alembic")
        self.assertEqual(config.get("alembic", "prepend_sys_path"), "src")

    def test_initial_migration_module_and_attributes(self) -> None:
        """Verifica que 001_initial_schema.py sea importable y defina upgrade y downgrade."""
        migration_path = os.path.join("alembic", "versions", "001_initial_schema.py")
        self.assertTrue(os.path.exists(migration_path), f"No existe la migración inicial en {migration_path}")

        spec = importlib.util.spec_from_file_location("initial_schema", migration_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)  # type: ignore

        module = importlib.util.module_from_spec(spec)  # type: ignore
        spec.loader.exec_module(module)  # type: ignore

        self.assertEqual(module.revision, "001_initial_schema")
        self.assertIsNone(module.down_revision)
        self.assertTrue(callable(getattr(module, "upgrade", None)))
        self.assertTrue(callable(getattr(module, "downgrade", None)))

    def test_migration_covers_all_7_metadata_tables(self) -> None:
        """Verifica que el script inicial contenga la creación de las 7 tablas maestras."""
        migration_path = os.path.join("alembic", "versions", "001_initial_schema.py")
        with open(migration_path, "r", encoding="utf-8") as f:
            content = f.read()

        for table_name in Base.metadata.tables.keys():
            self.assertIn(
                f'"{table_name}"',
                content,
                f"La tabla {table_name} no se encuentra referenciada en la migración inicial.",
            )

    def test_migration_declares_financial_check_constraints(self) -> None:
        """Verifica la presencia explícita de las restricciones físicas en la migración."""
        migration_path = os.path.join("alembic", "versions", "001_initial_schema.py")
        with open(migration_path, "r", encoding="utf-8") as f:
            content = f.read()

        expected_constraints = [
            "ck_accounts_balance_non_negative",
            "ck_cows_target_amount_positive",
            "ck_cow_members_total_contributed_non_negative",
            "ck_transactions_amount_positive",
            "ck_ledger_entries_amount_positive",
            "ck_ledger_entries_balance_after_non_negative",
        ]

        for ck in expected_constraints:
            self.assertIn(ck, content, f"Falta la restricción física {ck} en el DDL de la migración.")


if __name__ == "__main__":
    unittest.main()
