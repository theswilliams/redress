// Detects a file's real type from its magic bytes rather than trusting the
// client-supplied MIME type, which is trivially spoofable (e.g. renaming a
// .exe to receipt.pdf and setting Content-Type: application/pdf). Uploaded
// documents are untrusted input — see src/lib/ai/prompts.ts for the
// corresponding defense on the content side.

export type SniffedType = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";

const SIGNATURES: { type: SniffedType; match: (bytes: Buffer) => boolean }[] = [
  { type: "application/pdf", match: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  {
    type: "image/png",
    match: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { type: "image/jpeg", match: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  {
    type: "image/webp",
    match: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

/** Returns the sniffed MIME type based on file content, or null if it doesn't match any allowed signature. */
export function sniffFileType(bytes: Buffer): SniffedType | null {
  for (const { type, match } of SIGNATURES) {
    if (bytes.length >= 12 && match(bytes)) return type;
  }
  return null;
}
