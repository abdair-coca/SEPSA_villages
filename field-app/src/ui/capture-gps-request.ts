/** Owns the browser GPS request used by the capture wizard. */
export function createCaptureGpsRequest() {
  let generation = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function invalidate(): void {
    generation += 1;
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
  }

  return {
    invalidate,
    start(geolocation: Pick<Geolocation, "getCurrentPosition">, onPosition: PositionCallback, onFailure: () => void) {
      invalidate();
      const requestGeneration = generation;
      const finish = (callback: () => void) => {
        if (requestGeneration !== generation) return;
        invalidate();
        callback();
      };
      const fail = () => finish(onFailure);
      timeout = setTimeout(fail, 15_000);
      try {
        geolocation.getCurrentPosition((position) => finish(() => onPosition(position)), fail, { timeout: 15_000 });
      } catch {
        fail();
      }
    },
  };
}
