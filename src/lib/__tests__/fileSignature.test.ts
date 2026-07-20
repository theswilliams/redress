import { describe, it, expect } from "vitest";
import { sniffFileType } from "@/lib/security/fileSignature";

describe("sniffFileType", () => {
  it("detects a PDF by its magic bytes", () => {
    const bytes = Buffer.from("%PDF-1.4\n%useless junk after header\n");
    expect(sniffFileType(bytes)).toBe("application/pdf");
  });

  it("detects a PNG by its magic bytes", () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(sniffFileType(bytes)).toBe("image/png");
  });

  it("detects a JPEG by its magic bytes", () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffFileType(bytes)).toBe("image/jpeg");
  });

  it("detects a WEBP by its RIFF/WEBP markers", () => {
    const bytes = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]);
    expect(sniffFileType(bytes)).toBe("image/webp");
  });

  it("rejects a file whose declared type doesn't match its content (e.g. a renamed executable)", () => {
    const bytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]); // MZ header
    expect(sniffFileType(bytes)).toBeNull();
  });

  it("rejects a too-short/empty buffer", () => {
    expect(sniffFileType(Buffer.from("hi"))).toBeNull();
  });
});
