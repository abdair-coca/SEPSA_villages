import { describe, expect, it } from "vitest";
import { isUncertainError, ResponseLostError, TimeoutError } from "./authorization";

describe("isUncertainError", () => {
  it("accepts timeout, lost response and network-unknown errors by code or name", () => {
    expect(isUncertainError(new TimeoutError())).toBe(true);
    expect(isUncertainError(new ResponseLostError())).toBe(true);
    expect(isUncertainError(Object.assign(new Error("sin conexión"), { code: "NETWORK_UNKNOWN" }))).toBe(true);
    expect(isUncertainError(Object.assign(new Error("x"), { code: "TIMEOUT" }))).toBe(true);
    expect(isUncertainError(Object.assign(new Error("x"), { code: "RESPONSE_LOST" }))).toBe(true);
    expect(isUncertainError(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe(true);
  });

  it("does not classify errors from their message text", () => {
    expect(isUncertainError(new Error("timeout"))).toBe(false);
    expect(isUncertainError(new Error("network failure"))).toBe(false);
    expect(isUncertainError(new Error("unknown state"))).toBe(false);
    expect(isUncertainError(new Error("response was lost"))).toBe(false);
  });

  it("does not classify values that are not errors", () => {
    expect(isUncertainError(undefined)).toBe(false);
    expect(isUncertainError(null)).toBe(false);
    expect(isUncertainError("TIMEOUT")).toBe(false);
    expect(isUncertainError({ code: "NOT_AUTHORIZED" })).toBe(false);
  });
});
