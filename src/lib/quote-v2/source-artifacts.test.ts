import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sourceArtifactLock from "./source-artifacts.lock.json";

const sourceDirectories = (process.env.QUOTE_V2_SOURCE_DIR ?? "")
  .split(path.delimiter)
  .filter(Boolean);

function locate(fileName: string): string | null {
  for (const directory of sourceDirectories) {
    const candidate = path.join(directory, fileName);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

describe.skipIf(sourceDirectories.length === 0)(
  "quote V2 external immutable source vault",
  () => {
    it("hashes every actual vendor artifact and matches the source lock", () => {
      expect(sourceArtifactLock.artifacts).toHaveLength(13);
      for (const artifact of sourceArtifactLock.artifacts) {
        const filePath = locate(artifact.fileName);
        expect(filePath, `${artifact.fileName} must exist in the source vault`).not.toBeNull();
        if (!filePath) continue;
        expect(statSync(filePath).size, `${artifact.fileName} byte length`).toBe(
          artifact.byteLength,
        );
        expect(
          createHash("sha256")
            .update(readFileSync(filePath))
            .digest("hex"),
          `${artifact.fileName} SHA-256`,
        ).toBe(artifact.sha256);
      }
    });
  },
);
