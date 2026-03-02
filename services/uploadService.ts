import * as XLSX from "xlsx";
import { z } from "zod";

// Types
type CellValue = string | number | boolean | Date | null | undefined;
type SheetRow = CellValue[];
type DataObject = Record<string, CellValue>;

// vereinheitlichen von Strings zum Vergleich
const normalize = (v: unknown): string => String(v ?? "").trim().toLowerCase();

function readLists(workbook: XLSX.WorkBook) {

  const sheet = workbook.Sheets["List"];

  const rows: SheetRow[] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true
  }) as SheetRow[];

  const headers = rows[0] as string[];

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

  return z.string().min(1).refine(
    (v) => set.has(normalize(v)),
    {
      message: `Value not found in List sheet: ${listName}`
    }
  );

}

//Zod Schema

function buildSchema(lists: Record<string, Set<string>>) {

  return z.object({

    country: inList(lists, "country"),
    river_name: z.string().min(1),
    year: z.number().int().min(1990).max(2100),
    data_provider: z.string().min(1),
    approval_required: z.enum(["yes", "no"]),
    source: z.string().min(1),
    project: z.string().max(30),
    site_name: z.string().min(1),
    date: z.date(),
    fishing_district: z.string().optional(),
    preclassification_stressor: z.string().optional(),
    landmark_up: z.union([z.string(), z.number()]).refine(v => String(v).length <= 20).optional(),
    lat_up: z.number().min(46).max(49.1),
    long_up: z.number().min(9.5).max(17.4),
    landmark_down: z.union([z.string(), z.number()]).refine(v => String(v).length <= 20).optional(),
    lat_down: z.number().optional(),
    long_down: z.number().optional(),
    length_site: z.number().optional(),
    width_site: z.number().optional(),
    temp: z.number().optional(),
    conductivity: z.number().min(50).max(1500).optional(),
    pH_value: z.number().min(0).max(14).optional(),
    ox_cont: z.number().min(0).max(20).optional(),
    ox_sat: z.number().min(20).max(130).optional(),
    mean_water_depth: z.number().optional(),
    discharge: z.number().optional(),
    method: inList(lists, "method"),
    sampling_time: inList(lists, "sampling time"),
    assessment: inList(lists, "assessment"),
    anodes: z.number().int().min(1).max(10).optional(),
    fished_length: z.number().optional(),
    fished_width: z.number().optional(),
    type_of_strip: z.string().optional(),
    habitat: z.string().optional(),
    sample_id: z.string().optional(),
    fish_id: z.number().int().optional(),
    species: inList(lists, "name of species"),
    total_length: z.number().optional(),
    weight: z.number().optional(),
    reader_id: z.string().optional(),
    memory_id: z.number().int().optional(),
    pit_dec: z.string().optional(),
    pit_hex: z.string().optional(),
    recapture: z.number().int().min(0).max(1).optional(),
    catch_efficiency: z.number().min(0).max(100).optional(),
    remark_raw_data: z.string().optional(),
    remark_import: z.string().optional(),
  });
}

export async function processUpload(fileBuffer: Buffer, cookieHeader: string) {
  try {
    const workbook = XLSX.read(fileBuffer, {
      type: "buffer",
      cellDates: true
    });

    const lists = readLists(workbook);
    const rowSchema = buildSchema(lists);

    //DATA Sheet einlesen
    const sheet = workbook.Sheets["DATA"];

    const rows: SheetRow[] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true
    }) as SheetRow[];

    const headers = rows[0] as string[];
    
    const validationErrors: any[] = [];

    //Validierung der Datenzeilen
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      // Prüfung ob die Zeile komplett leer ist (alle Werte sind null, undefined oder leere Strings)
      const isEmptyRow = row.every(cell => 
        cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "")
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
        const rowErrors = result.error.issues.map((issue) => ({
          row: i + 1,
          column: issue.path[0],
          message: issue.message
        }));
        validationErrors.push(...rowErrors);
      }
    }

    if (validationErrors.length > 0) {
      return {
        success: false,
        error: "Validation failed",
        validationErrors,
        status: 400
      };
    }

    return {
      success: true,
      data: { processedRows: rows.length - 1 },
      summary: "Validation finished successfully"
    };
    
  } catch (error: any) {
    return {
      success: false,
      error: "Server error during file processing",
      details: error.message,
      status: 500
    };
  }
}