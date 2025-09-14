import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

type ValidationRule = {
  required?: boolean;
  type?: "string" | "number" | "date";
  options?: string[];
  min?: number;
  max?: number;
  decimal?: number;
  unit?: string;
};

const expectedHeaders = [
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

const validations: Record<string, ValidationRule> = {
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

// Datum aus Excel
function parseExcelDate(value: any): Date | null {
  if (!value) return null;
  // Falls es bereits ein Date-Objekt ist
  if (!value) return null;
  if (value instanceof Date) return value;
  // Excel speichert Daten als serielle Zahlen -> Umrechnung in JS Date
  if (typeof value === "number") {
    return new Date((value - 25569) * 86400 * 1000);
  }
  // Falls es ein String im Format "dd.mm.yyyy" ist
  if (typeof value === "string") {
    const parts = value.split(".");
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      if (d && m && y) {
        const date = new Date(y, m - 1, d); // Date erstellen
        return date.getDate() === d && date.getMonth() === m - 1 ? date : null; // Validierung des Datums, z.B. 31.02.2020 ist ungültig
      }
    }
  }
  return null;
}

// Prüfung auf leer
function isEmpty(value: any): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (typeof value === "string" && value.trim() === "")
  );
}

export async function POST(req: NextRequest) {
  try {
    const fileBuffer = Buffer.from(await req.arrayBuffer());
    const workbook = XLSX.read(fileBuffer, {
      type: "buffer",
      cellDates: false, // Wichtig: auf false setzen, damit Excel die Daten als Strings liefert
      dateNF: "dd.mm.yyyy", // Erwartetes Datumsformat
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length === 0) {
      return NextResponse.json({ error: "Excel ist leer" }, { status: 400 });
    }

    const actualHeaders = rows[0] as string[];
    const headerMap: Record<string, number> = {};
    const missingHeaders: string[] = [];

    // Header-Validierung
    expectedHeaders.forEach((header) => {
      const index = actualHeaders.indexOf(header);
      if (index === -1) {
        missingHeaders.push(header);
      } else {
        headerMap[header] = index;
      }
    });

    if (missingHeaders.length > 0) {
      return NextResponse.json(
        {
          error: "Fehlende Spalten",
          details: [
            {
              row: 1,
              errors: missingHeaders.map((h) => `Spalte "${h}" fehlt`),
            },
          ],
        },
        { status: 400 }
      );
    }

    const data: Record<string, any>[] = [];
    const errors: Array<{
      row: number;
      column: string;
      message: string;
    }> = [];

    // Prüfung der Zeilen
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowObj: Record<string, any> = {};

      for (const header of expectedHeaders) {
        const rawValue = row[headerMap[header]];
        let value = rawValue;

        const rules = validations[header];
        if (rules) {
          // Pflichtfeld-Prüfung
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

            // Optionen-Prüfung
            if (rules.options) {
              const normalizedValue = String(rawValue).toLowerCase().trim();
              const normalizedOptions = rules.options.map((opt) =>
                opt.toLowerCase()
              );

              if (!normalizedOptions.includes(normalizedValue)) {
                errors.push({
                  row: i + 1,
                  column: header,
                  message: `Muss einer der Werte sein: ${rules.options.join(
                    ", "
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
      return NextResponse.json(
        {
          error: "Validierung fehlgeschlagen",
          validationErrors: errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: "Upload erfolgreich",
      data,
      summary: `${data.length} Zeilen erfolgreich validiert`,
    });
  } catch (err: any) {
    console.error("Serverfehler:", err);
    return NextResponse.json(
      { error: "Serverfehler", details: err.message },
      { status: 500 }
    );
  }
}
