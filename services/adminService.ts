import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import * as XLSX from "xlsx";
import { Uploads } from "@/app/generated/prisma";
import { downloadUploadFile } from "@/lib/minio";
import { createMailerTransporter } from "@/lib/mailer";

export async function fetchAllData() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });
  const uploads = await prisma.uploads.findMany({
    select: {
      id: true,
      link: true,
      state: true,
      uploaded_by: true,
      note: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return { uploads, users };
}

export function getContentType(): string {
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

export async function downloadFile(filename: string) {
  const { fileBuffer } = await downloadUploadFile(filename);
  return fileBuffer;
}

async function sendRejectEmail(upload: Uploads) {
  const transporter = createMailerTransporter("admin-reject-upload");

  const uploadWithUserInfo = await prisma.uploads.findFirst({
    where: {
      id: upload.id,
    },
    include: {
      user: true,
    },
  });

  const userEmail = uploadWithUserInfo?.user.email;

  if (!userEmail) {
    throw new Error(`No user email found for upload ${upload.id}`);
  }

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(upload.createdAt));

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Upload Rejected</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#e74c3c,#c0392b);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:0.5px;">Upload Rejected</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">CatchLogX Notification</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 20px;color:#2d2d2d;font-size:15px;line-height:1.6;">
                Hello <strong>${uploadWithUserInfo?.user.name ?? uploadWithUserInfo?.user.username}</strong>,
              </p>
              <p style="margin:0 0 28px;color:#555555;font-size:15px;line-height:1.6;">
                We regret to inform you that your recent upload has been reviewed and <strong style="color:#e74c3c;">rejected</strong> by our administration team. Please find the details below.
              </p>

              <!-- Upload Details Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fdf3f3;border:1px solid #f5c6c6;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px 28px;">
                    <h2 style="margin:0 0 16px;color:#c0392b;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Upload Details</h2>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#888888;font-size:13px;width:140px;vertical-align:top;">Upload ID</td>
                        <td style="padding:6px 0;color:#2d2d2d;font-size:13px;font-family:monospace;word-break:break-all;">${upload.id}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top:1px solid #f0d0d0;padding:0;"></td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#888888;font-size:13px;vertical-align:top;">Submitted At</td>
                        <td style="padding:6px 0;color:#2d2d2d;font-size:13px;">${formattedDate}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Rejection Reason -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff8e1;border-left:4px solid #f39c12;border-radius:4px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;color:#b7770d;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Reason for Rejection</p>
                    <p style="margin:0;color:#4a4a4a;font-size:14px;line-height:1.7;">
                      ${upload.note ?? "No specific reason was provided."}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#555555;font-size:14px;line-height:1.6;">
                If you believe this decision was made in error or have any questions, please contact your administrator directly.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9f9f9;border-top:1px solid #eeeeee;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#aaaaaa;font-size:12px;line-height:1.6;">
                This is an automated message from <strong>CatchLogX</strong>. Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const mailResult = await transporter.sendMail({
    from: `"CatchLogX" <${process.env.NODEMAILER_USER}>`,
    to: userEmail,
    subject: "Your Upload Has Been Rejected",
    html: htmlBody,
  });

  console.info(
    `[admin] Rejection email sent for upload=${upload.id} to=${userEmail}. messageId=${mailResult.messageId}`,
  );
}

async function acceptUploadAndPushToDb(upload: Uploads) {
  const objectName = upload.link.replace(/^\.\//, "");

  let rows: Record<string, any>[];

  try {
    const { fileBuffer } = await downloadUploadFile(objectName);
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.Sheets["DATA"] ? "DATA" : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const allRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
    });
    // Filter trailing/empty rows where every value is null, undefined, or blank
    rows = allRows.filter((row) =>
      Object.values(row).some(
        (v) => v !== null && v !== undefined && String(v).trim() !== "",
      ),
    );
  } catch (error) {
    console.error(
      "[acceptUploadAndPushToDb] Failed to read Excel file:",
      error,
    );
    await prisma.uploads.update({
      where: { id: upload.id },
      data: { state: "DB_ERROR", note: "Failed to read Excel file." },
    });
    throw new Error("Failed to read Excel file.");
  }

  if (rows.length === 0) {
    await prisma.uploads.update({
      where: { id: upload.id },
      data: { state: "DB_ERROR", note: "Excel file contains no data rows." },
    });
    throw new Error("Excel file contains no data rows.");
  }

  console.log(
    `[acceptUploadAndPushToDb] Processing ${rows.length} rows from ${objectName}`,
  );

  function parseDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === "number") {
      return new Date((value - 25569) * 86400 * 1000);
    }
    if (typeof value === "string") {
      const parts = value.split(".");
      if (parts.length === 3) {
        const [d, m, y] = parts.map(Number);
        if (d && m && y) return new Date(y, m - 1, d);
      }
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  function toFloat(value: any): number | null {
    if (value === null || value === undefined || value === "") return null;
    const n = parseFloat(String(value));
    return isNaN(n) ? null : n;
  }

  function toInt(value: any): number | null {
    if (value === null || value === undefined || value === "") return null;
    const n = parseInt(String(value), 10);
    return isNaN(n) ? null : n;
  }

  function toBoolean(value: any): boolean | null {
    if (value === null || value === undefined) return null;
    const str = String(value).toLowerCase().trim();
    if (str === "yes") return true;
    if (str === "no") return false;
    return null;
  }

  const errors: string[] = [];
  let processedRows = 0;
  const samplingMap = new Map<string, number>();

  // Detect whether this is a legacy file (has site_code column) or the new schema
  const hasLegacySiteCode = rows.length > 0 && "site_code" in rows[0];

  console.log(
    `[acceptUploadAndPushToDb] Schema detected: ${hasLegacySiteCode ? "legacy (site_code)" : "new (no site_code)"}`,
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    // --- Site Code resolution ---
    let siteCode: string;
    if (hasLegacySiteCode) {
      const raw = row["site_code"];
      if (!raw) {
        errors.push(`Row ${rowNum}: Missing site_code, skipping row.`);
        continue;
      }
      siteCode = String(raw);
    } else {
      // New schema: derive a deterministic synthetic site code so re-imports
      // of the same site don't create duplicates.
      const riverName = String(row["river_name"] ?? "").trim();
      if (!riverName) {
        errors.push(`Row ${rowNum}: Missing river_name, skipping row.`);
        continue;
      }
      const siteName = String(row["site_name"] ?? "").trim();
      const latUp = String(row["lat_up"] ?? "").trim();
      const longUp = String(row["long_up"] ?? "").trim();
      siteCode = `${riverName}__${siteName}__${latUp}__${longUp}`;
    }

    // --- RiverSite upsert ---
    let riverSite;
    try {
      if (hasLegacySiteCode) {
        riverSite = await prisma.riverSite.upsert({
          where: { siteCode },
          create: {
            siteCode,
            riverName: String(row["river_name"] ?? ""),
            siteName: row["site_name"] ? String(row["site_name"]) : null,
            landmarkUp: row["landmark_up"] ? String(row["landmark_up"]) : null,
            latitude: toFloat(row["latitude"]),
            longitude: toFloat(row["longitude"]),
            landmarkDown: row["landmark_down"]
              ? String(row["landmark_down"])
              : null,
            latDown: toFloat(row["lat_down"]),
            longDown: toFloat(row["long_down"]),
            localityLength: toFloat(row["locality_length"]),
            localityWidth: toFloat(row["locality_width"]),
          },
          update: {
            riverName: String(row["river_name"] ?? ""),
            siteName: row["site_name"] ? String(row["site_name"]) : null,
            landmarkUp: row["landmark_up"] ? String(row["landmark_up"]) : null,
            latitude: toFloat(row["latitude"]),
            longitude: toFloat(row["longitude"]),
            landmarkDown: row["landmark_down"]
              ? String(row["landmark_down"])
              : null,
            latDown: toFloat(row["lat_down"]),
            longDown: toFloat(row["long_down"]),
            localityLength: toFloat(row["locality_length"]),
            localityWidth: toFloat(row["locality_width"]),
          },
        });
      } else {
        // New schema: lat_up/long_up → latitude/longitude, length_site/width_site → localityLength/Width
        riverSite = await prisma.riverSite.upsert({
          where: { siteCode },
          create: {
            siteCode,
            riverName: String(row["river_name"] ?? ""),
            siteName: row["site_name"] ? String(row["site_name"]) : null,
            landmarkUp: row["landmark_up"] ? String(row["landmark_up"]) : null,
            latitude: toFloat(row["lat_up"]),
            longitude: toFloat(row["long_up"]),
            landmarkDown: row["landmark_down"]
              ? String(row["landmark_down"])
              : null,
            latDown: toFloat(row["lat_down"]),
            longDown: toFloat(row["long_down"]),
            localityLength: toFloat(row["length_site"]),
            localityWidth: toFloat(row["width_site"]),
          },
          update: {
            riverName: String(row["river_name"] ?? ""),
            siteName: row["site_name"] ? String(row["site_name"]) : null,
            landmarkUp: row["landmark_up"] ? String(row["landmark_up"]) : null,
            latitude: toFloat(row["lat_up"]),
            longitude: toFloat(row["long_up"]),
            landmarkDown: row["landmark_down"]
              ? String(row["landmark_down"])
              : null,
            latDown: toFloat(row["lat_down"]),
            longDown: toFloat(row["long_down"]),
            localityLength: toFloat(row["length_site"]),
            localityWidth: toFloat(row["width_site"]),
          },
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `[acceptUploadAndPushToDb] Row ${rowNum}: Failed to upsert RiverSite (siteCode: ${siteCode}): ${msg}`,
      );
      errors.push(`Row ${rowNum}: Failed to upsert RiverSite: ${msg}`);
      continue;
    }

    // --- Sampling key & creation ---
    const catchDate = hasLegacySiteCode
      ? parseDate(row["catchdate"])
      : parseDate(row["date"]);
    const samplingKey = `${siteCode}|${catchDate?.toISOString() ?? "null"}`;

    let samplingId: number;
    if (samplingMap.has(samplingKey)) {
      samplingId = samplingMap.get(samplingKey)!;
    } else {
      try {
        const sampling = await prisma.sampling.create({
          data: hasLegacySiteCode
            ? {
                siteId: riverSite.id,
                year: toInt(row["year"]) ?? new Date().getFullYear(),
                catchDate,
                dataProvider: row["data_provider/contact person"]
                  ? String(row["data_provider/contact person"])
                  : null,
                askProviderBeforeUse: toBoolean(
                  row["ask Data provider before use"],
                ),
                source: row["source"] ? String(row["source"]) : null,
                project: row["project"] ? String(row["project"]) : null,
                fishingAuthority: row["Fishing authority"]
                  ? String(row["Fishing authority"])
                  : null,
                preclassificationStressor: row["Preclassification Stressor"]
                  ? String(row["Preclassification Stressor"])
                  : null,
                temp: toFloat(row["temp"]),
                conductivity: toFloat(row["conductivity"]),
                pHValue: toFloat(row["pH_value"]),
                oCont: toFloat(row["ox_cont"]),
                oSat: toFloat(row["ox_sat"]),
                method: row["method"] ? String(row["method"]) : null,
                assessment: row["assessment"]
                  ? String(row["assessment"])
                  : null,
                samplingStrategy: row["sampling strategy"]
                  ? String(row["sampling strategy"])
                  : null,
                anodes: toInt(row["anodes"]),
                numSubsections: toInt(row["Number of Subsections"]),
                lengthSubsection: toFloat(row["Length Subsection [m]"]),
                widthSubsection: toFloat(row["Width Subsection [m]"]),
                typeOfStrip: row["Type of strip"]
                  ? String(row["Type of strip"])
                  : null,
                habitat: row["Habitat"] ? String(row["Habitat"]) : null,
                runStrip: row["Run/Strip"] ? String(row["Run/Strip"]) : null,
                catchEfficiency: toFloat(row["Catch Efficiency [%]"]),
                remarksRawData: row["remark raw data"]
                  ? String(row["remark raw data"])
                  : null,
                remarkImport: row["remark import"]
                  ? String(row["remark import"])
                  : null,
              }
            : {
                // New schema column names
                siteId: riverSite.id,
                year: toInt(row["year"]) ?? new Date().getFullYear(),
                catchDate,
                dataProvider: row["data_provider"]
                  ? String(row["data_provider"])
                  : null,
                askProviderBeforeUse: toBoolean(row["approval_required"]),
                source: row["source"] ? String(row["source"]) : null,
                project: row["project"] ? String(row["project"]) : null,
                fishingAuthority: row["fishing_district"]
                  ? String(row["fishing_district"])
                  : null,
                preclassificationStressor: row["preclassification_stressor"]
                  ? String(row["preclassification_stressor"])
                  : null,
                temp: toFloat(row["temp"]),
                conductivity: toFloat(row["conductivity"]),
                pHValue: toFloat(row["pH_value"]),
                oCont: toFloat(row["ox_cont"]),
                oSat: toFloat(row["ox_sat"]),
                method: row["method"] ? String(row["method"]) : null,
                assessment: row["assessment"]
                  ? String(row["assessment"])
                  : null,
                samplingStrategy: row["sampling_time"]
                  ? String(row["sampling_time"])
                  : null,
                anodes: toInt(row["anodes"]),
                numSubsections: null,
                lengthSubsection: toFloat(row["fished_length"]),
                widthSubsection: toFloat(row["fished_width"]),
                typeOfStrip: row["type_of_strip"]
                  ? String(row["type_of_strip"])
                  : null,
                habitat: row["habitat"] ? String(row["habitat"]) : null,
                runStrip: null,
                catchEfficiency: toFloat(row["catch_efficiency"]),
                remarksRawData: row["remark_raw_data"]
                  ? String(row["remark_raw_data"])
                  : null,
                remarkImport: row["remark_import"]
                  ? String(row["remark_import"])
                  : null,
              },
        });
        samplingId = sampling.id;
        samplingMap.set(samplingKey, samplingId);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(
          `[acceptUploadAndPushToDb] Row ${rowNum}: Failed to create Sampling: ${msg}`,
        );
        errors.push(`Row ${rowNum}: Failed to create Sampling: ${msg}`);
        continue;
      }
    }

    const speciesName = row["species"];
    if (!speciesName) {
      errors.push(`Row ${rowNum}: Missing species, skipping fish catch.`);
      continue;
    }

    let fishSpecies;
    try {
      fishSpecies = await prisma.fishSpecies.findUnique({
        where: { speciesName: String(speciesName) },
      });
      if (!fishSpecies) {
        errors.push(
          `Row ${rowNum}: Fish species "${speciesName}" not found in database, skipping fish catch.`,
        );
        continue;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `[acceptUploadAndPushToDb] Row ${rowNum}: Failed to find FishSpecies (${speciesName}): ${msg}`,
      );
      errors.push(`Row ${rowNum}: Failed to lookup fish species: ${msg}`);
      continue;
    }

    try {
      await prisma.fishCatch.create({
        data: {
          samplingId,
          speciesId: fishSpecies.id,
          fishId: hasLegacySiteCode
            ? row["Fish ID"]
              ? String(row["Fish ID"])
              : null
            : row["fish_id"]
              ? String(row["fish_id"])
              : null,
          lengthMm: toInt(
            hasLegacySiteCode ? row["length [mm]"] : row["total_length"],
          ),
          totalWeightGr: toFloat(
            hasLegacySiteCode ? row["Total weight [gr]"] : row["weight"],
          ),
        },
      });
      processedRows++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `[acceptUploadAndPushToDb] Row ${rowNum}: Failed to create FishCatch: ${msg}`,
      );
      errors.push(`Row ${rowNum}: Failed to create FishCatch: ${msg}`);
    }
  }

  console.log(
    `[acceptUploadAndPushToDb] Done. ${processedRows}/${rows.length} fish catches inserted.`,
  );

  if (errors.length > 0) {
    console.warn(
      `[acceptUploadAndPushToDb] ${errors.length} non-fatal error(s):`,
      errors,
    );
  }

  await prisma.uploads.update({
    where: { id: upload.id },
    data: {
      state: errors.length > 0 ? "DB_ERROR" : "SAVED_IN_DB",
      note: errors.length > 0 ? errors.join("\n") : null,
    },
  });
}

export async function updateUpload(
  id: string,
  action: string,
  reason: string | undefined,
): Promise<{ upload: Uploads; emailError?: boolean } | null> {
  const upload = await prisma.uploads.findUnique({
    where: { id },
    select: { id: true, link: true, state: true },
  });

  if (!upload) {
    return null;
  }

  const newState = action === "accept" ? "ACCEPTED" : "REJECTED";

  const updatedUpload = await prisma.uploads.update({
    where: { id },
    data: {
      note: reason,
      state: newState,
      updatedAt: new Date(),
    },
  });

  if (newState === "REJECTED") {
    try {
      await sendRejectEmail(updatedUpload);
      return { upload: updatedUpload };
    } catch (error) {
      console.error("[updateUpload] Failed to send reject email:", error);
      return { upload: updatedUpload, emailError: true };
    }
  }

  if (newState === "ACCEPTED") {
    try {
      await acceptUploadAndPushToDb(updatedUpload);
    } catch (error) {
      console.error("[updateUpload] Error processing Excel file:", error);
    }
  }

  return { upload: updatedUpload };
}

export async function updateUser(
  id: string,
  body: {
    username?: string;
    email?: string;
    name?: string;
    role?: string;
    password?: string;
  },
  sessionData: { user: { id: string; username: string } },
) {
  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true },
  });

  if (!existingUser) {
    return { notFound: true };
  }

  if (
    existingUser.role === "admin" &&
    existingUser.id !== sessionData.user.id
  ) {
    return { forbidden: true };
  }

  const { username, email, name, role, password } = body;

  if (username || email) {
    const conflictUser = await prisma.user.findFirst({
      where: {
        AND: [
          { id: { not: id } },
          {
            OR: [
              ...(username ? [{ username }] : []),
              ...(email ? [{ email }] : []),
            ],
          },
        ],
      },
    });

    if (conflictUser) {
      return { conflict: true };
    }
  }

  const updateData: any = {};
  if (username) updateData.username = username;
  if (email) updateData.email = email;
  if (name !== undefined) updateData.name = name;
  if (role && role !== existingUser.role) {
    updateData.role = role;
  }
  if (password) {
    updateData.hashedPassword = await bcrypt.hash(password, 10);
    updateData.isFirstLogin = true;
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  console.log(
    `[ADMIN] User updated by ${sessionData.user.username}:`,
    updatedUser.username,
  );

  return { updatedUser };
}

export async function createUser(
  body: {
    username: string;
    email: string;
    name?: string;
    password: string;
  },
  adminUsername: string,
) {
  const { username, email, name, password } = body;

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ username: username }, { email: email }],
    },
  });

  if (existingUser) {
    return { conflict: true };
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await prisma.user.create({
    data: {
      username,
      email,
      name,
      hashedPassword,
      role: "viewer",
      isFirstLogin: true,
    },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  console.log(`[ADMIN] User created by ${adminUsername}:`, newUser.username);

  return { newUser };
}

export async function deleteUser(id: string, adminUsername: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true },
  });

  if (!user) {
    return { notFound: true };
  }

  if (user.role === "admin") {
    return { forbidden: true };
  }

  await prisma.user.delete({
    where: { id },
  });

  console.log(`[ADMIN] User deleted by ${adminUsername}:`, user.username);

  return { success: true };
}
