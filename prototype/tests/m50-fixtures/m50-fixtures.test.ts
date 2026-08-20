import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);

describe("M50 retained alignment ensemble fixtures", () => {
  it("rederives all mappings, pair tables, transforms, metadata, and MVS through Mol*", async () => {
    const result = await execFile(process.execPath, ["tests/m50-fixtures/derive-ensemble.mjs"], {
      cwd: process.cwd(),
    });
    expect(result.stdout).toContain("M50 ensemble fixture audit passed");
  });
});
