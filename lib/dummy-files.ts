export const DUMMY_FILES_STORAGE_KEY = "clx-dummy-files";

export type DummyFileRecord = {
  id: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
  isVisible: boolean;
  source: "seed" | "uploaded";
  textContent?: string;
  dataUrl?: string;
  isDeleted?: boolean;
};

const DEFAULT_DUMMY_FILES: DummyFileRecord[] = [
  {
    id: "seed-dummy-001",
    fileName: "import-template-basic.csv",
    mimeType: "text/csv",
    createdAt: "2026-04-21T08:20:00.000Z",
    isVisible: true,
    source: "seed",
    textContent:
      "country,river_name,year,data_provider\nAustria,Donau,2026,BOKU\nAustria,Traun,2026,BOKU\n",
  },
  {
    id: "seed-dummy-002",
    fileName: "import-template-advanced.csv",
    mimeType: "text/csv",
    createdAt: "2026-04-20T12:05:00.000Z",
    isVisible: true,
    source: "seed",
    textContent:
      "country,river_name,site_name,date,species,total_length,weight\nAustria,Salza,Friedhofsbruecke,2026-04-15,Brown trout,31.2,0.29\n",
  },
  {
    id: "seed-dummy-003",
    fileName: "import-template-hidden.csv",
    mimeType: "text/csv",
    createdAt: "2026-04-18T09:40:00.000Z",
    isVisible: false,
    source: "seed",
    textContent:
      "country,river_name,year,data_provider\nAustria,Ybbs,2025,BOKU\n",
  },
];

function cloneDefaults(): DummyFileRecord[] {
  return DEFAULT_DUMMY_FILES.map((file) => ({ ...file }));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeDummyFile(value: unknown): DummyFileRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  const id =
    isNonEmptyString(candidate.id)
      ? candidate.id
      : `dummy-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const fileName =
    isNonEmptyString(candidate.fileName) ? candidate.fileName : "dummy-file.csv";

  const mimeType =
    isNonEmptyString(candidate.mimeType)
      ? candidate.mimeType
      : "application/octet-stream";

  const createdAt =
    isNonEmptyString(candidate.createdAt)
      ? candidate.createdAt
      : new Date().toISOString();

  const source = candidate.source === "uploaded" ? "uploaded" : "seed";

  const isVisible = typeof candidate.isVisible === "boolean" ? candidate.isVisible : true;

  const textContent =
    typeof candidate.textContent === "string" ? candidate.textContent : undefined;

  const dataUrl = typeof candidate.dataUrl === "string" ? candidate.dataUrl : undefined;

  const isDeleted = typeof candidate.isDeleted === "boolean" ? candidate.isDeleted : false;

  return {
    id,
    fileName,
    mimeType,
    createdAt,
    isVisible,
    source,
    textContent,
    dataUrl,
    isDeleted,
  };
}

function mergeDummyFiles(storedFiles: DummyFileRecord[]): DummyFileRecord[] {
  const byId = new Map<string, DummyFileRecord>();

  for (const seedFile of cloneDefaults()) {
    byId.set(seedFile.id, seedFile);
  }

  for (const storedFile of storedFiles) {
    byId.set(storedFile.id, {
      ...byId.get(storedFile.id),
      ...storedFile,
    });
  }

  return Array.from(byId.values())
    .filter((file) => !file.isDeleted)
    .sort((a, b) => {
      const aDate = new Date(a.createdAt).getTime();
      const bDate = new Date(b.createdAt).getTime();
      return bDate - aDate;
    });
}

function persistDummyFiles(files: DummyFileRecord[]): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(DUMMY_FILES_STORAGE_KEY, JSON.stringify(files));
}

export function loadDummyFilesFromStorage(): DummyFileRecord[] {
  if (typeof window === "undefined") {
    return cloneDefaults();
  }

  try {
    const raw = localStorage.getItem(DUMMY_FILES_STORAGE_KEY);

    if (!raw) {
      const defaults = cloneDefaults();
      persistDummyFiles(defaults);
      return defaults;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      const defaults = cloneDefaults();
      persistDummyFiles(defaults);
      return defaults;
    }

    const normalized = parsed
      .map((item) => normalizeDummyFile(item))
      .filter((item): item is DummyFileRecord => item !== null);

    const merged = mergeDummyFiles(normalized);
    persistDummyFiles(merged);
    return merged;
  } catch {
    const defaults = cloneDefaults();
    persistDummyFiles(defaults);
    return defaults;
  }
}

export function saveDummyFilesToStorage(files: DummyFileRecord[]): DummyFileRecord[] {
  const normalized = files
    .map((file) => normalizeDummyFile(file))
    .filter((file): file is DummyFileRecord => file !== null);

  const merged = mergeDummyFiles(normalized);
  persistDummyFiles(merged);
  return merged;
}

export function createDummyFileFromUpload(
  file: File,
  dataUrl: string,
): DummyFileRecord {
  return {
    id: `dummy-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    createdAt: new Date().toISOString(),
    isVisible: true,
    source: "uploaded",
    dataUrl,
    isDeleted: false,
  };
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Datei konnte nicht gelesen werden."));
      }
    };

    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

export async function downloadDummyFile(file: DummyFileRecord): Promise<void> {
  let blob: Blob;

  if (file.dataUrl) {
    const response = await fetch(file.dataUrl);
    blob = await response.blob();
  } else if (typeof file.textContent === "string") {
    blob = new Blob([file.textContent], { type: file.mimeType });
  } else {
    blob = new Blob([""], { type: "application/octet-stream" });
  }

  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = file.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
}
