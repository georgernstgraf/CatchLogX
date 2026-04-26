"use client";

import React, { useState, useRef } from "react";
import Sidebar from "./Sidebar";
import DarkModeToggle from "./DarkModeToggle";

const MY_UPLOADS_STORAGE_KEY = "clx-my-uploads";

const UploadPageComponent = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [errorType, setErrorType] = useState<"validation" | "structural" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Überprüfung ob die Datei eine Excel-Datei ist
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

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      if (isExcelFile(file)) {
        setSelectedFile(file);
        setUploadStatus("idle");
      } else {
        alert("Bitte wähle nur Excel-Dateien (.xlsx oder .xls) aus.");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (isExcelFile(file)) {
        setSelectedFile(file);
        setUploadStatus("idle");
      } else {
        alert("Bitte wähle nur Excel-Dateien (.xlsx oder .xls) aus.");
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadStatus("uploading");
    setErrorMessage("");
    setErrorType(null);

    try {
      const response = await fetch("/api/upload/new", {
        method: "POST",
        body: selectedFile,
      });
      
      const contentType = response.headers.get("content-type") || "";

      //Excel Fehlerdatei herunterladen
      if (contentType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
        const blob = await response.blob();

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "validation_errors.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        setUploadStatus("error");
        setErrorType("validation");
        setErrorMessage("An error was found during validation. An Excel file with the highlighted errors has been downloaded.");
        return;
      }
      
      // JSON Response für Erfolg oder strukturelle Fehler
      const data = await response.json();

      if (!response.ok) {
        setUploadStatus("error");
        setErrorType("structural");
        setErrorMessage(data.details || data.error || "An unknown error occurred.");
        return;
      }

      const successfulUpload = {
        id: data?.data?.uploadId || `local-${Date.now()}`,
        link: selectedFile.name,
        state: "UPLOADED",
        note: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        const existingRaw = localStorage.getItem(MY_UPLOADS_STORAGE_KEY);
        const existingUploads = existingRaw ? JSON.parse(existingRaw) : [];
        const mergedUploads = [
          successfulUpload,
          ...existingUploads.filter(
            (upload: { id?: string }) => upload?.id !== successfulUpload.id,
          ),
        ];
        localStorage.setItem(
          MY_UPLOADS_STORAGE_KEY,
          JSON.stringify(mergedUploads.slice(0, 100)),
        );
      } catch (storageError) {
        console.warn("Could not write upload to local storage:", storageError);
      }

      setUploadStatus("success");
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus("error");
      setErrorType("structural");
      setErrorMessage("Network error: File could not be uploaded.");
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setUploadStatus("idle");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

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
              Excel-Datei hochladen
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Lade deine Excel-Datei hoch zur Überprüfung durch den
              Administrator
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
                  Wichtige Hinweise zur Dateistruktur
                </h3>
                <div className="text-sm text-orange-700 dark:text-orange-400">
                  <p className="mb-2">
                    Bitte stelle sicher, dass deine Excel-Datei die folgenden
                    Kriterien erfüllt:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>
                      Die Struktur entspricht exakt der bereitgestellten Vorlage
                      (Dummy-Excel)
                    </li>
                    <li>
                      Die erste Zeile enthält die korrekten Spaltenüberschriften
                    </li>
                    <li>
                      Alle Pflichtfelder sind ausgefüllt (manche Felder dürfen
                      leer bleiben)
                    </li>
                    <li>Die Datenformate sind korrekt (Datum, Zahlen, Text)</li>
                    <li>Keine zusätzlichen oder gelöschten Spalten</li>
                    <li>Maximal 10.000 Zeilen pro Datei</li>
                  </ul>
                  <p className="mt-3 text-xs bg-orange-100 dark:bg-orange-900/40 p-2 rounded">
                    <strong>Wichtig:</strong> Nach dem Upload wird deine Datei
                    vom Administrator manuell überprüft und freigegeben. Du
                    erhältst eine Benachrichtigung über den Status deiner
                    Übermittlung.
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* Upload Area */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
            {!selectedFile ? (
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
                        ? "Datei hier ablegen..."
                        : "Excel-Datei hier ablegen"}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                      oder klicke hier, um eine Datei auszuwählen
                    </p>
                    {/* WIP - Link zur Dummy Datei einfügen */}
                    <p className="text-sm text-[#357174] mb-4 font-medium">
                      📋 Verwende die bereitgestellte Dummy-Excel als Vorlage
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-[#357174] hover:bg-[#2a5a5d] text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200"
                    >
                      Datei auswählen
                    </button>
                    <p className="text-xs text-gray-400 mt-2">
                      Unterstützte Formate: .xlsx, .xls (max. 50MB)
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      💡 Tipp: Lade die Dummy-Excel-Vorlage herunter und nutze
                      sie als Basis
                    </p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Selected File Info */}
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <svg
                        className="w-6 h-6 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {selectedFile.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={resetUpload}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    disabled={uploadStatus === "uploading"}
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
                {/* Upload Button */}
                <div className="flex justify-center">
                  <button
                    onClick={handleUpload}
                    disabled={
                      uploadStatus === "uploading" || uploadStatus === "success"
                    }
                    className={`px-8 py-3 rounded-lg font-medium transition-all duration-200 ${
                      uploadStatus === "uploading"
                        ? "bg-gray-400 text-white cursor-not-allowed"
                        : uploadStatus === "success"
                        ? "bg-green-600 text-white cursor-not-allowed"
                        : "bg-[#357174] hover:bg-[#2a5a5d] text-white hover:shadow-lg"
                    }`}
                  >
                    {uploadStatus === "uploading" && (
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    )}
                    {uploadStatus === "success" && (
                      <svg
                        className="w-5 h-5 mr-2 inline"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                    {uploadStatus === "uploading"
                      ? "Wird hochgeladen..."
                      : uploadStatus === "success"
                      ? "Erfolgreich eingereicht"
                      : "Datei zur Prüfung einreichen"}
                  </button>
                </div>
                {/* Success Message */}
                {uploadStatus === "success" && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center">
                      <svg
                        className="w-5 h-5 text-green-400 mr-2"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <p className="text-green-700 font-medium">
                        Deine Datei wurde erfolgreich eingereicht und wartet auf
                        die Überprüfung durch den Administrator.
                      </p>
                    </div>
                    <div className="mt-2 text-sm text-green-600">
                      Du wirst benachrichtigt, sobald die Prüfung abgeschlossen
                      ist.
                    </div>
                  </div>
                )}
                {/* Error Message */}
                {uploadStatus === "error" && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <svg className="w-5 h-5 text-red-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" 
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" 
                          clipRule="evenodd" 
                        />
                      </svg>
                      <div>
                        <h3 className="text-sm font-medium text-red-800 mb-2">
                          {errorType === "validation" ? "Validation Error" : "File Structure Error"}
                        </h3>
                        <p className="text-sm text-red-700">
                          {errorMessage}
                        </p>
                        {errorType === "validation"}
                      </div>
                    </div>
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
