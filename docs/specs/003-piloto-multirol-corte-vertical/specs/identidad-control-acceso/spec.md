# Especificación: Identidad y control de acceso

## Propósito

Controlar autenticación, permisos por rol, aislamiento técnico y auditoría del piloto multirol.

## Requisitos

### Requisito: Identidad y rol operativo

El sistema DEBE (MUST) autenticar cada usuario y asociarlo explícitamente con el rol Administrador o Técnico antes de permitir acceso operativo. Una identidad provisional DEBE (MUST) identificarse como simulación y NO DEBE (MUST NOT) presentarse como autenticación oficial de SEPSA.

#### Escenario: Inicio válido

- GIVEN credenciales válidas y un rol reconocido
- WHEN el usuario inicia sesión
- THEN el sistema concede únicamente los permisos de su rol
- AND registra identidad, fecha y resultado del acceso

#### Escenario: Identidad rechazada

- GIVEN credenciales inválidas o un rol no reconocido
- WHEN el usuario intenta iniciar sesión
- THEN el sistema rechaza el acceso
- AND no expone información operativa

### Requisito: Acceso administrativo completo

El Administrador DEBE (MUST) consultar toda la información operativa y ejecutar todas las funciones incluidas en el piloto. NO DEBE (MUST NOT) acceder a contraseñas, secretos o credenciales técnicas. Cada acción privilegiada DEBE (MUST) validarse mediante la política de acceso autoritativa y no solo mediante controles visuales.

#### Escenario: Consulta administrativa

- GIVEN un Administrador autenticado
- WHEN consulta una orden, usuario técnico o registro del piloto
- THEN obtiene toda la información operativa autorizada
- AND no obtiene secretos ni credenciales técnicas

#### Escenario: Control visual manipulado

- GIVEN un usuario sin permiso para una acción administrativa
- WHEN intenta invocarla fuera de la interfaz normal
- THEN el sistema rechaza la acción
- AND no modifica información operativa

### Requisito: Acceso técnico por asignación

El Técnico DEBE (MUST) consultar y operar únicamente órdenes asignadas a su identidad. Los datos locales DEBEN (MUST) permanecer aislados por Técnico y dispositivo; un cambio de identidad NO DEBE (MUST NOT) revelar el paquete anterior.

#### Escenario: Orden propia

- GIVEN una orden asignada al Técnico autenticado
- WHEN consulta su jornada
- THEN puede acceder a la orden y su contexto operativo

#### Escenario: Orden ajena

- GIVEN una orden asignada a otro Técnico
- WHEN intenta consultarla u operarla
- THEN el sistema rechaza la acción
- AND no registra ejecución física

### Requisito: Auditoría de acceso y acciones

Toda acción administrativa o técnica DEBE (MUST) registrar actor, rol, fecha, entidad afectada y resultado. Una acción rechazada DEBE (MUST) conservar su causa sin registrar secretos.

#### Escenario: Acción denegada

- GIVEN una acción fuera del permiso del usuario
- WHEN el usuario intenta ejecutarla
- THEN el sistema bloquea la acción
- AND registra actor, entidad, causa y resultado rechazado
