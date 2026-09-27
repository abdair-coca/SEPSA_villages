# Especificación: Captura de campo

## Propósito

Registrar lectura, ubicación, evidencia y datos técnicos observados durante la visita.

## Requisitos

### Requisito: Lectura final

El registro normal de corte DEBE (MUST) conservar lectura final, medidor asociado, unidad y timestamp. Sin lectura, el sistema NO DEBE (MUST NOT) confirmar ejecución hasta que SEPSA defina un procedimiento excepcional. La validación numérica exacta queda como `TODO: VALIDAR CON SEPSA`.

#### Escenario: Lectura registrada

- GIVEN una visita con medidor identificado
- WHEN el Técnico registra la lectura final
- THEN el sistema conserva valor, unidad, medidor y timestamp
- AND los asocia con orden y visita

#### Escenario: Lectura ausente

- GIVEN que no se obtuvo lectura
- WHEN el Técnico intenta confirmar el corte
- THEN el sistema bloquea la confirmación
- AND permite conservar la visita sin afirmar ejecución

### Requisito: Georreferenciación con excepción controlada

El registro de corte DEBE (MUST) capturar latitud y longitud WGS84, precisión disponible y timestamp. Si no puede obtener coordenadas, DEBE (MUST) requerir activación explícita de `saltar_control_coordenadas` y auditarla. NO DEBE (MUST NOT) inventar coordenadas. El umbral de precisión queda como `TODO: VALIDAR CON SEPSA`.

#### Escenario: GPS disponible

- GIVEN permisos y ubicación disponibles
- WHEN el Técnico obtiene ubicación
- THEN persiste coordenadas, precisión y timestamp
- AND vincula la captura con orden, Técnico y dispositivo

#### Escenario: Excepción GPS

- GIVEN coordenadas no disponibles
- WHEN el Técnico activa explícitamente el bypass
- THEN el sistema registra excepción, actor y timestamp
- AND no inventa ubicación

### Requisito: Evidencia con excepción controlada

El registro normal DEBE (MUST) asociar evidencia fotográfica con orden, Técnico, dispositivo y fecha. Si no puede obtenerse, DEBE (MUST) requerir activación explícita de `saltar_control_fotos` y justificación no vacía. Las imágenes JPEG o PNG mayores a 5 megapíxeles DEBEN (MUST) optimizarse localmente antes de persistirse.

#### Escenario: Evidencia registrada

- GIVEN una fotografía válida
- WHEN el Técnico confirma la captura
- THEN el sistema conserva evidencia y metadatos asociados

#### Escenario: Excepción fotográfica

- GIVEN evidencia no disponible
- WHEN el Técnico activa explícitamente el bypass
- THEN el sistema exige y audita una justificación no vacía, actor y timestamp
- AND permite continuar sin afirmar que existe fotografía

### Requisito: Datos técnicos de ejecución

El sistema DEBE (MUST) registrar tipo de corte y presencia de medidores cercanos. El tipo DEBE (MUST) pertenecer al catálogo confirmado `RED`, `MEDIDOR`, `BARRAS`, `PROTECCION`, `ACOMETIDA` o `FUSIBLES`; un valor distinto NO DEBE (MUST NOT) aceptarse como ejecución válida.

#### Escenario: Datos técnicos válidos

- GIVEN una orden elegible
- WHEN el Técnico selecciona tipo de corte e indica medidores cercanos
- THEN el sistema asocia ambos datos con la ejecución

#### Escenario: Tipo desconocido

- GIVEN un tipo fuera del catálogo disponible
- WHEN se intenta confirmar la ejecución
- THEN el sistema rechaza el dato
- AND conserva la visita sin afirmar corte

### Requisito: Separación de visita, corte y pago

Una visita sin ejecución NO DEBE (MUST NOT) afirmar corte. El flujo técnico NO DEBE (MUST NOT) recibir, registrar ni confirmar pagos presenciales.

#### Escenario: Visita bloqueada

- GIVEN una visita sin autorización válida
- WHEN el Técnico guarda el resultado
- THEN el sistema registra visita sin ejecución
- AND no ofrece acciones de cobro
