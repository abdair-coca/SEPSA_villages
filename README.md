# SEPSA · Sistema de operaciones eléctricas

Piloto offline-first para administrar órdenes de corte, asignarlas a técnicos y registrar trabajo de campo con autorización, persistencia local y trazabilidad.

## Empezar

Lee [docs/PROJECT.md](docs/PROJECT.md) y [docs/RULES.md](docs/RULES.md). Luego consulta solo el feature y el código relacionados. La documentación anterior está en [docs/archive/](docs/archive/README.md).

## Estado actual

- `field-app/`: React + TypeScript + PWA; administración y jornada técnica.
- `backend/`: API REST y PostgreSQL del piloto provisional.
- Modo local/simulado sin `VITE_PILOT_BACKEND_URL`; modo conectado con backend configurado.
- La API oficial de SEPSA aún no está integrada.

## Ejecutar frontend

```powershell
cd field-app
npm install
npm run dev
```

## Ejecutar backend

Configura `DATABASE_URL` desde `backend/.env.example` y ejecuta:

```powershell
cd backend
npm install
npm run dev
```

Consulta `backend/README.md` solo para bootstrap o migraciones del piloto.
