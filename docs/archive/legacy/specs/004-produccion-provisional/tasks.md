# Tareas: Backend provisional productivo

- [x] Crear paquete `backend` TypeScript con servidor REST y configuración por entorno.
- [x] Crear migraciones PostgreSQL para usuarios, sesiones, deudores, órdenes, reservas, operaciones y auditoría.
- [x] Implementar autenticación provisional con hash seguro, sesiones revocables y expiración.
- [x] Implementar RBAC, asignación, control de versiones e idempotencia en servidor.
- [x] Implementar reserva/consumo one-use de autorización de corte.
- [x] Implementar endpoint de sincronización y recuperación por `operation_id`.
- [x] Conectar adapter HTTP del `field-app` conservando puertos offline.
- [x] Agregar Docker Compose, variables de entorno, migraciones y healthcheck.
- [ ] Agregar pruebas de contrato, integración, seguridad y reinicio.
- [ ] Validar flujo contra datos demo antes de cualquier dato SEPSA real.
- [ ] Definir carga y verificación server-side de evidencia fotográfica antes de producción real.
