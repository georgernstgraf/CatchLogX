export type TemplateFileRecord = {
  id: string;
  fileName: string;
  uploadedByUserId: string;
  createdAt: string;
  isVisible: boolean;
};

// Exported for unit tests (see lib/template-files.test.ts, #112).
export function normalizeTemplateFile(value: unknown): TemplateFileRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.fileName !== "string" ||
    typeof candidate.uploadedByUserId !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.isVisible !== "boolean"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    fileName: candidate.fileName,
    uploadedByUserId: candidate.uploadedByUserId,
    createdAt: candidate.createdAt,
    isVisible: candidate.isVisible,
  };
}

export async function fetchTemplateFiles(options?: {
  includeHidden?: boolean;
}): Promise<TemplateFileRecord[]> {
  const includeHidden = options?.includeHidden === true;
  const response = await fetch(
    `/api/upload/template-file?includeHidden=${includeHidden ? "true" : "false"}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Template files could not be loaded.");
  }

  const payload = (await response.json()) as { templateFiles?: unknown };
  if (!Array.isArray(payload.templateFiles)) {
    return [];
  }

  return payload.templateFiles
    .map((entry) => normalizeTemplateFile(entry))
    .filter((entry): entry is TemplateFileRecord => entry !== null);
}

export async function uploadTemplateFileToBackend(
  file: File,
): Promise<TemplateFileRecord> {
  const response = await fetch("/api/upload/template-file/new", {
    method: "POST",
    headers: {
      "content-type":
        file.type ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "x-file-name": file.name,
    },
    body: file,
  });

  const payload = (await response.json()) as {
    templateFile?: unknown;
    error?: string;
  };

  if (!response.ok || !payload.templateFile) {
    throw new Error(payload.error || "Template file upload failed.");
  }

  const normalized = normalizeTemplateFile(payload.templateFile);
  if (!normalized) {
    throw new Error("Invalid template file payload received from server.");
  }

  return normalized;
}

export async function updateTemplateFileVisibility(
  id: string,
  isVisible: boolean,
): Promise<TemplateFileRecord> {
  const response = await fetch(`/api/upload/template-file/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ isVisible }),
  });

  const payload = (await response.json()) as {
    templateFile?: unknown;
    error?: string;
  };

  if (!response.ok || !payload.templateFile) {
    throw new Error(payload.error || "Template file could not be updated.");
  }

  const normalized = normalizeTemplateFile(payload.templateFile);
  if (!normalized) {
    throw new Error("Invalid template file payload received from server.");
  }

  return normalized;
}

export async function deleteTemplateFile(id: string): Promise<void> {
  const response = await fetch(`/api/upload/template-file/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    let message = "Template file could not be deleted.";
    try {
      const payload = (await response.json()) as { error?: string };
      if (typeof payload.error === "string") {
        message = payload.error;
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }
}

export async function downloadTemplateFile(file: TemplateFileRecord): Promise<void> {
  const response = await fetch(`/api/upload/template-file/${file.id}/download`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Template file could not be downloaded.");
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = file.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
}
