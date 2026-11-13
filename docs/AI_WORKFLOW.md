# AI Workflow — HabiReto

## 1. Filosofía de trabajo

Mi objetivo al preparar el entorno de desarrollo para este reto no fue simplemente conseguir que un agente de IA escribiera código más rápido. Quise construir un entorno en el que la IA pudiera participar activamente en el ciclo de ingeniería de software, desde la comprensión de los requisitos hasta la implementación, validación y documentación de las decisiones técnicas.

Elegí trabajar con Antigravity como entorno principal y complementarlo con herramientas especializadas que resuelven problemas concretos del desarrollo asistido por IA.

Mi premisa es sencilla:

**La IA puede acelerar la implementación, pero la responsabilidad sobre el resultado sigue siendo mía.**

Por eso, las herramientas que incorporé buscan tres objetivos:

1. Mejorar la calidad del contexto que recibe el agente.
2. Reducir el tiempo dedicado a tareas mecánicas y búsquedas innecesarias.
3. Aumentar la capacidad de verificar lo que produce la IA.

No pretendo delegar las decisiones de arquitectura, seguridad o integridad financiera. Pretendo utilizar la IA para explorar alternativas, identificar riesgos, implementar soluciones y someterlas a validación.

---

## 2. Instrucciones centrales: AGENTS.md

**Herramienta:** AGENTS.md

Decidí utilizar un archivo central de instrucciones para establecer cómo deben comportarse los agentes dentro del proyecto.

En lugar de repetir mis preferencias y restricciones en cada conversación, definí un conjunto de principios persistentes que orientan el trabajo.

Entre ellos:

- Comprender la implementación existente antes de modificarla.
- Preferir soluciones pequeñas y evitar abstracciones innecesarias.
- Respetar los patrones arquitectónicos existentes.
- No inventar requisitos, interfaces, dependencias ni resultados de pruebas.
- Evitar modificaciones ajenas a la tarea solicitada.
- Verificar los cambios antes de considerarlos terminados.
- No realizar operaciones destructivas de Git sin autorización.

También establecí un protocolo de finalización en el que el agente debe informar qué modificó, qué validaciones ejecutó y qué problemas permanecen pendientes.

**Por qué lo elegí:**

Quería evitar que el comportamiento del agente dependiera exclusivamente de instrucciones improvisadas. Un proyecto necesita consistencia entre sesiones y tareas, especialmente cuando intervienen varios agentes o herramientas.

AGENTS.md funciona como un contrato de trabajo entre el desarrollador y la IA. No reemplaza mi criterio, pero establece las condiciones bajo las cuales permito que el agente trabaje.

---

## 3. Graphify — Comprensión de la arquitectura

**Herramienta:** Graphify

Graphify permite representar las relaciones entre componentes del código mediante un grafo de conocimiento del repositorio.

Lo incorporé porque considero que uno de los problemas del desarrollo asistido por IA es la pérdida de contexto. Cuando un agente necesita comprender un proyecto, puede terminar leyendo demasiados archivos, reconstruyendo relaciones que ya deberían ser conocidas y consumiendo contexto innecesariamente.

Con Graphify busco:

- Consultar relaciones entre módulos.
- Identificar dependencias y conexiones arquitectónicas.
- Comprender cómo se relacionan diferentes componentes.
- Reducir exploraciones repetitivas del repositorio.
- Facilitar el análisis de impacto antes de modificar código.

Definí reglas para que el agente consulte primero el grafo cuando exista y sea pertinente, y lo actualice cuando los cambios afecten la arquitectura, interfaces, dependencias o modelos de datos.

**Por qué lo elegí:**

En un sistema financiero pueden existir múltiples dominios, servicios e integraciones. Entender las relaciones entre ellos es tan importante como comprender cada archivo individualmente.

Graphify busca proporcionar una representación adicional de esa estructura.

---

## 4. Serena — Navegación semántica del código

**Herramienta:** Serena MCP

Incorporé Serena para permitir que el agente interactúe con el código mediante información semántica, en lugar de depender exclusivamente de búsquedas textuales y lecturas completas de archivos.

Entre las capacidades que busco aprovechar están:

- Localización de símbolos.
- Búsqueda de referencias.
- Comprensión de relaciones entre funciones y clases.
- Navegación dirigida por lenguaje.
- Modificaciones más precisas sobre estructuras existentes.

**Por qué lo elegí:**

Una búsqueda textual puede encontrar una función, pero no necesariamente explica cómo se utiliza, qué referencias tiene o qué partes del sistema dependen de ella.

En un proyecto con múltiples módulos, quiero que el agente pueda investigar el impacto de una modificación antes de ejecutarla.

También configuré Serena a nivel de proyecto, evitando inicializar una configuración global innecesaria.

---

## 5. Context7 — Documentación externa y actualizada

**Herramienta:** Context7 MCP

Incorporé Context7 para que el agente pueda consultar documentación técnica de bibliotecas y frameworks cuando sea necesario.

La intención es evitar que las implementaciones dependan exclusivamente de conocimiento aprendido durante el entrenamiento del modelo.

Quiero utilizarlo especialmente para:

- Consultar APIs y documentación oficial.
- Verificar cambios entre versiones.
- Identificar configuraciones recomendadas.
- Investigar comportamientos específicos de bibliotecas.
- Contrastar implementaciones antes de introducir dependencias.

**Por qué lo elegí:**

Los modelos pueden producir código sintácticamente correcto que utiliza APIs obsoletas o comportamientos que no corresponden a la versión instalada.

En ingeniería de software, una respuesta plausible no equivale a una respuesta correcta.

Context7 permite contrastar las propuestas del agente con documentación de referencia.

No considero que una consulta documental sustituya las pruebas de integración ni la lectura de documentación crítica.

---

## 6. Pyright — Verificación estática de Python

**Herramienta:** Pyright

Instalé Pyright como analizador estático de tipos para Python.

Su función dentro del flujo es detectar inconsistencias que pueden pasar inadvertidas durante la generación de código.

Quiero utilizarlo para:

- Detectar incompatibilidades de tipos.
- Identificar errores en asignaciones.
- Verificar contratos entre funciones.
- Reducir errores antes de ejecutar pruebas.
- Comprobar las modificaciones realizadas por el agente.

Definí que, cuando se modifique código Python, el agente debe ejecutar Pyright sobre los archivos pertinentes y corregir los errores encontrados.

**Por qué lo elegí:**

No quiero confundir código que parece correcto con código que cumple los contratos definidos.

La generación de código mediante IA necesita mecanismos independientes de verificación. Pyright proporciona una de esas capas.

---

## 7. RTK — Optimización del consumo de contexto

**Herramienta:** Rust Token Killer (RTK)

Incorporé RTK para reducir el volumen de salida de comandos de terminal que recibe el agente.

Los comandos tradicionales pueden producir grandes cantidades de texto, incluso cuando solo necesitamos conocer un resultado puntual.

RTK permite transformar automáticamente determinados comandos en versiones optimizadas mediante un hook de Antigravity.

Su integración utiliza un evento PreToolUse asociado a las ejecuciones de terminal.

Busco aprovecharlo especialmente en:

- Operaciones de Git.
- Exploración de archivos.
- Consultas de terminal.
- Ejecución de pruebas.
- Inspección de resultados de herramientas compatibles.

**Por qué lo elegí:**

El contexto disponible para un agente es un recurso limitado. No considero eficiente consumirlo con salidas extensas cuando existe una alternativa que conserva la información relevante.

Mi objetivo no es reducir indiscriminadamente la información, sino eliminar ruido sin perder evidencia necesaria para tomar decisiones.

---

## 8. Reglas y workflows especializados

**Herramientas:** reglas locales y workflows de Antigravity.

Además de las instrucciones centrales, incorporé reglas específicas para Graphify y workflows asociados.

La intención es separar las instrucciones generales del proyecto de las instrucciones particulares de una herramienta.

Esto evita convertir AGENTS.md en un documento excesivamente extenso y permite mantener responsabilidades más claras.

Mi criterio es utilizar estas instrucciones de manera selectiva: no todas las tareas necesitan consultar el grafo, investigar documentación externa o ejecutar análisis semánticos.

El agente debe elegir que herramientas utilizar en función del problema que está resolviendo.

---

## 9. Cómo dividí el trabajo en 5 fases

Toda la configuración anterior me sirvió para trabajar por etapas claras, sin mezclar todo al mismo tiempo y sabiendo qué resultado concreto quería dejar listo antes de pasar a la siguiente fase.

### Fase 1: Base de datos y lógica principal del dinero

Antes de pensar en pantallas o rutas web, empecé por el corazón del sistema. En esta etapa definí las tablas principales en PostgreSQL y programé las reglas base para mover dinero: crear usuarios con su cuenta en pesos colombianos sin usar decimales con coma flotante, hacer recargas simuladas, ejecutar transferencias cuidando que dos peticiones simultáneas no gasten el mismo saldo ni se bloqueen entre sí, darle a cada Vaquita su propia cuenta bóveda para guardar el dinero por separado, mantener el historial sin borrar ni editar movimientos viejos y evitar cobros repetidos si una petición se reintenta por error de red.

- **Producto listo al terminar la fase:** El motor financiero funcionando por dentro y la base de datos bien armada, capaz de mover y cuidar la plata de forma segura aunque todavía no tuviera endpoints web ni interfaz visual.

### Fase 2: Rutas de la API y reglas de privacidad

Con la lógica interna resuelta, el siguiente paso fue abrirla hacia afuera con FastAPI para poder usarla desde peticiones HTTP. Aquí armé las rutas para crear y consultar usuarios, cuentas, recargas, transferencias y Vaquitas, asegurándome de que cada operación se guarde completa o se deshaga por completo si algo falla. También implementé aquí la privacidad de las Vaquitas anónimas directamente en el servidor para que la información oculta nunca salga hacia el navegador, junto con validaciones claras de entrada (como el formato de celular colombiano y correos únicos) y llaves cortas estilo `@ABC123` para no depender de identificadores largos.

- **Producto listo al terminar la fase:** Una API funcional y navegable, con validaciones claras, mensajes de error limpios y privacidad protegida desde el servidor.

### Fase 3: Pruebas de estrés y casos límite

Antes de pasar a lo visual quería estar tranquilo de que el sistema resistía los escenarios donde normalmente aparecen fallos con dinero. Armé pruebas automatizadas simulando decenas de operaciones al mismo tiempo: intentar gastar más saldo del disponible con ráfagas paralelas, cruzar transferencias al mismo instante entre dos cuentas, mezclar movimientos entre usuarios y Vaquitas para confirmar que la suma total de dinero no cambie por ningún motivo, e inyectar un fallo a mitad de una transferencia para verificar que todo vuelva atrás sin dejar saldos ni registros rotos.

- **Producto listo al terminar la fase:** Una batería completa de pruebas automatizadas y revisión de tipos que demuestra con resultados reales que el sistema no pierde ni duplica un peso bajo presión.

### Fase 4: Interfaz web ("Vaqui") y arranque con Docker

Aunque el reto no exigía construir una interfaz gráfica, decidí hacerla porque así es mucho más fácil ver y comprobar en tiempo real cómo funciona todo el producto. Construí una web sencilla llamada *Vaqui* con una portada para entrar usando llave corta o crear cuenta, un panel principal con saldo en pesos colombianos, recargas rápidas, transferencias por llave, historial de movimientos y el módulo completo de Vaquitas públicas y anónimas. Al final conecté la base de datos, el backend y el servidor web dentro de Docker Compose para que cualquiera pueda levantarlo sin configuraciones complicadas.

- **Producto listo al terminar la fase:** La aplicación completa corriendo con un solo comando (`docker compose up`), lista para probar todo el flujo en el navegador de principio a fin y mostrarlo en vivo.

### Fase 5: Documentación y cierre del entregable

En la última etapa me concentré en explicar el proyecto con claridad y sin relleno. Redacté el [README.md](../README.md) respondiendo con honestidad los 8 puntos del reto (por qué tomé cada decisión, cómo probé que no se pierde dinero, qué dejé por fuera, qué cambiaría con más tiempo, qué cosas todavía no sé, qué supuestos asumí, cómo trabajé con la IA y qué aprendí), junto con la documentación de apoyo en `docs/` y una guía práctica para grabar el video de demostración.

- **Producto listo al terminar la fase:** Un repositorio ordenado, fácil de entender y bien respaldado para entregarlo y defenderlo con seguridad en la entrevista técnica.
