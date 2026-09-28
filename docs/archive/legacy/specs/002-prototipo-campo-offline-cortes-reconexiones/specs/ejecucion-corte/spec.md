# Especificación: Ejecución de corte

## Propósito

Registrar cortes autorizados preservando seguridad operativa, evidencia y durabilidad local.

## Requisitos

### Requisito: Elegibilidad del corte

El sistema DEBE (MUST) permitir ejecución solo para una orden asignada al técnico, en estado `GENERADO` y con autorización online consumida para esa operación. NO DEBE (MUST NOT) ejecutar si falta cualquiera de estas condiciones. Una orden solo puede tener una ejecución reclamada.

#### Escenario: Orden elegible

- GIVEN una orden `GENERADO` asignada al técnico
- AND una autorización online consumida para esa operación
- WHEN el técnico inicia el registro de corte
- THEN el sistema permite completar la ejecución

#### Escenario: Condición inválida

- GIVEN una orden ajena, con otro estado o sin autorización vigente
- WHEN el técnico intenta ejecutarla
- THEN el sistema bloquea el corte y muestra una acción posible

#### Escenario: Segunda ejecución concurrente

- GIVEN una orden cuya ejecución ya fue reclamada
- WHEN otra sesión intenta ejecutarla
- THEN el sistema bloquea la segunda ejecución

### Requisito: Datos de ejecución

El sistema DEBE (MUST) registrar visita, tipo de corte, justificación y evidencia fotográfica, salvo excepción explícita justificada. DEBE (MUST) aceptar JPEG o PNG y reducir localmente imágenes mayores a 5 megapíxeles antes de guardarlas. El técnico NO DEBE (MUST NOT) registrar cobros ni lecturas de medidor dentro de este flujo.

#### Escenario: Evidencia registrada

- GIVEN una orden elegible y una fotografía válida
- WHEN el técnico confirma los datos de ejecución
- THEN el sistema conserva evidencia optimizada y datos asociados a la orden

#### Escenario: Excepción fotográfica

- GIVEN que el técnico no puede adjuntar evidencia
- WHEN usa el control de excepción
- THEN el sistema exige justificación antes de permitir continuar
- AND acepta texto no vacío hasta definir catálogo en `TODO: VALIDAR CON SEPSA`

### Requisito: GPS no asumido

GPS queda fuera de este prototipo hasta validar obligatoriedad, precisión y tratamiento con SEPSA. El sistema NO DEBE (MUST NOT) solicitar, exigir ni inventar coordenadas para ejecutar el flujo actual.

#### Escenario: Regla GPS pendiente

- GIVEN que GPS está fuera del alcance confirmado
- WHEN el técnico registra el corte
- THEN el prototipo permite continuar sin capturar ubicación
- AND identifica la política futura como `TODO: VALIDAR CON SEPSA`

### Requisito: Persistencia antes del éxito

Al confirmar un corte, el sistema DEBE (MUST) persistir localmente la operación y transicionar la orden a `EJECUTADO` antes de mostrar éxito. El estado de sincronización DEBE (MUST) quedar separado como `pending`.

#### Escenario: Confirmación durable

- GIVEN datos válidos y autorización consumida
- WHEN el técnico confirma el corte
- THEN la operación se persiste localmente con identificador único
- AND la orden queda `EJECUTADO` con sincronización `pending`

#### Escenario: Fallo local

- GIVEN que la persistencia local falla
- WHEN el técnico confirma
- THEN el sistema no informa éxito ni marca la orden como ejecutada

### Requisito: Recuperación e incertidumbre

Una ejecución confirmada localmente DEBE (MUST) sobrevivir cierre o reinicio. Un resultado remoto incierto NO DEBE (MUST NOT) provocar repetición automática del corte físico.

#### Escenario: Reinicio posterior

- GIVEN un corte persistido localmente
- WHEN la aplicación se cierra y vuelve a abrir
- THEN conserva operación, evidencia y estado de sincronización

#### Escenario: Confirmación remota incierta

- GIVEN un envío sin respuesta concluyente
- WHEN el sistema recupera conectividad
- THEN consulta el resultado por identificador antes de intentar reenviar
