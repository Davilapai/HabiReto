"""Servicio de sembrado (seed) determinista e idempotente para el entorno de demostración.

Garantiza la creación y consistencia de las identidades de demostración (Alice, Bob, Charlie)
y los fondos colaborativos de prueba con identificadores UUID estables, permitiendo
reproducir con exactitud los flujos de demostración sin alterar contratos API.
"""

import uuid
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from habireto.models.account import Account, AccountStatus, AccountType
from habireto.models.cow import Cow, CowMember, CowMemberRole, CowStatus, CowVisibilityType
from habireto.models.user import User
from habireto.services.account_service import AccountService

# Constantes deterministas para identidades de demostración
ALICE_USER_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
ALICE_ACCOUNT_ID = uuid.UUID("11111111-2222-4111-8111-111111111111")
ALICE_ACCOUNT_NUMBER = "ACC-ALICE001"
ALICE_EMAIL = "alice@habireto.com"
ALICE_PHONE = "+573001111111"
ALICE_NAME = "Alice Titular"
ALICE_INITIAL_BALANCE = 100000  # $100.000 COP

BOB_USER_ID = uuid.UUID("22222222-1111-4222-8222-222222222222")
BOB_ACCOUNT_ID = uuid.UUID("22222222-2222-4222-8222-222222222222")
BOB_ACCOUNT_NUMBER = "ACC-BOB00002"
BOB_EMAIL = "bob@habireto.com"
BOB_PHONE = "+573002222222"
BOB_NAME = "Bob Roommate"
BOB_INITIAL_BALANCE = 50000  # $50.000 COP

CHARLIE_USER_ID = uuid.UUID("33333333-1111-4333-8333-333333333333")
CHARLIE_ACCOUNT_ID = uuid.UUID("33333333-2222-4333-8333-333333333333")
CHARLIE_ACCOUNT_NUMBER = "ACC-CHARLIE3"
CHARLIE_EMAIL = "charlie@habireto.com"
CHARLIE_PHONE = "+573003333333"
CHARLIE_NAME = "Charlie Amigo"
CHARLIE_INITIAL_BALANCE = 20000  # $20.000 COP

PUBLIC_COW_ID = uuid.UUID("44444444-1111-4444-8444-444444444444")
PUBLIC_COW_VAULT_ID = uuid.UUID("44444444-2222-4444-8444-444444444444")
PUBLIC_COW_VAULT_NUMBER = "VAULT-ASADO444"

ANONYMOUS_COW_ID = uuid.UUID("55555555-1111-4555-8555-555555555555")
ANONYMOUS_COW_VAULT_ID = uuid.UUID("55555555-2222-4555-8555-555555555555")
ANONYMOUS_COW_VAULT_NUMBER = "VAULT-SECRETO5"


class SeedService:
    """Servicio para inicializar de forma idempotente los datos de demostración."""

    @staticmethod
    async def seed_demo_users_and_accounts(session: AsyncSession) -> dict[str, uuid.UUID]:
        """Crea o verifica de forma idempotente los 3 usuarios base y sus cuentas personales.

        Args:
            session: Sesión asíncrona de base de datos activa.

        Returns:
            dict[str, uuid.UUID]: Mapeo de claves de usuarios con sus user_id correspondientes.
        """
        users_meta = [
            {
                "user_id": ALICE_USER_ID,
                "account_id": ALICE_ACCOUNT_ID,
                "account_number": ALICE_ACCOUNT_NUMBER,
                "email": ALICE_EMAIL,
                "phone": ALICE_PHONE,
                "name": ALICE_NAME,
                "balance": ALICE_INITIAL_BALANCE,
            },
            {
                "user_id": BOB_USER_ID,
                "account_id": BOB_ACCOUNT_ID,
                "account_number": BOB_ACCOUNT_NUMBER,
                "email": BOB_EMAIL,
                "phone": BOB_PHONE,
                "name": BOB_NAME,
                "balance": BOB_INITIAL_BALANCE,
            },
            {
                "user_id": CHARLIE_USER_ID,
                "account_id": CHARLIE_ACCOUNT_ID,
                "account_number": CHARLIE_ACCOUNT_NUMBER,
                "email": CHARLIE_EMAIL,
                "phone": CHARLIE_PHONE,
                "name": CHARLIE_NAME,
                "balance": CHARLIE_INITIAL_BALANCE,
            },
        ]

        for meta in users_meta:
            existing_user_stmt = select(User).where(User.id == meta["user_id"])
            existing_user = (await session.execute(existing_user_stmt)).scalar_one_or_none()

            if existing_user is None:
                # Comprueba por correo por si existe con id alternativo
                existing_email_stmt = select(User).where(User.email == meta["email"])
                existing_email = (await session.execute(existing_email_stmt)).scalar_one_or_none()
                if existing_email is not None:
                    continue

                user = User(
                    id=meta["user_id"],
                    email=meta["email"],
                    full_name=meta["name"],
                    phone_number=meta["phone"],
                )
                session.add(user)
                await session.flush()

                account = Account(
                    id=meta["account_id"],
                    user_id=user.id,
                    account_number=meta["account_number"],
                    account_type=AccountType.USER.value,
                    balance=0,
                    currency="COP",
                    status=AccountStatus.ACTIVE.value,
                )
                session.add(account)
                await session.flush()

                initial_bal = int(meta["balance"])
                if initial_bal > 0:
                    await AccountService.load_balance(
                        session=session,
                        account_id=account.id,
                        amount=initial_bal,
                        description="Depósito inicial para demostración",
                    )

        return {
            "alice": ALICE_USER_ID,
            "bob": BOB_USER_ID,
            "charlie": CHARLIE_USER_ID,
        }

    @staticmethod
    async def seed_demo_cows(session: AsyncSession) -> dict[str, uuid.UUID]:
        """Crea o verifica de forma idempotente las vacas iniciales (pública y anónima).

        Args:
            session: Sesión asíncrona de base de datos activa.

        Returns:
            dict[str, uuid.UUID]: Mapeo de identificadores de vacas creadas.
        """
        # Asegurar usuarios primero
        await SeedService.seed_demo_users_and_accounts(session)

        # 1. Vaca Pública: Asado de Fin de Año (Creador: Alice)
        pub_stmt = select(Cow).where(Cow.id == PUBLIC_COW_ID)
        pub_cow = (await session.execute(pub_stmt)).scalar_one_or_none()

        if pub_cow is None:
            # Crear cuenta bóveda dedicada
            vault_pub = Account(
                id=PUBLIC_COW_VAULT_ID,
                user_id=None,
                account_number=PUBLIC_COW_VAULT_NUMBER,
                account_type=AccountType.COW_VAULT.value,
                balance=0,
                currency="COP",
                status=AccountStatus.ACTIVE.value,
            )
            session.add(vault_pub)
            await session.flush()

            pub_cow = Cow(
                id=PUBLIC_COW_ID,
                creator_id=ALICE_USER_ID,
                vault_account_id=vault_pub.id,
                title="Asado de Fin de Año",
                description="Cuota compartida para asado de bienvenida e integración del equipo.",
                target_amount=150000,
                visibility_type=CowVisibilityType.PUBLIC.value,
                status=CowStatus.ACTIVE.value,
            )
            session.add(pub_cow)
            await session.flush()

            # Vincular a Alice como CREATOR y a Bob y Charlie como miembros invitados
            for uid, role in [
                (ALICE_USER_ID, CowMemberRole.CREATOR.value),
                (BOB_USER_ID, CowMemberRole.CONTRIBUTOR.value),
                (CHARLIE_USER_ID, CowMemberRole.CONTRIBUTOR.value),
            ]:
                session.add(
                    CowMember(
                        cow_id=pub_cow.id,
                        user_id=uid,
                        role=role,
                        total_contributed=0,
                    )
                )
            await session.flush()
        else:
            for uid in [BOB_USER_ID, CHARLIE_USER_ID]:
                m_stmt = select(CowMember).where(CowMember.cow_id == pub_cow.id, CowMember.user_id == uid)
                if not (await session.execute(m_stmt)).scalar_one_or_none():
                    session.add(
                        CowMember(
                            cow_id=pub_cow.id,
                            user_id=uid,
                            role=CowMemberRole.CONTRIBUTOR.value,
                            total_contributed=0,
                        )
                    )
            await session.flush()

        # 2. Vaca Anónima: Viaje Secreto de Cumpleaños (Creador: Charlie)
        anon_stmt = select(Cow).where(Cow.id == ANONYMOUS_COW_ID)
        anon_cow = (await session.execute(anon_stmt)).scalar_one_or_none()

        if anon_cow is None:
            # Crear cuenta bóveda dedicada
            vault_anon = Account(
                id=ANONYMOUS_COW_VAULT_ID,
                user_id=None,
                account_number=ANONYMOUS_COW_VAULT_NUMBER,
                account_type=AccountType.COW_VAULT.value,
                balance=0,
                currency="COP",
                status=AccountStatus.ACTIVE.value,
            )
            session.add(vault_anon)
            await session.flush()

            anon_cow = Cow(
                id=ANONYMOUS_COW_ID,
                creator_id=CHARLIE_USER_ID,
                vault_account_id=vault_anon.id,
                title="Viaje Secreto de Cumpleaños",
                description="Colecta secreta y anónima para el regalo sorpresa de cumpleaños.",
                target_amount=80000,
                visibility_type=CowVisibilityType.ANONYMOUS.value,
                status=CowStatus.ACTIVE.value,
            )
            session.add(anon_cow)
            await session.flush()

            # Vincular a Charlie como CREATOR y a Alice y Bob como miembros invitados
            for uid, role in [
                (CHARLIE_USER_ID, CowMemberRole.CREATOR.value),
                (ALICE_USER_ID, CowMemberRole.CONTRIBUTOR.value),
                (BOB_USER_ID, CowMemberRole.CONTRIBUTOR.value),
            ]:
                session.add(
                    CowMember(
                        cow_id=anon_cow.id,
                        user_id=uid,
                        role=role,
                        total_contributed=0,
                    )
                )
            await session.flush()
        else:
            for uid in [ALICE_USER_ID, BOB_USER_ID]:
                m_stmt = select(CowMember).where(CowMember.cow_id == anon_cow.id, CowMember.user_id == uid)
                if not (await session.execute(m_stmt)).scalar_one_or_none():
                    session.add(
                        CowMember(
                            cow_id=anon_cow.id,
                            user_id=uid,
                            role=CowMemberRole.CONTRIBUTOR.value,
                            total_contributed=0,
                        )
                    )
            await session.flush()

        return {
            "public_cow": PUBLIC_COW_ID,
            "anonymous_cow": ANONYMOUS_COW_ID,
        }

    @staticmethod
    async def remove_default_demo_cows(session: AsyncSession) -> None:
        """Elimina las Vaquitas de demostración por defecto si existían previamente sin movimientos.

        Garantiza que el sistema inicie limpio únicamente con las personas registradas
        y cero Vaquitas precargadas.
        """
        default_cow_ids = [PUBLIC_COW_ID, ANONYMOUS_COW_ID]
        for cid in default_cow_ids:
            cow = (await session.execute(select(Cow).where(Cow.id == cid))).scalar_one_or_none()
            if cow is not None:
                await session.execute(delete(CowMember).where(CowMember.cow_id == cid))
                await session.execute(delete(Cow).where(Cow.id == cid))
        await session.flush()

    @staticmethod
    async def seed_all(session: AsyncSession) -> None:
        """Siembra únicamente las identidades iniciales manteniendo el sistema sin Vaquitas por defecto."""
        await SeedService.seed_demo_users_and_accounts(session)
        await SeedService.remove_default_demo_cows(session)
