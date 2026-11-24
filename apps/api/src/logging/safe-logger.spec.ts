import { afterEach, describe, expect, it, vi } from "vitest";
import { SafeLogger } from "./safe-logger.js";

describe("SafeLogger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("redacts credentials and never serializes arbitrary objects", () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    const logger = new SafeLogger();
    logger.log("password=NeverPrintMe token:abc123 Authorization: Bearer ey.secret.value");
    logger.log({ clinicalNarrative: "synthetic but sensitive" });

    const output = writes.join("");
    expect(output).not.toContain("NeverPrintMe");
    expect(output).not.toContain("abc123");
    expect(output).not.toContain("ey.secret.value");
    expect(output).not.toContain("clinicalNarrative");
    expect(output).toContain("[REDACTED]");
  });
});
