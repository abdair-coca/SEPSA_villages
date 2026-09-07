---
id: "FLOW-002"
title: "Flujo 2: Ejecución y Registro de Corte Efectivo en Terreno"
type: "flow"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../03-features/feature-004-execute-field-cut.md"
  - "../../05-business-rules/BR-004-gps-mandatory-with-bypass.md"
  - "../../05-business-rules/BR-005-photo-evidence-with-bypass.md"
  - "../../07-ui/screens/P-05-cut-execution-modal.md"
---

# FLOW-002: Ejecución y Registro de Corte Efectivo en Terreno

## Objetivo

Asentar formalmente en la plataforma la desconexión material del suministro ejecutada físicamente por la cuadrilla en campo.

## Actor

Liniero / Técnico de Campo.

## Evento Inicial

El liniero abre la ficha `/corte/{id}` (`P-04`) y pulsa el botón rojo "Registrar corte efectivo".

## Precondiciones

Orden en estado `GENERADO` y liniero presente en el punto de suministro.

## Diagrama de Secuencia

```mermaid
sequenceDiagram
    autonumber
    actor Tec as Liniero en Terreno
    participant Ficha as Ficha /corte/{id} (P-04)
    participant Modal as Modal Registro Corte (P-05)
    participant GPS as Dispositivo GPS / Browser API
    participant Core as Backend SEPSA

    Tec->>Ficha: Clic en "Registrar corte efectivo"
    Ficha->>Modal: Despliega Formulario P-05 (técnico autoasignado)
    Tec->>Modal: Clic en "Obtener ubicación"
    Modal->>GPS: Invoca navigator.geolocation.getCurrentPosition()
    alt Permiso Concedido / Coordenada Disponible
        GPS-->>Modal: Retorna Latitud y Longitud WGS84
    else Sin Cobertura GPS o Permiso Denegado
        GPS-->>Modal: Error de geolocalización
        Tec->>Modal: Activa switch: ¿Saltar Control de Coordenadas? = SI
    end
    Tec->>Modal: Ingresa Teléfono de contacto (opcional)
    Tec->>Modal: Selecciona ¿Tiene Medidores Cercanos? (SI / NO)
    Tec->>Modal: Selecciona Tipo de Corte (RED, MEDIDOR, PROTECCION, etc.)
    Tec->>Modal: Digita Lectura del Corte (kWh acumulados)
    alt Sin Cámara / Conexión Débil
        Tec->>Modal: Activa switch: ¿Saltar Control de Fotos? = SI
    end
    Tec->>Modal: Clic en botón "Registrar corte efectivo"
    Modal->>Core: POST /api/v1/cortes/{id}/ejecutar (payload técnico)
    Core->>Core: Persiste EJECUCION_CORTE y transiciona orden a EJECUTADO
    Core-->>Ficha: Actualiza vista y badge de estado a EJECUTADO
```

## Casos de Prueba Derivados (TDD)

- `TC-FLOW-002-01`: Registro exitoso con captura normal de GPS y lectura.
- `TC-FLOW-002-02`: Registro exitoso utilizando bypass de GPS (`saltar_control_coordenadas = SI`).
- `TC-FLOW-002-03`: Registro exitoso utilizando bypass de fotos (`saltar_control_fotos = SI`).
- `TC-FLOW-002-04`: Rechazo de guardado si la lectura del medidor no es numérica.
