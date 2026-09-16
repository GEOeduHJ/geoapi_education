import { describe, expect, it } from "vitest";
import { isLocalHost, resolveVWorldDomain } from "./env";

describe("runtime environment helpers", () => {
  it("recognizes local host variants", () => {
    expect(isLocalHost("localhost")).toBe(true);
    expect(isLocalHost("127.0.0.1")).toBe(true);
    expect(isLocalHost("[::1]")).toBe(true);
    expect(isLocalHost("geoedu.example")).toBe(false);
  });

  it("uses the current browser host so a changed Vite port does not require an env edit", () => {
    expect(resolveVWorldDomain("127.0.0.1")).toBe("127.0.0.1");
    expect(resolveVWorldDomain("localhost")).toBe("localhost");
    expect(resolveVWorldDomain("geoedu.example")).toBe("geoedu.example");
  });
});
