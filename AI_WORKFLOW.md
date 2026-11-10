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

El agente debe elegir las herramientas en función del problema que está resolviendo.

---

## 9. Cómo pretendo utilizar este entorno

La configuración no tiene valor si no se traduce en una metodología de trabajo.

Para este reto, quiero seguir un flujo similar al siguiente:

### Fase 1. Comprensión

- Analizar los requisitos del reto.
- Identificar restricciones y supuestos.
- Consultar el estado del proyecto.
- Investigar documentación cuando sea necesario.
- Identificar riesgos técnicos y financieros.

### Fase 2. Diseño

- Evaluar alternativas arquitectónicas con ayuda de la IA.
- Comparar ventajas y desventajas.
- Definir contratos e interfaces.
- Identificar escenarios de fallo.
- Tomar personalmente las decisiones finales.

### Fase 3. Implementación

- Dividir el trabajo en tareas pequeñas.
- Pedir a la IA implementaciones acotadas.
- Revisar los cambios antes de continuar.
- Aprovechar Serena y Graphify cuando exista código suficiente.
- Evitar dependencias y abstracciones injustificadas.

### Fase 4. Validación

- Ejecutar pruebas relevantes.
- Utilizar Pyright para código Python.
- Verificar contratos e invariantes.
- Investigar errores con documentación cuando sea necesario.
- No aceptar como evidencia una afirmación del propio agente.

### Fase 5. Revisión

- Evaluar los cambios desde una perspectiva de arquitectura.
- Revisar