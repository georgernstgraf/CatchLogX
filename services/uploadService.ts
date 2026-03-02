import * as XLSX from "xlsx";
import fs from "fs";
import { prisma } from "@/lib/prisma";

type ValidationRule = {
  required?: boolean;
  type?: "string" | "number" | "date";
  options?: string[];
  min?: number;
  max?: number;
  decimal?: number;
  unit?: string;
};

export const expectedHeaders = [
  "site_code",
  "river_name",
  "year",
  "data_provider/contact person",
  "ask Data provider before use",
  "source",
  "project",
  "site_name",
  "catchdate",
  "Fishing authority",
  "Preclassification Stressor",
  "landmark_up",
  "latitude",
  "longitude",
  "landmark_down",
  "lat_down",
  "long_down",
  "locality_length",
  "temp",
  "conductivity",
  "pH_value",
  "ox_cont",
  "ox_sat",
  "method",
  "assessment",
  "sampling strategy",
  "anodes",
  "Number of Subsections",
  "Length Subsection [m]",
  "Width Subsection [m]",
  "Type of strip",
  "Habitat",
  "Run/Strip",
  "Fish ID",
  "species",
  "length [mm]",
  "Total weight [gr]",
  "Catch Efficiency [%]",
  "remark raw data",
  "remark import",
  "Import",
  "Import date",
];

export const validations: Record<string, ValidationRule> = {
  site_code: { required: true, type: "string" },
  river_name: { required: true, type: "string" },
  year: { required: true, type: "number", decimal: 0 },
  "data_provider/contact person": { required: true, type: "string" },
  "ask Data provider before use": {
    required: true,
    type: "string",
    options: ["yes", "no"],
  },
  source: { required: true, type: "string" },
  project: { required: true, type: "string" },
  site_name: { required: true, type: "string" },
  catchdate: { required: true, type: "date" },
  "Fishing authority": { type: "string" },
  "Preclassification Stressor": {
    type: "string",
    options: ["hydropeaking", "residual flow", "head of impoundment"],
  },
  landmark_up: { type: "string" },
  landmark_down: { type: "string" },
  locality_length: { type: "number", decimal: 2, unit: "m" },
  temp: { type: "number", decimal: 2, unit: "°C", min: 0.1 },
  conductivity: { type: "number", min: 0, max: 50000, unit: "µS/cm" },
  pH_value: { type: "number", min: 0, max: 14, decimal: 1 },
  ox_cont: { type: "number", min: 0, max: 200, unit: "%" },
  ox_sat: { type: "number", min: 0, max: 20, unit: "mg/L" },
  method: {
    required: true,
    type: "string",
    options: [
      "Boat",
      "Boat large",
      "Boat small",
      "bottomtrawl",
      "drift net",
      "e-bottomtrawl",
      "fish trap",
      "gillnet",
      "longline",
      "Multimesh-Gillnet",
      "trammelnet",
      "visual sighting",
      "Wading",
    ],
  },
  assessment: {
    required: true,
    type: "string",
    options: [
      "1 Run + FE%",
      "DeLury",
      "Mark/Recapture",
      "qualitative",
      "quantitative",
      "Seber-LeCren",
      "Shoreline strips",
      "Strip",
    ],
  },
  "sampling strategy": {
    required: true,
    type: "string",
    options: ["whole", "partialprop"],
  },
  anodes: { type: "number", min: 0, max: 10 },
  "Number of Subsections": { type: "number" },
  "Length Subsection [m]": { type: "number", decimal: 2, unit: "m" },
  "Width Subsection [m]": { type: "number", decimal: 2, unit: "m" },
  "Type of strip": { type: "string" },
  Habitat: { type: "string" },
  "Run/Strip": { type: "string" },
  "Fish ID": { type: "number" },
  species: { required: true, type: "string" },
  "length [mm]": { required: true, type: "number", decimal: 0, unit: "mm" },
  "Total weight [gr]": { type: "number", decimal: 2, unit: "g" },
  "Catch Efficiency [%]": {
    type: "number",
    min: 0,
    max: 100,
    decimal: 0,
    unit: "%",
  },
  "remark raw data": { type: "string" },
  "remark import": { type: "string" },
  Import: { required: true, type: "string" },
  "Import date": { required: true, type: "date" },
};

export function parseExcelDate(value: any): Date | null {
  if (!value) return null;
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    return new Date((value - 25569) * 86400 * 1000);
  }
  if (typeof value === "string") {
    const parts = value.split(".");
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      if (d && m && y) {
        const date = new Date(y, m - 1, d);
        return date.getDate() === d && date.getMonth() === m - 1 ? date : null;
      }
    }
  }
  return null;
}

export function isEmpty(value: any): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (typeof value === "string" && value.trim() === "")
  );
}

export async function processUpload(fileBuffer: Buffer, cookieHeader: string) {
  const workbook = XLSX.read(fileBuffer, {
    type: "buffer",
    cellDates: false,
    dateNF: "dd.mm.yyyy",
  });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (rows.length === 0) {
    return { success: false, status: 400, error: "Excel ist leer" };
  }

  const actualHeaders = rows[0] as string[];
  const headerMap: Record<string, number> = {};
  const missingHeaders: string[] = [];

  expectedHeaders.forEach((header) => {
    const index = actualHeaders.indexOf(header);
    if (index === -1) {
      missingHeaders.push(header);
    } else {
      headerMap[header] = index;
    }
  });

  if (missingHeaders.length > 0) {
    return {
      success: false,
      status: 400,
      error: "Fehlende Spalten",
      details: [
        {
          row: 1,
          errors: missingHeaders.map((h) => `Spalte "${h}" fehlt`),
        },
      ],
    };
  }

  const data: Record<string, any>[] = [];
  const errors: Array<{
    row: number;
    column: string;
    message: string;
  }> = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowObj: Record<string, any> = {};

    for (const header of expectedHeaders) {
      const rawValue = row[headerMap[header]];
      let value = rawValue;

      const rules = validations[header];
      if (rules) {
        if (rules.required && isEmpty(rawValue)) {
          errors.push({
            row: i + 1,
            column: header,
            message: `Pflichtfeld nicht ausgefüllt`,
          });
        }

        if (!isEmpty(rawValue)) {
          if (rules.type === "number") {
            const num = Number(rawValue);
            if (isNaN(num)) {
              errors.push({
                row: i + 1,
                column: header,
                message: `Muss eine Zahl sein (Wert: "${rawValue}")`,
              });
            } else {
              if (rules.min !== undefined && num < rules.min) {
                errors.push({
                  row: i + 1,
                  column: header,
                  message: `Wert darf nicht kleiner als ${rules.min} sein (Wert: ${num})`,
                });
              }
              if (rules.max !== undefined && num > rules.max) {
                errors.push({
                  row: i + 1,
                  column: header,
                  message: `Wert darf nicht größer als ${rules.max} sein (Wert: ${num})`,
                });
              }
              if (rules.decimal !== undefined) {
                const decimals = (String(num).split(".")[1] || "").length;
                if (decimals > rules.decimal) {
                  errors.push({
                    row: i + 1,
                    column: header,
                    message: `Darf maximal ${rules.decimal} Nachkommastellen haben (Wert: ${num})`,
                  });
                }
              }
            }
          }

          if (rules.type === "string" && typeof rawValue !== "string") {
            errors.push({
              row: i + 1,
              column: header,
              message: `Muss ein Text sein (Typ: ${typeof rawValue})`,
            });
          }

          if (rules.type === "date" && !isEmpty(rawValue)) {
            const parsedDate = parseExcelDate(rawValue);
            if (!parsedDate || isNaN(parsedDate.getTime())) {
              errors.push({
                row: i + 1,
                column: header,
                message: `Muss ein gültiges Datum sein (Wert: "${rawValue}")`,
              });
            } else {
              value = parsedDate.toISOString().split("T")[0];
            }
          }

          if (rules.options) {
            const normalizedValue = String(rawValue).toLowerCase().trim();
            const normalizedOptions = rules.options.map((opt) =>
              opt.toLowerCase(),
            );

            if (!normalizedOptions.includes(normalizedValue)) {
              errors.push({
                row: i + 1,
                column: header,
                message: `Muss einer der Werte sein: ${rules.options.join(
                  ", ",
                )} (Wert: "${rawValue}")`,
              });
            }
          }
        }
      }
      rowObj[header] = value;
    }

    if (!errors.some((e) => e.row === i + 1)) {
      data.push(rowObj);
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      status: 400,
      error: "Validierung fehlgeschlagen",
      validationErrors: errors,
    };
  }

  const uploadsDir = "./uploads";
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const sessionResponse = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/session`,
    {
      method: "GET",
      headers: {
        Cookie: cookieHeader,
      },
    },
  );

  const sessionData = await sessionResponse.json();
  console.log("Session response:", sessionData);

  if (!sessionData.authenticated || !sessionData.user?.id) {
    return {
      success: false,
      status: 401,
      error: "Nicht authentifiziert oder User-ID fehlt",
    };
  }

  const username = sessionData.user.username || sessionData.user.name || "user";

  const fileName = `${username}_${timestamp}.xlsx`;
  const filePath = `${uploadsDir}/${fileName}`;

  fs.writeFileSync(filePath, fileBuffer);
  console.log("Datei gespeichert:", filePath);

  try {
    const uploadRecord = await prisma.uploads.create({
      data: {
        link: filePath,
        state: "UPLOADED",
        user: {
          connect: {
            id: sessionData.user.id,
          },
        },
      },
    });
    console.log("DB-Eintrag erstellt:", uploadRecord.id);
  } catch (error) {
    console.error("DB-Fehler:", error);
    return {
      success: false,
      status: 500,
      error: "Fehler beim Eintragen der Informationen in der Datenbank",
      details: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    success: true,
    data,
    summary: `${data.length} Zeilen erfolgreich validiert`,
  };
}
