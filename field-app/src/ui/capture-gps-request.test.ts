import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureDraftContent } from "../ports/repository";
import { createCaptureGpsRequest } from "./capture-gps-request";

const position = {
  coords: { latitude: -19.58, longitude: -65.75, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
  timestamp: 1,
} as GeolocationPosition;
const failure = { code: 2, message: "Unavailable" } as GeolocationPositionError;

function controllableGps() {
  const callbacks: Array<{ success: PositionCallback; error: PositionErrorCallback | null | undefined }> = [];
  const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>((success, error) => { callbacks.push({ success, error }); });
  return { geolocation: { getCurrentPosition }, callbacks };
}

describe("capture GPS request lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("accepts the current position once and cancels its timeout", () => {
    const gps = controllableGps();
    const request = createCaptureGpsRequest();
    const success = vi.fn();
    const error = vi.fn();
    request.start(gps.geolocation, success, error);
    gps.callbacks[0].success(position);
    gps.callbacks[0].error?.(failure);
    vi.advanceTimersByTime(15_000);
    expect(success).toHaveBeenCalledExactlyOnceWith(position);
    expect(error).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves typed exception reason when an invalidated GPS callback arrives", () => {
    const gps = controllableGps();
    const request = createCaptureGpsRequest();
    let draft: CaptureDraftContent = { reading: { value: 42 } };
    request.start(gps.geolocation, (value) => {
      draft = { ...draft, location: { latitude: value.coords.latitude, longitude: value.coords.longitude, status: "CAPTURED", recordedAt: "now" }, gpsExceptionReason: undefined };
    }, () => undefined);
    request.invalidate();
    draft = { ...draft, location: undefined, gpsExceptionReason: "No hay señal en el sótano" };
    gps.callbacks[0].success(position);
    expect(draft.gpsExceptionReason).toBe("No hay señal en el sótano");
    expect(draft.location).toBeUndefined();
    expect(draft.reading?.value).toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores success and failure from a superseded request", () => {
    const gps = controllableGps();
    const request = createCaptureGpsRequest();
    const staleSuccess = vi.fn();
    const staleError = vi.fn();
    const success = vi.fn();
    request.start(gps.geolocation, staleSuccess, staleError);
    request.start(gps.geolocation, success, vi.fn());
    gps.callbacks[0].success(position);
    gps.callbacks[0].error?.(failure);
    gps.callbacks[1].success(position);
    expect(staleSuccess).not.toHaveBeenCalled();
    expect(staleError).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledExactlyOnceWith(position);
  });

  it("times out after 15 seconds and allows a fresh attempt, ignoring the late result", () => {
    const gps = controllableGps();
    const request = createCaptureGpsRequest();
    const success = vi.fn();
    const error = vi.fn();
    request.start(gps.geolocation, success, error);
    vi.advanceTimersByTime(14_999);
    expect(error).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(error).toHaveBeenCalledTimes(1);
    request.start(gps.geolocation, success, error);
    gps.callbacks[0].success(position);
    expect(success).not.toHaveBeenCalled();
    gps.callbacks[1].success(position);
    expect(success).toHaveBeenCalledExactlyOnceWith(position);
    expect(gps.geolocation.getCurrentPosition).toHaveBeenLastCalledWith(expect.any(Function), expect.any(Function), { timeout: 15_000 });
  });

  it("invalidates callbacks and timer on wizard cleanup", () => {
    const gps = controllableGps();
    const request = createCaptureGpsRequest();
    const success = vi.fn();
    const error = vi.fn();
    request.start(gps.geolocation, success, error);
    request.invalidate();
    gps.callbacks[0].success(position);
    gps.callbacks[0].error?.(failure);
    vi.advanceTimersByTime(15_000);
    expect(success).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles errors once, ignores subsequent success, and permits retry", () => {
    const gps = controllableGps();
    const request = createCaptureGpsRequest();
    const success = vi.fn();
    const error = vi.fn();
    request.start(gps.geolocation, success, error);
    gps.callbacks[0].error?.(failure);
    gps.callbacks[0].success(position);
    vi.advanceTimersByTime(15_000);
    expect(error).toHaveBeenCalledTimes(1);
    expect(success).not.toHaveBeenCalled();
    request.start(gps.geolocation, success, error);
    gps.callbacks[1].success(position);
    expect(success).toHaveBeenCalledExactlyOnceWith(position);
  });

  it("recovers when the browser throws synchronously", () => {
    const request = createCaptureGpsRequest();
    const error = vi.fn();
    expect(() => request.start({ getCurrentPosition: () => { throw new Error("GPS unavailable"); } }, vi.fn(), error)).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const gps = controllableGps();
    const success = vi.fn();
    request.start(gps.geolocation, success, error);
    gps.callbacks[0].success(position);
    expect(success).toHaveBeenCalledExactlyOnceWith(position);
  });
});
