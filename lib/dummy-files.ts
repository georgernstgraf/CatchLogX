export type DummyFileRecord = {
  id: string;
  fileName: string;
  filePath: string;
  uploadedByUserId: string;
  createdAt: string;
  isVisible: boolean;
};

function normalizeDummyFile(value: unknown): DummyFileRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.fileName !== "string" ||
    typeof candidate.filePath !== "string" ||
    typeof candidate.uploadedByUserId !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.isVisible !== "boolean"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    fileName: candidate.fileName,
    filePath: candidate.filePath,
    uploadedByUserId: candidate.uploadedByUserId,
    createdAt: candidate.createdAt,
    isVisible: candidate.isVisible,
  };
}

export async function fetchDummyFiles(options?: {
  includeHidden?: boolean;
}): Promise<DummyFileRecord[]> {
  const includeHidden = options?.includeHidden === true;
  const response = await fetch(
    `/api/upload/dummy-file?includeHidden=${includeHidden ? "true" : "false"}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Dummy files could not be loaded.");
  }

  const payload = (await response.json()) as { dummyFiles?: unknown };
  if (!Array.isArray(payload.dummyFiles)) {
    return [];
  }

  return payload.dummyFiles
    .map((entry) => normalizeDummyFile(entry))
    .filter((entry): entry is DummyFileRecord => entry !== null);
}

export async function uploadDummyFileToBackend(
  file: File,
): Promise<DummyFileRecord> {
  const response = await fetch("/api/upload/dummy-file/new", {
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
    dummyFile?: unknown;
    error?: string;
  };

  if (!response.ok || !payload.dummyFile) {
    throw new Error(payload.error || "Dummy file upload failed.");
  }

  const normalized = normalizeDummyFile(payload.dummyFile);
  if (!normalized) {
    throw new Error("Invalid dummy file payload received from server.");
  }

  return normalized;
}

export async function updateDummyFileVisibility(
  id: string,
  isVisible: boolean,
): Promise<DummyFileRecord> {
  const response = await fetch(`/api/upload/dummy-file/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ isVisible }),
  });

  const payload = (await response.json()) as {
    dummyFile?: unknown;
    error?: string;
  };

  if (!response.ok || !payload.dummyFile) {
    throw new Error(payload.error || "Dummy file could not be updated.");
  }

  const normalized = normalizeDummyFile(payload.dummyFile);
  if (!normalized) {
    throw new Error("Invalid dummy file payload received from server.");
  }

  return normalized;
}

export async function deleteDummyFile(id: string): Promise<void> {
  const response = await fetch(`/api/upload/dummy-file/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    let message = "Dummy file could not be deleted.";
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

export async function downloadDummyFile(file: DummyFileRecord): Promise<void> {
  const response = await fetch(`/api/upload/dummy-file/${file.id}/download`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Dummy file could not be downloaded.");
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
