import * as XLSX from "xlsx";
import * as ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { uploadUploadFile } from "@/lib/minio";

// Types
type CellValue = string | number | boolean | Date | null | undefined;
type SheetRow = CellValue[];
type DataObject = Record<string, CellValue>;

// vereinheitlichen von Strings zum Vergleich
const normalize = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .toLowerCase();

function readLists(workbook: XLSX.WorkBook) {
  const sheet = workbook.Sheets["List"];

  // No List sheet → return empty object; list validation will be skipped
  if (!sheet) return {};

  const rows: SheetRow[] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
  }) as SheetRow[];

  const headers = rows[0] as string[];

  if (!headers || headers.length === 0) return {};

  const lists: Record<string, Set<string>> = {};

  for (let c = 0; c < headers.length; c++) {
    const name = normalize(headers[c]);

    const set = new Set<string>();

    for (let r = 1; r < rows.length; r++) {
      const value = rows[r][c];

      if (value) {
        set.add(normalize(value));
      }
    }
    lists[name] = set;
  }
  return lists;
}

//Prüfung der Listen

function inList(lists: Record<string, Set<string>>, listName: string) {
  const set = lists[normalize(listName)];

  // No List sheet or no matching column → accept any non-empty string
  if (!set) {
    return z.string().min(1);
  }

  return z
    .string()
    .min(1)
    .refine((v) => set.has(normalize(v)), {
      message: `Value not found in List sheet: ${listName}`,
    });
}

//Zod Schema

function buildSchema(lists: Record<string, Set<string>>) {
  return z
    .object({
      country: inList(lists, "country"),
      river_name: z.coerce
        .string({ message: "River name must be a text value" })
        .min(1, { message: "River name is required" }),
      year: z.coerce
        .number({ message: "Year must be a number" })
        .int({ message: "Year must be a whole number" })
        .min(1990, { message: "Year must be between 1990 and 2100" })
        .max(2100, { message: "Year must be between 1990 and 2100" }),
      data_provider: z.coerce
        .string({ message: "Data provider must be a text value" })
        .min(1, { message: "Data provider is required" }),
      approval_required: z.enum(["yes", "no"], {
        message: "Approval must be 'yes' or 'no'",
      }),
      source: z.coerce
        .string({ message: "Source must be a text value" })
        .min(1, { message: "Source is required" }),
      project: z.coerce
        .string({ message: "Project name must be a text value" })
        .max(150, {
          message: "Project name must be less than 150 characters long",
        }),
      site_name: z.coerce
        .string({ message: "Site name must be a text value" })
        .min(1, { message: "Site name is required" }),
      date: z.coerce.date({ message: "Invalid date format" }),
      fishing_district: z.coerce
        .string({ message: "Fishing district must be a text value" })
        .optional(),
      preclassification_stressor: z.coerce
        .string({ message: "Preclassification stressor must be a text value" })
        .optional(),
      landmark_up: z
        .union([
          z.coerce.string({ message: "Landmark up must be a text value" }),
          z.coerce.number(),
        ])
        .refine((v) => String(v).length <= 100, {
          message: "Landmark up must be at most 100 characters long",
        })
        .optional(),
      lat_up: z.coerce.number({ message: "Latitude up must be a number" }),
      long_up: z.coerce.number({ message: "Longitude up must be a number" }),
      landmark_down: z
        .union([
          z.coerce.string({ message: "Landmark down must be a text value" }),
          z.coerce.number(),
        ])
        .refine((v) => String(v).length <= 100, {
          message: "Landmark down must be at most 100 characters long",
        })
        .optional(),
      lat_down: z.coerce
        .number({ message: "Latitude down must be a number" })
        .optional(),
      long_down: z.coerce
        .number({ message: "Longitude down must be a number" })
        .optional(),
      length_site: z.coerce
        .number({ message: "Length site must be a number" })
        .optional(),
      width_site: z.coerce
        .number({ message: "Width site must be a number" })
        .optional(),
      temp: z.coerce
        .number({ message: "Temperature must be a number" })
        .optional(),
      conductivity: z.coerce
        .number({ message: "Conductivity must be a number" })
        .min(50, { message: "Conductivity must be at least 50" })
        .max(1500, { message: "Conductivity must be at most 1500" })
        .optional(),
      pH_value: z.coerce
        .number({ message: "pH value must be a number" })
        .min(0, { message: "pH value must be at least 0" })
        .max(14, { message: "pH value must be at most 14" })
        .optional(),
      ox_cont: z.coerce
        .number({ message: "Oxygen content must be a number" })
        .min(0, { message: "Oxygen content must be at least 0" })
        .max(20, { message: "Oxygen content must be at most 20" })
        .optional(),
      ox_sat: z.coerce
        .number({ message: "Oxygen saturation must be a number" })
        .min(20, { message: "Oxygen saturation must be at least 20" })
        .max(130, { message: "Oxygen saturation must be at most 130" })
        .optional(),
      mean_water_depth: z.coerce
        .number({ message: "Mean water depth must be a number" })
        .optional(),
      discharge: z.coerce
        .number({ message: "Discharge must be a number" })
        .optional(),
      method: inList(lists, "method"),
      sampling_time: inList(lists, "sampling time"),
      assessment: inList(lists, "assessment"),
      anodes: z.coerce
        .number({ message: "Anodes must be a number" })
        .int({ message: "Anodes must be a whole number" })
        .min(1, { message: "Anodes must be at least 1" })
        .max(10, { message: "Anodes must be at most 10" })
        .optional(),
      fished_length: z.coerce
        .number({ message: "Fished length must be a number" })
        .optional(),
      fished_width: z.coerce
        .number({ message: "Fished width must be a number" })
        .optional(),
      type_of_strip: z.coerce
        .string({ message: "Type of strip must be a text value" })
        .optional(),
      habitat: z.coerce
        .string({ message: "Habitat must be a text value" })
        .optional(),
      sample_id: z.coerce
        .string({ message: "Sample ID must be a text value" })
        .optional(),
      fish_id: z.coerce
        .number({ message: "Fish ID must be a number" })
        .int({ message: "Fish ID must be a whole number" })
        .optional(),
      species: inList(lists, "name of species"),
      total_length: z.coerce
        .number({ message: "Total length must be a number" })
        .optional(),
      weight: z.coerce
        .number({ message: "Weight must be a number" })
        .optional(),
      reader_id: z.coerce
        .string({ message: "Reader ID must be a text value" })
        .optional(),
      memory_id: z.coerce
        .number({ message: "Memory ID must be a number" })
        .int({ message: "Memory ID must be a whole number" })
        .optional(),
      pit_dec: z.coerce
        .string({ message: "Pit decimal must be a text value" })
        .optional(),
      pit_hex: z.coerce
        .string({ message: "Pit hex must be a text value" })
        .optional(),
      recapture: z.coerce
        .number({ message: "Recapture must be a number" })
        .int({ message: "Recapture must be a whole number" })
        .min(0, { message: "Recapture must be at least 0" })
        .max(1, { message: "Recapture must be at most 1" })
        .optional(),
      catch_efficiency: z.coerce
        .number({ message: "Catch efficiency must be a number" })
        .min(0, { message: "Catch efficiency must be at least 0" })
        .max(100, { message: "Catch efficiency must be at most 100" })
        .optional(),
      remark_raw_data: z.coerce
        .string({ message: "Remark raw data must be a text value" })
        .optional(),
      remark_import: z.coerce
        .string({ message: "Remark import must be a text value" })
        .optional(),
    })
    .superRefine((data, ctx) => {
      if (normalize(data.country) === "austria") {
        if (data.lat_up < 46 || data.lat_up > 49.1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lat_up"],
            message: "Latitude up must be between 46 and 49.1 when in Austria",
          });
        }

        if (data.long_up < 9.5 || data.long_up > 17.4) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["long_up"],
            message:
              "Longitude up must be between 9.5 and 17.4 when in Austria",
          });
        }
      }
    });
}

export async function processUpload(fileBuffer: Buffer, userId: string) {
  try {
    const workbook = XLSX.read(fileBuffer, {
      type: "buffer",
      cellDates: true,
    });

    const lists = readLists(workbook);
    const rowSchema = buildSchema(lists);

    //DATA Sheet einlesen
    const sheet = workbook.Sheets["DATA"];

    if (!sheet) {
      return {
        success: false,
        error: "DATA sheet missing",
        details: "Required 'DATA' sheet is missing in the Excel file",
        status: 400,
      };
    }

    const rows: SheetRow[] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
    }) as SheetRow[];

    if (!rows || rows.length === 0) {
      return {
        success: false,
        error: "No data found",
        details: "The DATA sheet contains no data",
        status: 400,
      };
    }

    const headers = rows[0] as string[];

    if (!headers || headers.length === 0) {
      return {
        success: false,
        error: "No headers found",
        details: "The DATA sheet contains no column headers",
        status: 400,
      };
    }

    // Prüfe erforderliche Spalten
    const requiredColumns = [
      "country",
      "river_name",
      "year",
      "data_provider",
      "approval_required",
      "source",
      "project",
      "site_name",
      "date",
      "lat_up",
      "long_up",
      "method",
      "sampling_time",
      "assessment",
      "species",
    ];

    const missingColumns = requiredColumns.filter(
      (col) => !headers.includes(col),
    );

    if (missingColumns.length > 0) {
      return {
        success: false,
        error: "Missing required columns",
        details: `Missing required columns: ${missingColumns.join(", ")}`,
        status: 400,
      };
    }

    const errorMap = new Map<string, string>(); // row_column -> message

    //Validierung der Datenzeilen
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // Prüfung ob die Zeile komplett leer ist (alle Werte sind null, undefined oder leere Strings)
      const isEmptyRow = row.every(
        (cell) =>
          cell === null ||
          cell === undefined ||
          (typeof cell === "string" && cell.trim() === ""),
      );

      // Wenn leere Zeile gefunden, stoppe die Validierung
      if (isEmptyRow) {
        break;
      }

      const obj: DataObject = {};

      // Zod Objekt mit den Spaltennamen als Schlüssel und den Zellenwerten als Werte erstellen
      headers.forEach((h: string, idx: number) => {
        obj[h] = row[idx];
      });

      const result = rowSchema.safeParse(obj);

      if (!result.success) {
        // Speichere nur Fehler für Excel-Markierung
        result.error.issues.forEach((issue) => {
          const columnIndex = headers.indexOf(issue.path[0] as string);
          if (columnIndex !== -1) {
            errorMap.set(`${i + 1}_${columnIndex}`, issue.message);
          }
        });
      }
    }

    if (errorMap.size > 0) {
      const excelWorkbook = new ExcelJS.Workbook();

      // Erstelle DATA Worksheet
      const dataWorksheet = excelWorkbook.addWorksheet("DATA");

      // Füge Headers hinzu
      dataWorksheet.addRow(headers);

      // Füge Datenzeilen hinzu
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const isEmptyRow = row.every(
          (cell) =>
            cell === null ||
            cell === undefined ||
            (typeof cell === "string" && cell.trim() === ""),
        );
        if (isEmptyRow) break;

        dataWorksheet.addRow(row);
      }

      // Markiere Fehlerzellen mit rotem Hintergrund und Fehlernachricht als Notiz
      for (const [key, message] of errorMap) {
        const [rowIdx, colIdx] = key.split("_").map(Number);

        const cell = dataWorksheet.getCell(rowIdx, colIdx + 1);
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFF9999" }, // Hellrot
        };
        cell.font = {
          color: { argb: "FFCC0000" }, // Dunkelrot
          bold: true,
        };
        cell.note = message;
      }

      const excelBuffer = await excelWorkbook.xlsx.writeBuffer();

      return {
        success: false,
        error: "Validation failed",
        excelError: true,
        fileBuffer: excelBuffer,
        status: 400,
      };
    }

    // Datei in MinIO speichern
    const filename = `upload_${Date.now()}_${userId}.xlsx`;
    await uploadUploadFile(fileBuffer, filename);

    // Upload-Eintrag in der Datenbank anlegen
    const upload = await prisma.uploads.create({
      data: {
        uploaded_by: userId,
        link: filename,
        state: "UPLOADED",
      },
    });

    return {
      success: true,
      data: {
        processedRows: rows.length - 1,
        upload: {
          id: upload.id,
          link: upload.link,
          state: upload.state,
          note: upload.note,
          createdAt: upload.createdAt,
          updatedAt: upload.updatedAt,
        },
      },
      summary: "Validation finished successfully",
    };
  } catch (error: any) {
    return {
      success: false,
      error: "Server error during file processing",
      details: error.message,
      status: 500,
    };
  }
}
