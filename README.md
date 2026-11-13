# HabiReto — Vaqui: Núcleo de Transferencias y Fondos Colaborativos ("Vaquitas")

Construí **Vaqui** como solución al reto técnico de **HabiCapital (Convocatoria Practicantes 2027)**, buscando resolver el movimiento de dinero entre personas sin fricción, con contexto real detrás de cada movimiento y bajo una regla no negociable: **el sistema no puede perder ni duplicar un solo peso**.

Además de implementar el núcleo obligatorio (crear cuenta, recargar saldo simulado, transferir entre cuentas, consultar saldo e historial), construí encima un producto diferenciador que responde directamente a los escenarios del reto (la cena de 12 personas, los hermanos que le mandan plata a su mamá, los roommates): **Vaquitas**, un sistema de fondos colaborativos con **cuentas bóveda reales (`COW_VAULT`)**, **llaves cortas interoperables estilo Bre-B (`@ABC123`)** y **privacidad Zero-Trust en servidor** para colectas anónimas.

---
### Cómo levantarlo en local

```bash
docker compose up --build
```

- **Aplicación web (Vaqui):** `http://localhost:3000`
- **API / Swagger:** `http://localhost:8000/docs`
- **Healthcheck:** `http://localhost:8000/healthcheck`

Al arrancar, iniciamos con 3 cuentas demo listas para probar (sin crear Vaquitas por defecto):
- **Alice Titular** (`@ALI111`, `$100.000 COP`)
- **Bob Roommate** (`@BOB222`, `$50.000 COP`)
- **Charlie Amigo** (`@CHA333`, `$20.000 COP`)

---

## 01. Decisiones clave y por qué las tomaste

Para este reto busqué mantener el sistema simple, claro y fácil de defender sin meter complejidad innecesaria, priorizando siempre que no se pierda dinero.

En cuanto a la estructura del código, opté por una **arquitectura hexagonal** llevada a un monolito modular con separación clara de responsabilidades: la capa de API en FastAPI ([`src/habireto/api/`](src/habireto/api/)) se encarga únicamente de recibir las peticiones, validar los esquemas, revisar la cabecera `X-User-Id`, controlar la idempotencia y aplicar los filtros de privacidad; la lógica de negocio vive aislada en los servicios ([`src/habireto/services/`](src/habireto/services/)); y las entidades junto con las restricciones físicas viven en los modelos y migraciones ([`src/habireto/models/`](src/habireto/models/), [`alembic/`](alembic/)). Elegí este enfoque frente a microservicios porque me permite mantener todo ordenado, desacoplado de HTTP y fácil de probar o modificar rápido en una sesión de *pair programming*, sin el costo operativo de coordinar múltiples servicios.

Elegí **Python** con **FastAPI** para el backend porque es un lenguaje con el que me siento muy cómodo, me permite iterar rápido manteniendo el código limpio y legible, y Pydantic junto con SQLAlchemy Async me ayudaron a validar contratos de entrada/salida con muy poco código repetitivo. 

Además, aunque el reto no pedía construir una interfaz gráfica, decidí hacerla porque es mucho más fácil visualizar y comprobar cómo funciona todo el sistema (ver los saldos, probar transferencias, crear Vaquitas y revisar su comportamiento en tiempo real). Para eso usé HTML, Tailwind y JavaScript modular servido con Nginx sin meter frameworks ni empaquetadores pesados, así pude invertir la mayor parte del tiempo en el núcleo financiero.

Para los datos elegí **PostgreSQL** sobre una base de datos NoSQL. Primero, porque es gratuito, maduro y muy confiable; segundo, porque en un sistema donde se mueve plata necesito **transacciones ACID reales**, llaves foráneas estrictas y consistencia inmediata. Una base NoSQL pensada para consistencia eventual o sin transacciones relacionales estrictas entre varias colecciones aumenta mucho el riesgo de leer un saldo desactualizado o dejar una transferencia a medias (debitar una cuenta sin acreditar la otra). Además, nunca usé `float` ni `double` para dinero por los errores de redondeo binario: PostgreSQL ofrece tipos exactos como `NUMERIC` para trabajar con precisión decimal exacta y enteros de 64 bits (`BIGINT`), que fue el que implementé finalmente en las columnas monetarias (`balance`, `amount`, `balance_after`) para trabajar con pesos COP exactos sin coma flotante, apoyado en restricciones `CHECK` y bloqueos de fila.

Sobre esa base tomé tres decisiones puntuales de diseño para cubrir los riesgos del flujo financiero y el diferenciador de **Vaquitas**:

- **Cuentas bóveda para las Vaquitas (`COW_VAULT`) y partida doble:** En lugar de guardar un campo editable `current_amount` dentro de la tabla `cows`, cada Vaquita crea su propia cuenta bóveda en `accounts`. Así, un aporte, un desembolso o una cancelación con reembolso funcionan igual que una transferencia entre cuentas, generando siempre un registro en `transactions` y dos asientos inmutables (`DEBIT` y `CREDIT`) en `ledger_entries` con su `balance_after`.
- **Bloqueos en base de datos ordenados e idempotencia:** Para evitar que dos peticiones simultáneas gasten el mismo saldo uso `SELECT ... FOR UPDATE` en PostgreSQL, ordenando siempre los IDs de las cuentas de menor a mayor antes de bloquearlas para que dos transferencias cruzadas (de A a B y de B a A) no se queden esperando una por la otra. Además, las operaciones que mueven plata soportan `Idempotency-Key` guardando el hash SHA-256 del payload en `idempotency_records`, así un reintento por timeout devuelve la misma respuesta sin cobrar dos veces.
- **Privacidad de Vaquitas anónimas resuelta en el backend:** En modo `ANONYMOUS`, reemplaza por `null` los montos de terceros (incluso para quien creó la Vaquita) antes de enviar el JSON, y oculta la lista de invitados a los demás participantes. De esa forma la privacidad no depende de ocultarlo visualmente en el navegador, donde cualquiera podría verlo en la pestaña Network.

---

## 02. Cómo sabes que tu sistema no pierde un peso

Para asegurar que no se pierda ni se duplique un solo peso, no confío en una sola capa: aplico **doble verificación, una en el código Python y otra directamente en la base de datos**.

En **Python**, primero valido cada entrada con Pydantic (por ejemplo, que ningún monto de transferencia, recarga o aporte sea `<= 0`), confirmo en la frontera de la API que el `X-User-Id` sea realmente el dueño de la cuenta origen antes de tocar saldos, y en los servicios vuelvo a verificar reglas de negocio como saldo suficiente (`InsufficientFundsError`) y cuentas activas. Pero como un bug o una condición de carrera podría saltarse una validación en memoria, la **base de datos** actúa como segunda barrera física e imposible de ignorar: tanto los modelos como la migración inicial [`alembic/versions/001_initial_schema.py`](alembic/versions/001_initial_schema.py) declaran restricciones `CHECK` (`balance >= 0` en `accounts`, `balance_after >= 0` en `ledger_entries`, `amount > 0` en `transactions` y `ledger_entries`, `target_amount > 0` en `cows` y `total_contributed >= 0` en `cow_members`), además de `UNIQUE` sobre `idempotency_key`. Si algo intentara dejar una cuenta en negativo, PostgreSQL aborta la operación físicamente.

Con eso cubierto, pensé en los cinco escenarios reales donde se suele perder plata o romper la consistencia y los protegí así:

- **Dos peticiones intentando gastar el mismo saldo al tiempo (sobregiro):** `SELECT ... FOR UPDATE` bloquea la fila de la cuenta dentro de PostgreSQL mientras dura la operación, serializando los cobros concurrentes. El primero pasa y descuenta; el segundo lee el saldo ya actualizado y es rechazado por falta de fondos (y por `CHECK (balance >= 0)` en DB).
- **Transferencias cruzadas al mismo milisegundo (de A a B y de B a A):** Al ordenar siempre los UUIDs de cuenta de menor a mayor antes de pedir el `SELECT ... FOR UPDATE`, ambas transacciones compiten por el mismo primer bloqueo en vez de quedarse bloqueadas esperando una por la otra.
- **Caída o error a mitad de una transferencia:** Toda petición HTTP corre dentro de un único bloque `async with session.begin():` en `get_db_session`. Los servicios solo hacen `flush()`, así que si ocurre cualquier excepción después de debitar la cuenta origen y antes de acreditar el destino, se ejecuta `ROLLBACK` total y no queda ningún saldo descuadrado ni asiento huérfano.
- **Reintentos de red tras un timeout:** Con `Idempotency-Key` guardo el hash SHA-256 del cuerpo en `idempotency_records`. Si el cliente reintenta exactamente la misma petición, devuelvo la respuesta guardada sin volver a mover dinero; si reutiliza la clave con otro monto o destinatario, devuelvo `HTTP 409 Conflict`.
- **Fuga de aportes en Vaquitas privadas:** Antes de responder el JSON en `ANONYMOUS`, el backend reemplaza por `null` los aportes de terceros (incluso para el creador) y deja vacía la lista de miembros para los invitados.

Para comprobar que todo esto funciona en la práctica y no solo en el papel, escribí cuatro pruebas de estrés y consistencia en [`tests/test_concurrency.py`](tests/test_concurrency.py) usando un simulador transaccional en memoria ([`tests/mock_session.py`](tests/mock_session.py)) con bloqueos por fila, rollback y detección de deadlocks:

- **Sobregiro concurrente:** Una cuenta con `$100.000` recibe 50 peticiones HTTP paralelas de `$20.000`. Pasan exactamente **5 (`HTTP 200`)**, se rechazan **45 (`HTTP 422`)**, los saldos quedan en `$0` y `$100.000` y el libro mayor suma exactamente `$100.000` en débitos y créditos.
- **Prevención de deadlocks:** 50 transferencias cruzadas en paralelo (25 `A -> B` y 25 `B -> A`) terminan sin un solo deadlock, comprobando en el historial que todas pidieron los locks en orden ascendente (y con una prueba aparte en orden inverso para confirmar que el detector sí atrapa un deadlock real).
- **Conservación de dinero:** 5 cuentas que suman `$500.000` ejecutan 100 transferencias paralelas aleatorias; al final la suma total sigue siendo `$500.000`, ninguna cuenta queda negativa y el total de débitos es igual al total de créditos.
- **Falla a mitad de transacción:** Inyecto un `CRASH_SIMULADO` en `session.flush()` justo después de debitar la cuenta origen y verifico que el rollback deja ambos saldos intactos (`$200.000` y `$50.000`), con `0` registros huérfanos y todos los locks liberados.

Salida real ejecutada:

```text
$ PYTHONPATH=src:. .venv/bin/python -m unittest tests/test_concurrency.py -v
test_bidirectional_deadlock_prevention (tests.test_concurrency.TestConcurrencyAndFinancialConsistency.test_bidirectional_deadlock_prevention)
Prueba de Prevención de Deadlocks Bidireccionales. ... ok
test_concurrent_overdraft_stress (tests.test_concurrency.TestConcurrencyAndFinancialConsistency.test_concurrent_overdraft_stress)
Prueba de Sobregiro Concurrente (Overdraft Stress Test). ... ok
test_mid_transaction_failure_injection_rollback (tests.test_concurrency.TestConcurrencyAndFinancialConsistency.test_mid_transaction_failure_injection_rollback)
Prueba de Inyección de Falla Mid-Transaction. ... ok
test_monetary_mass_conservation_invariant (tests.test_concurrency.TestConcurrencyAndFinancialConsistency.test_monetary_mass_conservation_invariant)
Prueba de Invariante de Conservación de Masa Monetaria. ... ok

----------------------------------------------------------------------
Ran 4 tests in 0.678s

OK
```

Y corriendo la suite completa del repositorio junto con `pyright`:

```text
Ran 98 tests in 1.299s — OK
pyright: 0 errors, 0 warnings, 0 informations
```

---

## 03. Qué dejaste fuera y por qué

Con tan poco tiempo para entregar, preferí recortar a propósito varias funciones que en un producto real son importantes, pero que habrían consumido horas lejos de lo que realmente evalúa este reto: que el dinero no se pierda ni se duplique.

Lo más grande que dejé fuera fue todo el sistema real de **autenticación y gestión de contraseñas**. En la interfaz de bienvenida (*"Esto es Vaqui."*) y en la vista de Configuración puedes registrarte o entrar directamente usando tu llave (`@ALI111`, `@BOB222`, etc.) y alternar entre usuarios con un clic, sin contraseña, sin recuperación de clave ni verificación por correo o SMS. Para este reto era mucho más útil moverse rápido entre cuentas con `X-User-Id` (manteniendo la validación en el backend de que solo puedas operar tu propia cuenta) en lugar de pasar medio proyecto construyendo pantallas de login, correos de recuperación y manejo de sesiones.

En esa misma línea, también dejé fuera varias cosas en la interfaz y en la operación diaria para no dispersar el foco:

- **Edición de perfil y administración de cuenta en Configuración:** Desde la UI puedes consultar tus datos, copiar tu llave o registrar a otra persona, pero no hay formularios para editar nombre, celular o correo, cambiar contraseña, ver sesiones abiertas ni bloquear o cerrar una cuenta desde pantalla.
- **Pasarelas de pago reales (PSE, tarjetas, webhooks bancarios):** La pantalla de recarga es intencionalmente directa y simulada como pide el reto; conectar canales externos habría metido estados asíncronos y confirmaciones por webhook fuera del alcance.
- **Notificaciones, exportación y automatización sobre Vaquitas:** No implementé alertas por correo o *push* cuando alguien te transfiere o aporta a una Vaquita, ni descarga del extracto del Libro Mayor en PDF/CSV. Tampoco agregué edición avanzada de invitados después de crear la Vaquita, retiros parciales ni un *worker* en segundo plano que cierre o reembolse automáticamente una Vaquita cuando vence su `deadline`.

---

## 04. Qué harías distinto con más tiempo

Aunque el monolito modular con arquitectura hexagonal me permitió avanzar rápido y mantener todo ordenado dentro del tiempo del reto, si este proyecto fuera a crecer hacia producción **lo ideal sería separar el sistema en microservicios** (por ejemplo, aislar el servicio de autenticación/usuarios, el núcleo contable de cuentas y transferencias, y el servicio de Vaquitas o notificaciones). Separar esas responsabilidades en servicios independientes ayuda a **proteger de mejor manera el flujo del programa y la lógica de negocio**: evita que un pico de tráfico o un fallo en tareas secundarias afecte al motor que mueve dinero, y permite aplicar permisos, despliegues y escalado específicos sobre la parte financiera crítica.

Además de dar ese paso en arquitectura, con más tiempo cambiaría cuatro cosas muy concretas que de verdad me hicieron falta:

- **Construir el frontend con un framework moderno:** Aunque en Vanilla JavaScript pude sacar la interfaz sin configuraciones pesadas, a medida que crecieron las vistas (portada, dashboard, Vaquitas con múltiples modales y Libro Mayor) mantener el estado y armar plantillas con `innerHTML` se vuelve más frágil. Con más tiempo usaría un framework basado en componentes con TypeScript para manejar el estado de forma predecible, reutilizar componentes sin duplicar markup, validar en compilación que los contratos del backend coincidan con la UI y agregar pruebas automatizadas de interfaz.
- **Autenticación real y manejo completo de cuenta:** Implementaría contraseñas con *hashing*, verificación de identidad, recuperación de clave y edición de perfil desde Configuración, en lugar de depender del acceso rápido con `X-User-Id`.
- **Probar la concurrencia contra PostgreSQL real desde el inicio:** Hoy los 98 tests corren sobre el simulador en memoria (`tests/mock_session.py`) para ejecutar rápido sin levantar contenedores. Con más tiempo montaría pruebas automatizadas directamente contra PostgreSQL en Docker para verificar en vivo los bloqueos `FOR UPDATE` y los `CHECK` bajo carga real.
- **Completar lo que quedó pendiente en Vaquitas y en la interfaz:** Haría funcional el `deadline` de las Vaquitas para que al vencerse se cierren o reembolsen automáticamente (hoy solo se guarda la fecha), agregaría notificaciones cuando alguien te transfiere o aporta, permitiría editar invitados en una Vaquita activa y habilitaría la descarga del historial de movimientos.

---

## 05. Qué NO sabes

Siendo completamente honesto, hay temas clave alrededor de este producto y de la forma de trabajarlo en el día a día que todavía no domino:

- **El marco normativo, regulatorio y las implicaciones legales de mover dinero real:** Aunque en el código me aseguré de dejar trazabilidad contable de cada movimiento (quién envía, quién recibe y cuánto, incluso en Vaquitas anónimas), **no conozco a fondo qué exige la ley colombiana** para sacar algo así a producción. No sé qué figura jurídica o licencia exigiría la Superintendencia Financiera (por ejemplo, si requiere alianza bancaria o licencia tipo SEDPE), qué implicaciones fiscales o reportes ante la DIAN conlleva custodiar plata colectiva de varias personas en una Vaquita (topes, impuestos como el 4x1000 o responsabilidades tributarias del titular al desembolsar), ni cómo diseñar desde lo legal y técnico los controles reales de verificación de identidad (KYC), prevención de lavado de activos (SARLAFT) o protección de datos financieros.
- **Experiencia real trabajando dentro de un equipo de desarrollo:** Conozco la teoría de los flujos de trabajo y cómo se organizan en distintos modelos según el producto que se esté desarrollando, pero me falta la experiencia real aplicándolo en el día a día. Siento que trabajar en equipo es completamente diferente al desarrollo independiente: hay prácticas que todavía necesito vivir en conjunto, desde manejar de forma consistente los commits, las ramas y los *pull requests*, hasta coordinar revisiones de código, resolver conflictos entre cambios paralelos y seguir acuerdos técnicos compartidos sin afectar el trabajo de los demás.
- **Dominar frameworks modernos de frontend ideales para esta interfaz:** Construí la pantalla con HTML, Tailwind y Vanilla JavaScript porque es lo que mejor podía controlar en el tiempo del reto, pero **todavía no manejo bien frameworks para trabajar en frontend**, que habrían sido mucho mejores para mantener un estado complejo de forma segura, reutilizar componentes con tipado estricto y tener pruebas automatizadas de interfaz.
- **Cómo respondería el bloqueo en PostgreSQL bajo tráfico masivo real:** Entiendo cómo funciona `SELECT ... FOR UPDATE` y lo validé con pruebas concurrentes en el simulador, pero nunca he operado un sistema financiero en producción real y no sé en qué punto exacto de tráfico simultáneo sobre una misma Vaquita empezaría a sentirse la espera de los locks o habría que cambiar el enfoque.

---

## 06. Supuestos que hiciste y por qué

Conectado con las decisiones, recortes y vacíos de conocimiento que mencioné arriba, partí de cinco supuestos prácticos para mantener el sistema claro y bien acotado:

- **Operación simulada fuera del alcance regulatorio real, pero con trazabilidad contable:** Como todavía no domino la parte legal y regulatoria de operar dinero real en Colombia, asumí que este sistema corre como prototipo con recargas simuladas y que las exigencias legales reales (licencias ante la Superintendencia Financiera, validación KYC de identidad, impuestos como el 4x1000, reportes a la DIAN y controles formales de SARLAFT) se resolverían en una etapa posterior junto a una entidad o aliado regulado. Aun así, asumí que en ningún caso podía haber movimientos "invisibles" en el fondo: incluso en una Vaquita anónima el secreto es solo en lo que ve la interfaz, mientras que en la base de datos (`transactions` y `ledger_entries`) siempre queda registrado quién movió la plata, hacia dónde y cuándo.
- **Todo ocurre en pesos colombianos (`COP`) y en montos enteros:** Pensando en los escenarios reales del reto (dividir una cena, pagar el arriendo entre roommates o mandar plata cada mes), asumí una única moneda en `COP` y valores enteros sin centavos, porque en transferencias cotidianas entre personas en Colombia no fraccionamos pesos. Eso me permitió evitar conversiones entre monedas y mantener los cálculos exactos en `BIGINT`.
- **En una Vaquita privada nadie ve cuánto puso otro, ni siquiera el creador:** Asumí que el valor real de una Vaquita anónima es quitar la presión social de comparar montos en un grupo. Por eso partí de que al creador le basta saber quién aceptó participar y cuánto suma la bóveda en total, mientras cada persona solo ve su propio aporte (sin perder la trazabilidad interna en base de datos).
- **Cada Vaquita tiene un cierre simple (se entrega completa o se devuelve todo):** Asumí que la Vaquita no permite retiros parciales mientras está abierta. O se termina entregando el 100% recaudado a quien la creó (incluso permitiendo cerrarla en `$0` para pasarla al historial si nadie aportó), o se cancela devolviendo exactamente lo que aportó cada participante.
- **Identidad ya autenticada al llegar al núcleo (`X-User-Id`) e identificación local:** Al dejar por fuera contraseñas y sesiones como comenté en el punto 3, asumí que en producción una capa previa validaría la identidad del usuario antes de pasar `X-User-Id`, dejando dentro de mi backend la regla estricta de comprobar que ese usuario sea dueño de la cuenta que intenta mover. Para registrar personas y buscar destinatarios sin ambigüedades, asumí también el formato colombiano de celular (10 dígitos iniciando en `3`) junto con correo único y su llave corta `@ABC123`.

---

## 07. Cómo usaste IA

### Mi forma de trabajar con la IA

Antes de pedir una sola línea de código de la aplicación, empecé armando todo mi flujo de trabajo alrededor de [`AGENTS.md`](AGENTS.md). Mi prioridad era que el agente no improvisara ni inventara contexto, así que primero configuré las herramientas para reducir errores al mínimo: dejé reglas claras de qué podía y qué no podía hacer, conecté Graphify y Serena para que entendiera la estructura real del proyecto sin perder el hilo entre archivos, usé Context7 para consultar documentación actualizada, y dejé Pyright y las pruebas como filtro obligatorio después de cada cambio. Para la parte visual me apoyé en Stitch para definir la estética de *Vaqui* antes de pasarla a código.

Cuando ya tuve todo ese entorno montado, pasé a definir las reglas de negocio del reto. La dinámica no era "hazme una app", sino sentarme con el agente a revisar el problema paso a paso: yo decidía qué reglas no se podían romper (como no usar decimales flotantes, validar saldos en base de datos, manejar las Vaquitas con cuentas bóveda reales y ocultar montos privados en el servidor) e íbamos discutiendo cómo construir cada parte de la mejor manera. El agente aceleraba mucho la escritura del código y de las pruebas, pero yo revisaba cada pieza, probaba los flujos y frenaba cualquier cosa que complicara de más el proyecto o rompiera las reglas.

### Un caso real en el que la IA se equivocó

Uno de los descuidos más claros ocurrió en el flujo de creación de cuentas. Al implementar el registro de usuarios nuevos, la IA armó los campos de correo electrónico y teléfono sin agregar restricciones reales de formato ni un manejo claro de datos repetidos (dejaba pasar números de celular con indicativos o longitudes inválidas y no controlaba limpiamente qué pasaba si alguien intentaba registrarse con un correo o teléfono ya existente).

Me di cuenta haciendo pruebas directamente sobre la aplicación y revisando casos límite de registro: aceptaba teléfonos inválidos o dejaba pasar errores confusos cuando se repetía un correo o celular. A partir de ahí le pedí exigir el formato colombiano de celular (10 dígitos empezando por `3`, sin `+57`), normalizar el correo, devolver un mensaje claro cuando ya existiera ese correo o celular (`HTTP 409`) y agregar pruebas en [`tests/test_schemas.py`](tests/test_schemas.py) para asegurar que los formatos inválidos de celular quedaran bloqueados desde la entrada.

---

## 08. Qué aprendiste

- **Validar solo en el código no alcanza:** Antes me habría quedado tranquilo con las verificaciones en Python revisando el saldo. En este reto entendí en la práctica por qué vale la pena hacer doble verificación: validar en la aplicación, pero también apoyarse en PostgreSQL con transacciones atómicas, restricciones `CHECK` y bloqueos de fila ordenados para evitar que dos peticiones concurrentes gasten el mismo saldo o se bloqueen entre sí.
- **Un buen modelo simplifica todo el producto:** Algo que me sorprendió fue ver lo fácil que resultó construir las Vaquitas cuando decidimos darles su propia cuenta bóveda (`COW_VAULT`) en vez de llevar un saldo aparte. Al usar el mismo flujo de transferencias y libro mayor que ya existía, los aportes, desembolsos y reembolsos quedaron cuadrados desde el inicio sin inventar reglas paralelas.
- **El código no lo es todo:** Pensar este proyecto en serio me hizo dimensionar todo lo que implica mover dinero real —desde cuidar la privacidad de los datos en el servidor hasta el peso del marco legal, las licencias y los controles regulatorios—, y por qué decisiones como separar responsabilidades o elegir herramientas adecuadas en frontend y arquitectura (como ir hacia microservicios al escalar) son clave para proteger el negocio.
- **Uso consciente de la IA:** Aprendí que invertir tiempo al principio en ordenar el flujo con [`AGENTS.md`](AGENTS.md) y herramientas de verificación evita que el agente invente cosas, pero igual exige que uno esté encima revisando, cuestionando y probando casos límite como el formato del celular o los registros duplicados.

---

## Documentación complementaria

- [Arquitectura del sistema](docs/ARCHITECTURE.md) — Capas, decisiones estructurales y manejo de riesgos.
- [Modelo de datos](docs/DATA_MODEL.md) — Esquema relacional de 7 tablas, diagrama ERD y restricciones físicas.
- [Decisiones de la Fase 1](docs/FASE1_DECISIONES.md) — Locks ordenados, bóvedas `COW_VAULT`, idempotencia y Alembic.
- [Decisiones de la Fase 2](docs/FASE2_DECISIONES.md) — Privacidad en servidor, `X-User-Id`, transacción única y pruebas ASGI.
- [Decisiones de la Fase 3](docs/FASE3_DECISIONES.md) — Pruebas de concurrencia, conservación de saldos y simulador en memoria.
- [Decisiones de la Fase 4](docs/FASE4_DECISIONES.md) — Interfaz web *Vaqui* (Terra), Nginx y Docker Compose.
- [Flujo de trabajo con IA](docs/AI_WORKFLOW.md) — Herramientas configuradas y desglose por fases.

