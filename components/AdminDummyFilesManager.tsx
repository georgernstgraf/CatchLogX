"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, EyeOff, Trash2, Upload } from "lucide-react";
import {
  deleteDummyFile,
  downloadDummyFile,
  DummyFileRecord,
  fetchDummyFiles,
  updateDummyFileVisibility,
  uploadDummyFileToBackend,
} from "@/lib/dummy-files";

const MAX_DUMMY_FILE_SIZE_BYTES = 8 * 1024 * 1024;

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("de-AT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatSize(sizeInBytes: number): string {
  if (sizeInBytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(sizeInBytes) / Math.log(1024)),
    units.length - 1,
  );

  const converted = sizeInBytes / Math.pow(1024, unitIndex);
  return `${converted.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

const AdminDummyFilesManager = () => {
  const [dummyFiles, setDummyFiles] = useState<DummyFileRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const files = await fetchDummyFiles({ includeHidden: true });
      setDummyFiles(files);
    } catch (error) {
      console.error("Could not load dummy files:", error);
      setErrorMessage("Dummy files could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const visibleCount = useMemo(
    () => dummyFiles.filter((file) => file.isVisible).length,
    [dummyFiles],
  );

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage("");
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  const handleUploadDummyFile = async () => {
    if (!selectedFile) {
      return;
    }

    if (selectedFile.size > MAX_DUMMY_FILE_SIZE_BYTES) {
      setErrorMessage(
        `The file is too large. Maximum allowed: ${formatSize(MAX_DUMMY_FILE_SIZE_BYTES)}.`,
      );
      return;
    }

    setIsUploading(true);
    setErrorMessage("");

    try {
      await uploadDummyFileToBackend(selectedFile);
      await loadFiles();

      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Could not upload dummy file:", error);
      setErrorMessage("Dummy file could not be uploaded.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleVisibility = (id: string) => {
    const selected = dummyFiles.find((file) => file.id === id);
    if (!selected) {
      return;
    }

    setErrorMessage("");
    updateDummyFileVisibility(id, !selected.isVisible)
      .then(() => loadFiles())
      .catch((error) => {
        console.error("Could not update dummy file visibility:", error);
        setErrorMessage("Visibility could not be updated.");
      });
  };

  const handleDeleteDummyFile = (id: string) => {
    setErrorMessage("");
    deleteDummyFile(id)
      .then(() => loadFiles())
      .catch((error) => {
        console.error("Could not delete dummy file:", error);
        setErrorMessage("Dummy file could not be deleted.");
      });
  };

  const handleDownload = async (file: DummyFileRecord) => {
    try {
      await downloadDummyFile(file);
    } catch (error) {
      console.error("Could not download dummy file:", error);
      alert("Download failed.");
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">
            Dummy Files
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Visible files are shown as downloads on the upload page.
          </p>
        </div>
        <div className="rounded-lg bg-[#e8f3f3] dark:bg-[#1f2f3e] border border-[#c7e0e0] dark:border-[#2d4257] px-4 py-2 text-sm text-[#235457] dark:text-[#b8d6d8]">
          Visible: <strong>{visibleCount}</strong> / {dummyFiles.length}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
            accept=".csv,.xlsx,.xls,.txt"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Select File
          </button>
          <button
            onClick={handleUploadDummyFile}
            disabled={!selectedFile || isUploading}
            className={`px-4 py-2 rounded-lg text-white transition-colors inline-flex items-center justify-center gap-2 ${
              !selectedFile || isUploading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-[#357174] hover:bg-[#2a5a5d]"
            }`}
          >
            <Upload size={16} />
            {isUploading ? "Uploading..." : "Upload Dummy File"}
          </button>
          {selectedFile && (
            <p className="text-sm text-gray-600 dark:text-gray-300 break-all">
              {selectedFile.name} ({formatSize(selectedFile.size)})
            </p>
          )}
        </div>
        {errorMessage && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-3">
            {errorMessage}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          Loading dummy files...
        </div>
      ) : dummyFiles.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          No dummy files found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  File
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Uploaded At
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Visible
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {dummyFiles.map((file) => (
                <tr
                  key={file.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/60"
                >
                  <td className="px-4 py-4 text-sm text-gray-900 dark:text-gray-100 break-all">
                    {file.fileName}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {formatDateTime(file.createdAt)}
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <button
                      onClick={() => handleToggleVisibility(file.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        file.isVisible
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {file.isVisible ? (
                        <Eye size={14} />
                      ) : (
                        <EyeOff size={14} />
                      )}
                      {file.isVisible ? "true" : "false"}
                    </button>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownload(file)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        title="Download file"
                      >
                        <Download size={14} />
                        Download
                      </button>
                      <button
                        onClick={() => handleDeleteDummyFile(file.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                        title="Delete file"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminDummyFilesManager;
