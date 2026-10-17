import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Pure planning logic for the legacy production adoption (#139). Filesystem
// only - no database, per the test rules in AGENTS.md (#112).
import {
  buildSourceIndex,
  mimeTypeFor,
  normalizeRelativePath,
  planAdoption,
  resolveSource,
  type PlanInput,
} from "@/lib/adoption";

const roots: string[] = [];

/** Build an export tree shaped like `mc mirror` output. */
function makeExport(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "clx-adoption-"));
  roots.push(root);
  for (const file of files) {
    const absolute = join(root, file);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, `content of ${file}`);
  }
  return root;
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("mimeTypeFor", () => {
  it("recognises the workbook formats used by the data set", () => {
    expect(mimeTypeFor("upload_123.xlsx")).toContain("spreadsheetml");
    expect(mimeTypeFor("alt.xls")).toBe("application/vnd.ms-excel");
    expect(mimeTypeFor("export.csv")).toBe("text/csv");
    expect(mimeTypeFor("something.bin")).toBe("application/octet-stream");
  });
});

describe("normalizeRelativePath", () => {
  it("uses forward slashes and strips a leading ./", () => {
    expect(normalizeRelativePath("./CatchLogX/uploads/a.xlsx")).toBe("CatchLogX/uploads/a.xlsx");
  });
});

describe("buildSourceIndex and resolveSource", () => {
  it("finds uploads by base name and templates by their stored path", () => {
    const root = makeExport([
      "CatchLogX/uploads/upload_1_x.xlsx",
      "CatchLogX/dummy_files/20260618134427/template.xlsx",
    ]);
    const index = buildSourceIndex(root);

    expect(index.byRelativePath.size).toBe(2);
    // Uploads store a bare file name in the legacy schema.
    expect(resolveSource(index, "Uploads", "upload_1_x.xlsx")?.relativePath).toBe("CatchLogX/uploads/upload_1_x.xlsx");
    // Templates store the full object key.
    expect(resolveSource(index, "TemplateFiles", "CatchLogX/dummy_files/20260618134427/template.xlsx")?.relativePath).toBe(
      "CatchLogX/dummy_files/20260618134427/template.xlsx",
    );
  });

  it("does not guess when a base name is ambiguous", () => {
    const root = makeExport(["CatchLogX/uploads/a/dup.xlsx", "CatchLogX/uploads/b/dup.xlsx"]);
    expect(resolveSource(buildSourceIndex(root), "Uploads", "dup.xlsx")).toBeUndefined();
  });

  it("returns an empty index for a missing export root", () => {
    const index = buildSourceIndex("/nonexistent/path");
    expect(index.byRelativePath.size).toBe(0);
  });
});

const LEGACY_STATE: Omit<PlanInput, "index" | "uploads" | "templates"> = {
  templateTableExists: true,
  blobTableExists: false,
  blobIdColumnOn: { Uploads: false, TemplateFiles: false },
  legacyColumnsPresent: { Uploads: true, TemplateFiles: true },
  foreignKeysOn: { Uploads: false, TemplateFiles: false },
  notNullOn: { Uploads: false, TemplateFiles: false },
};

const DONE_STATE: Omit<PlanInput, "index" | "uploads" | "templates"> = {
  templateTableExists: false,
  blobTableExists: true,
  blobIdColumnOn: { Uploads: true, TemplateFiles: true },
  legacyColumnsPresent: { Uploads: false, TemplateFiles: false },
  foreignKeysOn: { Uploads: true, TemplateFiles: true },
  notNullOn: { Uploads: true, TemplateFiles: true },
};

describe("planAdoption", () => {
  it("plans the full morph for a legacy database", () => {
    const root = makeExport([
      "CatchLogX/uploads/upload_1_x.xlsx",
      "CatchLogX/dummy_files/20260618134427/template.xlsx",
    ]);
    const plan = planAdoption({
      ...LEGACY_STATE,
      index: buildSourceIndex(root),
      uploads: [{ id: "u1", storedPath: "upload_1_x.xlsx" }],
      templates: [{ id: "t1", storedPath: "CatchLogX/dummy_files/20260618134427/template.xlsx" }],
    });

    expect(plan.renameTemplateTable).toBe(true);
    expect(plan.createBlobTable).toBe(true);
    expect(plan.addBlobIdColumnTo).toEqual(["Uploads", "TemplateFiles"]);
    expect(plan.blobs.map((b) => b.table)).toEqual(["Uploads", "TemplateFiles"]);
    expect(plan.blobs[0].fileName).toBe("upload_1_x.xlsx");
    expect(plan.blobs[1].fileName).toBe("template.xlsx");
    expect(plan.dropColumns).toEqual([
      { table: "Uploads", column: "link" },
      { table: "TemplateFiles", column: "filePath" },
    ]);
    expect(plan.setBlobIdNotNullOn).toEqual(["Uploads", "TemplateFiles"]);
    expect(plan.addForeignKeyTo).toEqual(["Uploads", "TemplateFiles"]);
    expect(plan.missingSources).toEqual([]);
  });

  it("is a no-op on an adopted database", () => {
    const plan = planAdoption({
      ...DONE_STATE,
      index: buildSourceIndex(makeExport([])),
      uploads: [],
      templates: [],
    });

    expect(plan.renameTemplateTable).toBe(false);
    expect(plan.createBlobTable).toBe(false);
    expect(plan.addBlobIdColumnTo).toEqual([]);
    expect(plan.blobs).toEqual([]);
    expect(plan.dropColumns).toEqual([]);
    expect(plan.setBlobIdNotNullOn).toEqual([]);
    expect(plan.addForeignKeyTo).toEqual([]);
  });

  it("keeps only the remaining work when a run was interrupted", () => {
    // Template table already renamed and fully migrated, blob table exists,
    // but the upload rows still reference MinIO and the column shape is legacy.
    const root = makeExport(["CatchLogX/uploads/upload_1_x.xlsx"]);
    const plan = planAdoption({
      ...LEGACY_STATE,
      templateTableExists: false,
      blobTableExists: true,
      legacyColumnsPresent: { Uploads: true, TemplateFiles: false },
      index: buildSourceIndex(root),
      uploads: [{ id: "u1", storedPath: "upload_1_x.xlsx" }],
      templates: [],
    });

    expect(plan.renameTemplateTable).toBe(false);
    expect(plan.createBlobTable).toBe(false);
    expect(plan.blobs).toHaveLength(1);
    expect(plan.dropColumns).toEqual([{ table: "Uploads", column: "link" }]);
  });

  it("refuses to drop a column while a referenced file is missing", () => {
    const plan = planAdoption({
      ...LEGACY_STATE,
      index: buildSourceIndex(makeExport([])),
      uploads: [{ id: "u1", storedPath: "gone.xlsx" }],
      templates: [{ id: "t1", storedPath: "CatchLogX/dummy_files/x/template.xlsx" }],
    });

    expect(plan.missingSources.map((m) => m.rowId)).toEqual(["u1", "t1"]);
    expect(plan.dropColumns).toEqual([]);
    expect(plan.blobs).toEqual([]);
  });
});
