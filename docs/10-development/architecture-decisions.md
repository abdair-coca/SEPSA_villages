---
title: "Decisiones de Arquitectura Técnica (Rebuild SEPSA)"
type: "development"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "sdd-workflow.md"
  - "tdd-workflow.md"
  - "../../06-data-model/data-model-overview.md"
---

# Decisiones de Arquitectura Técnica (Rebuild SEPSA)

## 1. Stack Tecnológico Recomendado

- **Frontend**: Single Page Application (React / Vue / Angular) con capacidades de **Progressive Web App (PWA)** y Service Worker para soporte offline de cuadrillas en campo.
- **Backend**: Arquitectura de Monolito Modular o Microservicios (Node.js/TypeScript, .NET Core o Spring Boot).
- **Base de Datos Transaccional y Espacial**: PostgreSQL 15+ con extensión **PostGIS** para almacenamiento y consultas topológicas nativas de redes eléctricas.
- **Integración Reactiva de Cobros**: Broker de Mensajería (RabbitMQ o Redis Pub/Sub) o Webhooks para emitir eventos de recaudación en tiempo real y disparar la anulación automática ([BR-003](../../05-business-rules/BR-003-concurrent-payment-cancellation.md)).

## 2. Endpoints REST Obligatorios

```http
### Jerarquía Territorial
GET  /api/v1/territorio/areas
GET  /api/v1/territorio/localidades?area_id={id}
GET  /api/v1/territorio/rutas?localidad_id={id}

### Morosidad y Emisión
POST /api/v1/morosidad/consultar
     Body: { "ruta_codigo": "002", "min_facturas": 2, "estado_cliente": "A" }

POST /api/v1/ordenes/crear-lote
     Body: { "cuentas": [306040, 306043] }

### Gestión de Órdenes
GET  /api/v1/cortes/pendientes?page=1&limit=20&search={medidor/cuenta}
GET  /api/v1/cortes/{id}

### Ejecución en Terreno
POST /api/v1/cortes/{id}/ejecutar
     Body: {
       "tipo_corte": "PROTECCION",
       "lectura_corte": 1234.0,
       "medidores_cercanos": false,
       "latitud": -19.589366,
       "longitud": -65.259119,
       "saltar_control_coordenadas": false,
       "saltar_control_fotos": false
     }

POST /api/v1/cortes/{id}/adjuntos
     Multipart/form-data: file (máx 20MB)

### Integración Concurrente de Pagos
POST /api/v1/integracion/pago-notificado
     Body: { "cuenta_id": 1702690, "fecha_pago": "2026-09-02T16:20:13Z", "monto": 66.82 }
```
