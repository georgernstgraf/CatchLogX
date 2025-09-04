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

const expectedHeaders = ["site_code", "river_name", "year", "data_provider/contact person", "ask Data provider before use", "source", "project", "site_name","catchdate",
                        "Fishing authority","Preclassification Stressor","landmark_up","latitude","longitude","landmark_down","lat_down","long_down","locality_length","temp",
                        "conductivity","pH_value","ox_cont","ox_sat","method","assessment","sampling strategy","anodes","Number of Subsections","Length Subsection [m]",
                        "Width Subsection [m]","Type of strip","Habitat","Run/Strip","Fish ID","species","length [mm]", "Total weight [gr]", "Catch Efficiency [%]", 
                        "remark raw data","remark import","Import","Import date"];

const validations: Record<string, ValidationRule> = {
  site_code: { required: true, type: "string" },
  river_name: { required: true, type: "string" },
  year: { required: true, type: "number", decimal: 0 },
  "data_provider/contact person": { required: true, type: "string" },
  "ask Data provider before use": { required: true, type: "string", options: ["yes", "no"] },
  source: { required: true, type: "string" },
  project: { required: true, type: "string" },
  site_name: { required: true, type: "string" },
  catchdate: { required: true, type: "date" },
  "Fishing authority": { type: "string" },
  "Preclassification Stressor": { type: "string", options: ["hydropeaking", "residual flow", "head of impoundment"] },
  landmark_up: { type: "string" },
  landmark_down: { type: "string" },
  locality_length: { type: "number", decimal: 2, unit: "m" },
  temp: { type: "number", decimal: 2, unit: "°C", min: 0.1 },
  conductivity: { type: "number", min: 0, max: 50000, unit: "µS/cm" },
  pH_value: { type: "number", min: 0, max: 14, decimal: 1 }, // pH kann Dezimalstellen haben
  ox_cont: { type: "number", min: 0, max: 200, unit: "%" },
  ox_sat: { type: "number", min: 0, max: 20, unit: "mg/L" },
  method: { required: true, type: "string" },
  assessment: { required: true, type: "string" },
  "sampling strategy": { required: true, type: "string", options: ["whole", "partialprop"] },
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
  "Catch Efficiency [%]": { type: "number", min: 0, max: 100, decimal: 0, unit: "%" },
  "remark raw data": { type: "string" },
  "remark import": { type: "string" },
  Import: { required: true, type: "string" },
  "Import date": { required: true, type: "date" },
};

// Datum aus Excel (nicht funktionsfähig)
function parseExcelDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'number') {
    const excelEpoch = new Date(1900, 0, 1);
    const date = new Date(excelEpoch.getTime() + (value - 1) * 24 * 60 * 60 * 1000);
    return date;
  }
  return null;
}

// Prüfung auf leer
function isEmpty(value: any): boolean {
  return value === undefined || 
         value === null || 
         value === "" || 
         (typeof value === "string" && value.trim() === "");
}

export async function POST(req: NextRequest) {
  try {
    const fileBuffer = Buffer.from(await req.arrayBuffer());
    const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

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
      return NextResponse.json({
        error: "Fehlende Spalten",
        details: [{ row: 1, errors: missingHeaders.map(h => `Spalte "${h}" fehlt`) }]
      }, { status: 400 });
    }

    const data: Record<string, any>[] = [];
    const errors: { row: number; errors: string[] }[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowObj: Record<string, any> = {};
      const rowErrors: string[] = [];

      for (const header of expectedHeaders) {
        const rawValue = row[headerMap[header]];
        let value = rawValue;
        
        if (validations[header]?.type === "date" && !isEmpty(rawValue)) {
          const parsedDate = parseExcelDate(rawValue);
          value = parsedDate ? parsedDate.toISOString().split('T')[0] : rawValue;
        }
        
        rowObj[header] = value;
        
        const rules = validations[header];
        if (rules) {
          // Pflichtfeld-Prüfung
          if (rules.required && isEmpty(rawValue)) {
            rowErrors.push(`"${header}" ist Pflichtfeld`);
          }

          if (!isEmpty(rawValue)) {
            if (rules.type === "number") {
              const num = Number(rawValue);
              if (isNaN(num)) {
                rowErrors.push(`"${header}" muss eine Zahl sein (Wert: "${rawValue}")`);
              } else {
                if (rules.min !== undefined && num < rules.min) {
                  rowErrors.push(`"${header}" darf nicht kleiner als ${rules.min} sein (Wert: ${num})`);
                }
                if (rules.max !== undefined && num > rules.max) {
                  rowErrors.push(`"${header}" darf nicht größer als ${rules.max} sein (Wert: ${num})`);
                }
                if (rules.decimal !== undefined) {
                  const decimals = (String(num).split(".")[1] || "").length;
                  if (decimals > rules.decimal) {
                    rowErrors.push(`"${header}" darf maximal ${rules.decimal} Nachkommastellen haben (Wert: ${num})`);
                  }
                }
              }
            }
            
            if (rules.type === "string" && typeof rawValue !== "string") {
              rowErrors.push(`"${header}" muss ein Text sein (Typ: ${typeof rawValue})`);
            }
            
            if (rules.type === "date") {
              const parsedDate = parseExcelDate(rawValue);
              if (!parsedDate || isNaN(parsedDate.getTime())) {
                rowErrors.push(`"${header}" muss ein gültiges Datum sein (Wert: "${rawValue}")`);
              }
            }

            // Optionen-Prüfung
            if (rules.options) {
              const normalizedValue = String(rawValue).toLowerCase().trim();
              const normalizedOptions = rules.options.map(opt => opt.toLowerCase());
              
              if (!normalizedOptions.includes(normalizedValue)) {
                rowErrors.push(`"${header}" muss einer der Werte sein: ${rules.options.join(", ")} (Wert: "${rawValue}")`);
              }
            }
          }
        }
      }

      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, errors: rowErrors });
      } else {
        data.push(rowObj);
      }
    }

    // Ausgabe der Validierungsfehler in der Konsole pro Zeile
    console.log("Validierungsfehler:", errors);

    if (errors.length > 0) {
      return NextResponse.json(
        { 
          error: "Validierung fehlgeschlagen", 
          details: errors,
          summary: `${errors.length} Zeilen mit Fehlern gefunden`
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ 
      message: "Upload erfolgreich", 
      data,
      summary: `${data.length} Zeilen erfolgreich validiert`
    });

  } catch (err: any) {
    console.error("Serverfehler:", err);
    return NextResponse.json(
      { error: "Serverfehler", details: err.message },
      { status: 500 }
    );
  }
}