import type { WorkPackage, WorkPackageEnvelope } from "../../domain/types";

/**
 * Marca de confianza solo para demostración: no es autenticidad criptográfica.
 * Reemplazar por el contrato de firma/checksum de SEPSA cuando exista.
 */
export function simulatedPackageChecksum(workPackage: WorkPackage): string {
  const canonical = JSON.stringify({
    packageId: workPackage.packageId,
    technicianId: workPackage.technicianId,
    deviceId: workPackage.deviceId,
    version: workPackage.version,
    downloadedAt: workPackage.downloadedAt,
    orders: workPackage.orders,
  });
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `SIMULATED-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** Envuelve un paquete simulado con su checksum para que `savePackage` pueda validarlo. */
export function createSimulatedPackageEnvelope(workPackage: WorkPackage): WorkPackageEnvelope {
  return {
    packageId: workPackage.packageId,
    package: structuredClone(workPackage),
    authenticity: "SIMULATED",
    integrity: "SIMULATED",
    validation: "SIMULATED_VALID",
    checksum: simulatedPackageChecksum(workPackage),
  };
}

/** El paquete está marcado como simulado válido y su checksum coincide con el contenido. */
export function isValidSimulatedPackage(envelope: WorkPackageEnvelope): boolean {
  if (!envelope || !envelope.package || !Array.isArray(envelope.package.orders)) return false;
  return (
    envelope.authenticity === "SIMULATED" &&
    envelope.integrity === "SIMULATED" &&
    envelope.validation === "SIMULATED_VALID" &&
    envelope.checksum === simulatedPackageChecksum(envelope.package)
  );
}
