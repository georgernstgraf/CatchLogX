import * as XLSX from "xlsx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the admin service (#112): user management permissions and
// upload approval (reject mail / Excel import into the DB).
// Prisma, MinIO, the mailer and bcrypt are mocked — this file is the
// template for testing I/O-bound services without real infrastructure.
const sendMail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    uploads: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    riverSite: { upsert: vi.fn() },
    sampling: { create: vi.fn() },
    fishSpecies: { findUnique: vi.fn() },
    fishCatch: { findFirst: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/minio", () => ({ downloadUploadFile: vi.fn() }));
vi.mock("@/lib/mailer", () => ({
  createMailerTransporter: vi.fn(() => ({ sendMail })),
}));
vi.mock("bcrypt", () => ({
  default: { hash: vi.fn(async (pw: string) => `hashed:${pw}`) },
}));

import { downloadUploadFile } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import {
  buildRejectEmailHtml,
  createUser,
  deleteUser,
  downloadFile,
  fetchAllData,
  getContentType,
  parseDate,
  toBoolean,
  toFloat,
  toInt,
  updateUpload,
  updateUser,
} from "@/services/adminService";

type Role = "VIEWER" | "ADMIN" | "SUPER_ADMIN";

function actor(role: Role, isActive = true, id = "actor") {
  return { user: { id, username: "actor", role, isActive } };
}

function target(role: Role, isActive = true, id = "target") {
  return { id, username: "target", role, isActive };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
  sendMail.mockResolvedValue({ messageId: "m1" });
  vi.mocked(prisma.user.update).mockImplementation((async ({ data }: any) => ({
    id: "target",
    username: "target",
    ...data,
  })) as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- pure helpers -----------------------------------------------------------

describe("getContentType", () => {
  it("returns the xlsx MIME type", () => {
    expect(getContentType()).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });
});

describe("parseDate", () => {
  it("returns null for empty values", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate(0)).toBeNull();
  });

  it("passes Date objects through", () => {
    const date = new Date("2024-05-01");
    expect(parseDate(date)).toBe(date);
  });

  it("converts Excel serial numbers", () => {
    expect(parseDate(45000)).toEqual(new Date("2023-03-15T00:00:00Z"));
  });

  it("parses German dd.mm.yyyy dates", () => {
    expect(parseDate("01.05.2024")).toEqual(new Date(2024, 4, 1));
  });

  it("parses ISO strings", () => {
    expect(parseDate("2024-05-01T10:00:00Z")).toEqual(
      new Date("2024-05-01T10:00:00Z"),
    );
  });

  it("returns null for garbage", () => {
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate({})).toBeNull();
  });
});

describe("toFloat / toInt", () => {
  it("map empty values to null", () => {
    for (const value of [null, undefined, ""]) {
      expect(toFloat(value)).toBeNull();
      expect(toInt(value)).toBeNull();
    }
  });

  it("parse numbers and numeric strings", () => {
    expect(toFloat("3.75")).toBe(3.75);
    expect(toFloat(2)).toBe(2);
    expect(toInt("12.9")).toBe(12);
  });

  it("stop at a decimal comma (current behaviour)", () => {
    expect(toFloat("3,5")).toBe(3);
  });

  it("return null for non-numeric strings", () => {
    expect(toFloat("abc")).toBeNull();
    expect(toInt("abc")).toBeNull();
  });
});

describe("toBoolean", () => {
  it("understands yes/no case-insensitively", () => {
    expect(toBoolean(" Yes ")).toBe(true);
    expect(toBoolean("NO")).toBe(false);
  });

  it("returns null for anything else", () => {
    for (const value of [null, undefined, "", "true", 1]) {
      expect(toBoolean(value)).toBeNull();
    }
  });
});

describe("buildRejectEmailHtml", () => {
  const upload = {
    id: "up-42",
    createdAt: new Date("2024-05-01T10:00:00Z"),
    note: "Wrong species list",
  } as any;

  it("contains the upload id, the user name and the reason", () => {
    const html = buildRejectEmailHtml(upload, {
      name: "Alice",
      username: "alice",
    });
    expect(html).toContain("up-42");
    expect(html).toContain("Hello <strong>Alice</strong>");
    expect(html).toContain("Wrong species list");
  });

  it("falls back to the username and a default reason", () => {
    const html = buildRejectEmailHtml(
      { ...upload, note: null },
      { name: null, username: "alice" },
    );
    expect(html).toContain("Hello <strong>alice</strong>");
    expect(html).toContain("No specific reason was provided.");
  });
});

// --- simple delegations -----------------------------------------------------

describe("fetchAllData", () => {
  it("returns users and uploads, newest uploads first", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u1" }] as any);
    vi.mocked(prisma.uploads.findMany).mockResolvedValue([{ id: "up1" }] as any);

    expect(await fetchAllData()).toEqual({
      users: [{ id: "u1" }],
      uploads: [{ id: "up1" }],
    });
    expect(vi.mocked(prisma.uploads.findMany).mock.calls[0][0]).toMatchObject({
      orderBy: { createdAt: "desc" },
    });
  });

  it("never selects password hashes", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.uploads.findMany).mockResolvedValue([]);
    await fetchAllData();
    const select = vi.mocked(prisma.user.findMany).mock.calls[0][0]!.select!;
    expect(select).not.toHaveProperty("hashedPassword");
  });
});

describe("downloadFile", () => {
  it("returns the buffer from MinIO", async () => {
    const buffer = Buffer.from("x");
    vi.mocked(downloadUploadFile).mockResolvedValue({
      objectKey: "k",
      fileBuffer: buffer,
    });
    expect(await downloadFile("file.xlsx")).toBe(buffer);
    expect(downloadUploadFile).toHaveBeenCalledWith("file.xlsx");
  });
});

// --- user management --------------------------------------------------------

describe("updateUser", () => {
  function givenTarget(user: ReturnType<typeof target> | null) {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
  }

  it("forbids inactive actors without touching the DB", async () => {
    expect(await updateUser("target", {}, actor("SUPER_ADMIN", false))).toEqual(
      { forbidden: true, reason: "Inactive users cannot manage accounts" },
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns notFound for an unknown user", async () => {
    givenTarget(null);
    expect(await updateUser("x", {}, actor("ADMIN"))).toEqual({
      notFound: true,
    });
  });

  it.each<[string, Role, ReturnType<typeof target>, object, string]>([
    ["a viewer", "VIEWER", target("VIEWER"), {}, "Admin access required"],
    [
      "an admin editing another admin",
      "ADMIN",
      target("ADMIN"),
      {},
      "Admins can only edit viewer accounts",
    ],
    [
      "an admin editing a super admin",
      "ADMIN",
      target("SUPER_ADMIN"),
      {},
      "Admins can only edit viewer accounts",
    ],
    [
      "an admin changing a role",
      "ADMIN",
      target("VIEWER"),
      { role: "ADMIN" },
      "Only super admins can change user roles",
    ],
    [
      "an admin changing activation",
      "ADMIN",
      target("VIEWER"),
      { isActive: false },
      "Only super admins can change activation state",
    ],
  ])("forbids %s", async (_label, role, existing, body, reason) => {
    givenTarget(existing);
    expect(await updateUser("target", body, actor(role))).toEqual({
      forbidden: true,
      reason,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("lets an admin edit a viewer", async () => {
    givenTarget(target("VIEWER"));
    const result = await updateUser(
      "target",
      { name: "New", role: "VIEWER", isActive: true },
      actor("ADMIN"),
    );
    expect(result).toHaveProperty("updatedUser");
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toEqual({
      name: "New",
      isActive: true,
    });
  });

  it("lets an admin edit their own account", async () => {
    givenTarget(target("ADMIN", true, "actor"));
    const result = await updateUser("actor", { name: "Me" }, actor("ADMIN"));
    expect(result).toHaveProperty("updatedUser");
  });

  it("reports a username/e-mail conflict", async () => {
    givenTarget(target("VIEWER"));
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "other" } as any);

    expect(
      await updateUser("target", { username: "taken" }, actor("SUPER_ADMIN")),
    ).toEqual({ conflict: true });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ id: { not: "target" } }, { OR: [{ username: "taken" }] }] },
    });
  });

  it("skips the conflict check when neither username nor e-mail change", async () => {
    givenTarget(target("VIEWER"));
    await updateUser("target", { name: "x" }, actor("SUPER_ADMIN"));
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it.each([{ role: "ADMIN" as const }, { isActive: false }])(
    "protects the last active super admin (%o)",
    async (body) => {
      givenTarget(target("SUPER_ADMIN"));
      vi.mocked(prisma.user.count).mockResolvedValue(1);
      expect(await updateUser("target", body, actor("SUPER_ADMIN"))).toEqual({
        forbidden: true,
        reason: "Cannot demote or deactivate the last active super admin",
      });
    },
  );

  it("allows demoting a super admin when another one is active", async () => {
    givenTarget(target("SUPER_ADMIN"));
    vi.mocked(prisma.user.count).mockResolvedValue(2);
    await updateUser("target", { role: "ADMIN" }, actor("SUPER_ADMIN"));
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toEqual({
      role: "ADMIN",
    });
  });

  it("hashes a new password and forces a password change", async () => {
    givenTarget(target("VIEWER"));
    await updateUser("target", { password: "pw" }, actor("SUPER_ADMIN"));
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toEqual({
      hashedPassword: "hashed:pw",
      isFirstLogin: true,
    });
  });

  it("allows clearing the display name", async () => {
    givenTarget(target("VIEWER"));
    await updateUser("target", { name: "" }, actor("SUPER_ADMIN"));
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toEqual({
      name: "",
    });
  });
});

describe("createUser", () => {
  const body = {
    username: "bob",
    email: "bob@x.at",
    name: "Bob",
    password: "pw",
  };

  it("reports a conflict for an existing username or e-mail", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u1" } as any);
    expect(await createUser(body, "admin")).toEqual({ conflict: true });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("creates an active viewer that must change the password", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "u2" } as any);

    expect(await createUser(body, "admin")).toEqual({ newUser: { id: "u2" } });
    expect(vi.mocked(prisma.user.create).mock.calls[0][0].data).toEqual({
      username: "bob",
      email: "bob@x.at",
      name: "Bob",
      hashedPassword: "hashed:pw",
      role: "VIEWER",
      isActive: true,
      isFirstLogin: true,
    });
  });
});

describe("deleteUser", () => {
  function givenTarget(user: ReturnType<typeof target> | null) {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
  }

  it("forbids inactive actors", async () => {
    expect(await deleteUser("target", actor("SUPER_ADMIN", false))).toEqual({
      forbidden: true,
      reason: "Inactive users cannot delete accounts",
    });
  });

  it("returns notFound for an unknown user", async () => {
    givenTarget(null);
    expect(await deleteUser("x", actor("ADMIN"))).toEqual({ notFound: true });
  });

  it.each([target("VIEWER"), target("ADMIN", false)])(
    "forbids viewers deleting anyone (%o) (#117)",
    async (existing) => {
      givenTarget(existing);
      expect(await deleteUser("target", actor("VIEWER"))).toEqual({
        forbidden: true,
        reason: "Admin access required",
      });
      expect(prisma.user.delete).not.toHaveBeenCalled();
    },
  );

  it("forbids admins deleting active non-viewers", async () => {
    givenTarget(target("ADMIN"));
    expect(await deleteUser("target", actor("ADMIN"))).toEqual({
      forbidden: true,
      reason: "Admins can only delete active viewer accounts",
    });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("lets admins delete inactive accounts of any role", async () => {
    givenTarget(target("ADMIN", false));
    expect(await deleteUser("target", actor("ADMIN"))).toEqual({
      success: true,
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "target" } });
  });

  it("protects the last active super admin", async () => {
    givenTarget(target("SUPER_ADMIN"));
    vi.mocked(prisma.user.count).mockResolvedValue(1);
    expect(await deleteUser("target", actor("SUPER_ADMIN"))).toEqual({
      forbidden: true,
      reason: "Cannot delete the last active super admin",
    });
  });

  it("lets a super admin delete another super admin", async () => {
    givenTarget(target("SUPER_ADMIN"));
    vi.mocked(prisma.user.count).mockResolvedValue(2);
    expect(await deleteUser("target", actor("SUPER_ADMIN"))).toEqual({
      success: true,
    });
  });

  it("lets an admin delete a viewer", async () => {
    givenTarget(target("VIEWER"));
    expect(await deleteUser("target", actor("ADMIN"))).toEqual({
      success: true,
    });
  });
});

// --- upload approval --------------------------------------------------------

describe("updateUpload", () => {
  const upload = {
    id: "up1",
    link: "./upload_1_u1.xlsx",
    state: "UPLOADED",
    uploaded_by: "u1",
    note: null,
    createdAt: new Date("2024-05-01T10:00:00Z"),
    updatedAt: new Date("2024-05-01T10:00:00Z"),
  };

  beforeEach(() => {
    vi.mocked(prisma.uploads.findUnique).mockResolvedValue(upload as any);
    vi.mocked(prisma.uploads.update).mockImplementation((async ({
      data,
    }: any) => ({ ...upload, ...data })) as any);
  });

  /** Data of the last `uploads.update` call (the import result). */
  const finalState = () =>
    vi.mocked(prisma.uploads.update).mock.calls.at(-1)![0].data as {
      state: string;
      note: string | null;
    };

  it("returns null for an unknown upload", async () => {
    vi.mocked(prisma.uploads.findUnique).mockResolvedValue(null);
    expect(await updateUpload("x", "accept", undefined)).toBeNull();
    expect(prisma.uploads.update).not.toHaveBeenCalled();
  });

  describe("reject", () => {
    it("stores the reason and mails the uploader", async () => {
      vi.mocked(prisma.uploads.findFirst).mockResolvedValue({
        user: { email: "u1@x.at", name: "Uwe", username: "u1" },
      } as any);

      const result = await updateUpload("up1", "reject", "Bad data");

      expect(result?.upload).toMatchObject({ state: "REJECTED", note: "Bad data" });
      expect(result?.emailError).toBeUndefined();
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "u1@x.at",
          subject: "Your Upload Has Been Rejected",
        }),
      );
      expect(sendMail.mock.calls[0][0].html).toContain("Bad data");
    });

    it("flags a mail error but keeps the rejection", async () => {
      vi.mocked(prisma.uploads.findFirst).mockResolvedValue({
        user: { email: null },
      } as any);

      const result = await updateUpload("up1", "reject", "Bad data");

      expect(result).toMatchObject({
        upload: { state: "REJECTED" },
        emailError: true,
      });
      expect(sendMail).not.toHaveBeenCalled();
    });

    it("treats every action other than 'accept' as reject", async () => {
      vi.mocked(prisma.uploads.findFirst).mockResolvedValue(null);
      const result = await updateUpload("up1", "whatever", undefined);
      expect(result?.upload.state).toBe("REJECTED");
    });
  });

  describe("accept", () => {
    function givenExcel(rows: Record<string, unknown>[], sheetName = "DATA") {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
      const fileBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      vi.mocked(downloadUploadFile).mockResolvedValue({
        objectKey: "k",
        fileBuffer,
      });
    }

    const newRow = {
      river_name: "Danube",
      site_name: "Site A",
      lat_up: 48.2,
      long_up: 16.3,
      date: "2024-05-01",
      year: 2024,
      approval_required: "yes",
      species: "Brown trout",
      total_length: 250,
      weight: 180.5,
    };

    beforeEach(() => {
      vi.mocked(prisma.riverSite.upsert).mockResolvedValue({ id: 10 } as any);
      let samplingId = 100;
      vi.mocked(prisma.sampling.create).mockImplementation((async () => ({
        id: samplingId++,
      })) as any);
      vi.mocked(prisma.fishSpecies.findUnique).mockResolvedValue({
        id: 5,
      } as any);
      vi.mocked(prisma.fishCatch.findFirst).mockResolvedValue(null);
    });

    it("downloads the file without the leading './'", async () => {
      givenExcel([newRow]);
      await updateUpload("up1", "accept", undefined);
      expect(downloadUploadFile).toHaveBeenCalledWith("upload_1_u1.xlsx");
    });

    it("marks the upload DB_ERROR when the file cannot be read", async () => {
      vi.mocked(downloadUploadFile).mockRejectedValue(new Error("minio down"));
      const result = await updateUpload("up1", "accept", undefined);
      expect(result?.upload.state).toBe("ACCEPTED");
      expect(finalState()).toEqual({
        state: "DB_ERROR",
        note: "Failed to read Excel file.",
      });
    });

    it("marks the upload DB_ERROR when the file has no data rows", async () => {
      givenExcel([{ river_name: null }]);
      await updateUpload("up1", "accept", undefined);
      expect(finalState()).toEqual({
        state: "DB_ERROR",
        note: "Excel file contains no data rows.",
      });
    });

    it("imports new-schema rows and marks the upload SAVED_IN_DB", async () => {
      givenExcel([newRow, { ...newRow, total_length: 300 }]);

      await updateUpload("up1", "accept", undefined);

      const siteCode = "Danube__Site A__48.2__16.3";
      expect(vi.mocked(prisma.riverSite.upsert).mock.calls[0][0]).toMatchObject(
        {
          where: { siteCode },
          create: { siteCode, riverName: "Danube", latitude: 48.2 },
        },
      );
      // Same site + date → one sampling for both catches
      expect(prisma.sampling.create).toHaveBeenCalledOnce();
      expect(
        vi.mocked(prisma.sampling.create).mock.calls[0][0].data,
      ).toMatchObject({
        siteId: 10,
        year: 2024,
        askProviderBeforeUse: true,
        catchDate: new Date("2024-05-01"),
      });
      expect(prisma.fishCatch.create).toHaveBeenCalledTimes(2);
      expect(
        vi.mocked(prisma.fishCatch.create).mock.calls[0][0].data,
      ).toMatchObject({
        samplingId: 100,
        speciesId: 5,
        lengthMm: 250,
        totalWeightGr: 180.5,
        recapture: false,
      });
      expect(finalState()).toEqual({ state: "SAVED_IN_DB", note: null });
    });

    it("creates a new sampling per catch date", async () => {
      givenExcel([newRow, { ...newRow, date: "2024-06-01" }]);
      await updateUpload("up1", "accept", undefined);
      expect(prisma.sampling.create).toHaveBeenCalledTimes(2);
    });

    it("imports legacy rows keyed by site_code", async () => {
      givenExcel([
        {
          site_code: "S1",
          river_name: "Danube",
          catchdate: "01.05.2024",
          species: "Brown trout",
          "length [mm]": 250,
          "PIT DEC": " 999 ",
        },
      ]);

      await updateUpload("up1", "accept", undefined);

      expect(
        vi.mocked(prisma.riverSite.upsert).mock.calls[0][0].where,
      ).toEqual({ siteCode: "S1" });
      expect(
        vi.mocked(prisma.sampling.create).mock.calls[0][0].data.catchDate,
      ).toEqual(new Date(2024, 4, 1));
      expect(
        vi.mocked(prisma.fishCatch.create).mock.calls[0][0].data,
      ).toMatchObject({ lengthMm: 250, pitDec: "999" });
      expect(finalState().state).toBe("SAVED_IN_DB");
    });

    it("collects row errors and marks the upload DB_ERROR", async () => {
      vi.mocked(prisma.fishSpecies.findUnique)
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 5 } as any);
      givenExcel([
        { ...newRow, species: "Nessie" },
        { ...newRow, river_name: "" },
        newRow,
      ]);

      await updateUpload("up1", "accept", undefined);

      expect(prisma.fishCatch.create).toHaveBeenCalledOnce();
      const { state, note } = finalState();
      expect(state).toBe("DB_ERROR");
      expect(note?.split("\n")).toEqual([
        'Row 2: Fish species "Nessie" not found in database, skipping fish catch.',
        "Row 3: Missing river_name, skipping row.",
      ]);
    });

    it("keeps going when a single DB write fails", async () => {
      vi.mocked(prisma.fishCatch.create)
        .mockRejectedValueOnce(new Error("constraint"))
        .mockResolvedValue({} as any);
      givenExcel([newRow, newRow]);

      await updateUpload("up1", "accept", undefined);

      expect(prisma.fishCatch.create).toHaveBeenCalledTimes(2);
      expect(finalState()).toEqual({
        state: "DB_ERROR",
        note: "Row 2: Failed to create FishCatch: constraint",
      });
    });

    describe("recapture detection", () => {
      const recaptureFlags = () =>
        vi
          .mocked(prisma.fishCatch.create)
          .mock.calls.map((call) => call[0].data.recapture);

      it("marks PIT tags occurring twice in the file", async () => {
        givenExcel([
          { ...newRow, pit_dec: "123" },
          { ...newRow, pit_dec: "123" },
          { ...newRow, pit_dec: "456" },
        ]);
        await updateUpload("up1", "accept", undefined);
        expect(recaptureFlags()).toEqual([true, true, false]);
        // Only the unique tag needs a DB lookup
        expect(prisma.fishCatch.findFirst).toHaveBeenCalledOnce();
        expect(prisma.fishCatch.findFirst).toHaveBeenCalledWith({
          where: { pitDec: "456", recapture: false },
          select: { id: true },
        });
      });

      it("marks PIT tags already stored in the DB", async () => {
        vi.mocked(prisma.fishCatch.findFirst).mockResolvedValue({
          id: 1,
        } as any);
        givenExcel([{ ...newRow, pit_dec: "123" }, newRow]);
        await updateUpload("up1", "accept", undefined);
        expect(recaptureFlags()).toEqual([true, false]);
      });
    });
  });
});
