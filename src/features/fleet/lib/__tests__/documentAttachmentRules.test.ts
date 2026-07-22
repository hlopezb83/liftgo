import { describe, expect, it } from "vitest";
import { DOC_MAX_BYTES, isAllowedDocument, partitionFiles } from "../documentAttachmentRules";

describe("documentAttachmentRules", () => {
  it("accepts pdf and image types under 5MB", () => {
    expect(isAllowedDocument({ type: "application/pdf", size: 1024 })).toBe(true);
    expect(isAllowedDocument({ type: "image/png", size: DOC_MAX_BYTES })).toBe(true);
    expect(isAllowedDocument({ type: "image/jpeg", size: 1 })).toBe(true);
  });

  it("rejects other mime types and oversize files", () => {
    expect(isAllowedDocument({ type: "text/plain", size: 10 })).toBe(false);
    expect(isAllowedDocument({ type: "application/zip", size: 10 })).toBe(false);
    expect(isAllowedDocument({ type: "application/pdf", size: DOC_MAX_BYTES + 1 })).toBe(false);
  });

  it("partitions files into accepted and rejected", () => {
    const files = [
      { type: "application/pdf", size: 100 },
      { type: "image/png", size: 100 },
      { type: "text/plain", size: 100 },
      { type: "application/pdf", size: DOC_MAX_BYTES + 1 },
    ];
    const { accepted, rejected } = partitionFiles(files);
    expect(accepted).toHaveLength(2);
    expect(rejected).toHaveLength(2);
  });
});
