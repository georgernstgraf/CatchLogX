"use client";

import React, { useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import DarkModeToggle from "./DarkModeToggle";
import {
  downloadTemplateFile,
  TemplateFileRecord,
  fetchTemplateFiles,
} from "@/lib/template-files";
import { downloadErrorArchive, uploadFiles } from "@/lib/upload-client";
import {
  FileReport,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_TOTAL_BYTES,
} from "@/lib/uploadReport";

const MAX_UPLOAD_FILE_MB = Math.round(MAX_UPLOAD_FILE_BYTES / (1024 * 1024));

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const isExcelFile = (file: File) => {
  const excelTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
  ];
  return (
    excelTypes.includes(file.type) ||
    file.name.endsWith(".xlsx") ||
    file.name.endsWith(".xls")
  );
};

/** Per-file validation report, shared by the single and bulk upload. */
const FileReportRow = ({ report }: { report: FileReport }) => {
  const passed = report.status === "passed";

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700/40">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-gray-100 break-all">
            {report.fileName}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {report.totalRows} rows checked · {report.passedRows} ok ·{" "}
            {report.failedRows} failed
          </p>
        </div>
        <span
          className={`shrink-0 px-2 py-1 text-xs font-semibold rounded ${
            passed
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          }`}
        >
          {passed ? "passed" : "failed"}
        </span>
      </div>

      {!passed && report.errors.length > 0 && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {report.errors.map((error, index) => (
            <li key={index} className="p-3 text-sm">
              <p className="text-gray-800 dark:text-gray-200">
                <span className="font-semibold">
                  {error.column === "-" ? "File" : error.column}
                </span>
                {error.value && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {" "}
                    · value &quot;{error.value}&quot;
                  </span>
                )}
              </p>
              <p className="text-gray-600 dark:text-gray-400 mt-0.5">
                {error.message}
              </p>
              {error.rows.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  {error.rows.length} row{error.rows.length === 1 ? "" : "s"}:{" "}
                  {error.rows.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const UploadPageComponent = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [visibleTemplateFiles, setVisibleTemplateFiles] = useState<
    TemplateFileRecord[]
  >([]);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [report, setReport] = useState<FileReport[]>([]);
  const [zipToken, setZipToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const syncTemplateFiles = async () => {
      try {
        const files = await fetchTemplateFiles({ includeHidden: false });
        setVisibleTemplateFiles(files.filter((file) => file.isVisible));
      } catch (error) {
        console.error("Could not load template files:", error);
        setVisibleTemplateFiles([]);
      }
    };

    syncTemplateFiles();

    const handleFocus = () => {
      syncTemplateFiles();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const addFiles = (incoming: File[]) => {
    const excelFiles = incoming.filter(isExcelFile);

    if (excelFiles.length !== incoming.length) {
      alert("Please select only Excel files (.xlsx or .xls).");
    }
    if (excelFiles.length === 0) return;

    const acceptedFiles = excelFiles.filter(
      (file) => file.size <= MAX_UPLOAD_FILE_BYTES,
    );

    if (acceptedFiles.length !== excelFiles.length) {
      alert(
        `Each file must be at most ${MAX_UPLOAD_FILE_MB} MiB. Larger files were not added.`,
      );
    }
    if (acceptedFiles.length === 0) return;

    setUploadStatus("idle");
    setReport([]);
    setZipToken(null);
    setErrorMessage("");

    setSelectedFiles((current) => {
      const names = new Set(current.map((file) => file.name));
      const merged = [...current];
      for (const file of acceptedFiles) {
        if (!names.has(file.name)) {
          merged.push(file);
          names.add(file.name);
        }
      }
      return merged;
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const removeFile = (fileName: string) => {
    setSelectedFiles((current) =>
      current.filter((file) => file.name !== fileName),
    );
  };

  const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  const tooManyFiles = selectedFiles.length > MAX_UPLOAD_FILES;
  const tooLarge = totalBytes > MAX_UPLOAD_TOTAL_BYTES;
  const canUpload =
    selectedFiles.length > 0 &&
    !tooManyFiles &&
    !tooLarge &&
    uploadStatus !== "uploading";

  const handleUpload = async () => {
    if (!canUpload) return;

    setUploadStatus("uploading");
    setErrorMessage("");
    setReport([]);
    setZipToken(null);

    try {
      const outcome = await uploadFiles(selectedFiles);

      if (!outcome.ok) {
        setUploadStatus("error");
        setErrorMessage(
          outcome.details || outcome.error || "An unknown error occurred.",
        );
        setReport(outcome.report);
        setZipToken(outcome.zipToken ?? null);
        return;
      }

      setUploadStatus("success");
      setReport(outcome.report);
      setSelectedFiles([]);
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus("error");
      setErrorMessage("Network error: files could not be uploaded.");
    }
  };

  const resetUpload = () => {
    setSelectedFiles([]);
    setUploadStatus("idle");
    setReport([]);
    setZipToken(null);
    setErrorMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDownloadErrors = async () => {
    if (!zipToken) return;
    try {
      await downloadErrorArchive(zipToken);
    } catch (error) {
      console.error("Error report download failed:", error);
      alert("The error report could not be downloaded.");
    }
  };

  const handleDownloadTemplate = async (templateFile: TemplateFileRecord) => {
    try {
      await downloadTemplateFile(templateFile);
    } catch (error) {
      console.error("Template download failed:", error);
      alert("Template file could not be downloaded.");
    }
  };

  const uploadFailed = report.some((entry) => entry.status === "failed");
  const showSuccess = uploadStatus === "success" && report.length > 0;

  return (
    <div className="flex flex-row min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 min-h-screen bg-gray-50 dark:bg-gray-900 p-6 flex flex-row justify-center relative">
        <div className="absolute top-6 right-6">
          <DarkModeToggle variant="page" />
        </div>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Upload Excel Files
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Upload one or more Excel files for administrator review. A bulk
              upload is treated as a whole: either every file passes validation
              or none is submitted.
            </p>
          </div>
          {/* Disclaimer Box */}
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-6 mb-8">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-orange-400 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-orange-800 dark:text-orange-300 mb-2">
                  Important File Structure Notes
                </h3>
                <div className="text-sm text-orange-700 dark:text-orange-400">
                  <p className="mb-2">
                    Please ensure your Excel files meet the following criteria:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>
                      The structure matches the provided template files exactly
                    </li>
                    <li>The first row contains the correct column headers</li>
                    <li>
                      All required fields are filled (some optional fields may
                      remain empty)
                    </li>
                    <li>Data formats are correct (date, numbers, text)</li>
                    <li>No additional or deleted columns</li>
                    <li>
                      At most {MAX_UPLOAD_FILES} files,{" "}
                      {MAX_UPLOAD_FILE_MB} MiB per file and{" "}
                      {Math.round(MAX_UPLOAD_TOTAL_BYTES / (1024 * 1024))} MiB in
                      total per upload
                    </li>
                  </ul>
                  <p className="mt-3 text-xs bg-orange-100 dark:bg-orange-900/40 p-2 rounded">
                    <strong>Important:</strong> All uploaded files are validated
                    together. If a single file fails, the whole upload is
                    rejected and nothing is submitted for review.
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* Upload Area */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
            {showSuccess ? (
              <div className="space-y-6">
                {/* Success Message */}
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <p className="text-green-700 dark:text-green-300 font-medium">
                    {report.length} file{report.length === 1 ? "" : "s"} passed
                    validation and are waiting for administrator review.
                  </p>
                  <div className="mt-2 text-sm text-green-600 dark:text-green-400">
                    You will be notified once the review is complete.
                  </div>
                </div>

                {/* Upload report */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Upload report
                  </h3>
                  {report.map((entry) => (
                    <FileReportRow key={entry.fileName} report={entry} />
                  ))}
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={resetUpload}
                    className="px-6 py-3 rounded-lg font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Start new upload
                  </button>
                </div>
              </div>
            ) : selectedFiles.length === 0 ? (
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-all duration-300 ${
                  isDragOver
                    ? "border-[#357174] bg-[#357174]/5"
                    : "border-gray-300 dark:border-gray-600 hover:border-[#357174] hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center space-y-4">
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center ${
                      isDragOver
                        ? "bg-[#357174] text-white"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    <svg
                      className="w-8 h-8"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      {isDragOver
                        ? "Drop files here..."
                        : "Drop Excel files here"}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                      or click here to select files
                    </p>
                    <p className="text-sm text-[#357174] mb-4 font-medium">
                      📋 Use the provided template files as the basis for your
                      upload
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-[#357174] hover:bg-[#2a5a5d] text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200"
                    >
                      Select Files
                    </button>
                    <p className="text-xs text-gray-400 mt-2">
                      Supported formats: .xlsx, .xls
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      💡 Tip: Download a template file and use it as your base
                    </p>

                    {visibleTemplateFiles.length > 0 && (
                      <div className="mt-6 w-full max-w-xl rounded-lg border border-[#c7e0e0] dark:border-[#2d4257] bg-[#e8f3f3] dark:bg-[#1f2f3e] p-4 text-left">
                        <p className="text-sm font-semibold text-[#235457] dark:text-[#b8d6d8]">
                          Download Current Template Files
                        </p>
                        <p className="text-xs mt-1 text-[#2d666a] dark:text-[#9fbec0]">
                          Visible files are controlled via the admin panel.
                        </p>
                        <div className="mt-3 space-y-2">
                          {visibleTemplateFiles.map((templateFile) => (
                            <div
                              key={templateFile.id}
                              className="flex items-center justify-between gap-3 rounded-md bg-white/70 dark:bg-gray-900/40 px-3 py-2"
                            >
                              <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-200 break-all">
                                {templateFile.fileName}
                              </p>
                              <button
                                onClick={() =>
                                  handleDownloadTemplate(templateFile)
                                }
                                className="shrink-0 px-3 py-1.5 text-xs font-medium rounded bg-[#357174] hover:bg-[#2a5a5d] text-white transition-colors"
                              >
                                Download
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Selected files */}
                <div className="space-y-2">
                  {selectedFiles.map((file) => (
                    <div
                      key={file.name}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-100 break-all">
                          {file.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeFile(file.name)}
                        className="text-gray-400 hover:text-gray-600 transition-colors ml-3"
                        disabled={uploadStatus === "uploading"}
                        aria-label={`Remove ${file.name}`}
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  {selectedFiles.length} file
                  {selectedFiles.length === 1 ? "" : "s"} ·{" "}
                  {formatFileSize(totalBytes)}
                  {tooManyFiles &&
                    ` — at most ${MAX_UPLOAD_FILES} files per upload`}
                  {tooLarge &&
                    ` — at most ${Math.round(
                      MAX_UPLOAD_TOTAL_BYTES / (1024 * 1024),
                    )} MiB in total`}
                </p>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={handleUpload}
                    disabled={!canUpload}
                    className={`px-8 py-3 rounded-lg font-medium transition-all duration-200 ${
                      !canUpload
                        ? "bg-gray-400 text-white cursor-not-allowed"
                        : "bg-[#357174] hover:bg-[#2a5a5d] text-white hover:shadow-lg"
                    }`}
                  >
                    {uploadStatus === "uploading"
                      ? "Uploading..."
                      : `Submit ${selectedFiles.length} File${
                          selectedFiles.length === 1 ? "" : "s"
                        } for Review`}
                  </button>
                  <button
                    onClick={resetUpload}
                    disabled={uploadStatus === "uploading"}
                    className="px-6 py-3 rounded-lg font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    {report.length > 0 ? "Start over" : "Cancel"}
                  </button>
                </div>

                {report.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      Upload report
                    </h3>
                    {report.map((entry) => (
                      <FileReportRow key={entry.fileName} report={entry} />
                    ))}
                    {uploadFailed && zipToken && (
                      <button
                        onClick={handleDownloadErrors}
                        className="w-full sm:w-auto px-6 py-3 rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
                      >
                        Download failed files (.zip)
                      </button>
                    )}
                  </div>
                )}

                {/* Error Message */}
                {uploadStatus === "error" && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-red-800 mb-2">
                      {report.length > 0
                        ? "Upload rejected — files were not imported"
                        : "Upload failed"}
                    </h3>
                    <p className="text-sm text-red-700">{errorMessage}</p>
                    {zipToken && (
                      <p className="text-sm text-red-700 mt-1">
                        Fix the marked cells in the downloaded files and upload
                        again.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadPageComponent;
