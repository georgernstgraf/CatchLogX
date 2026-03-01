"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import bokuLogo from "@/assets/img/Logo.png";

const COOLDOWN_SECONDS = 60;

// ─── Toast ────────────────────────────────────────────────────────────────────

function ToastContainer({ toasts }) {
  const base =
    "flex items-center gap-3 px-5 py-4 rounded-lg shadow-lg text-white text-base font-medium transition-all duration-300 pointer-events-auto";
  const colors = {
    success: "bg-[#357174]",
    error: "bg-red-500",
    info: "bg-[#4da1a6]",
  };
  const icons = { success: "✓", error: "✕", info: "ℹ" };

  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={`${base} ${colors[t.type]}`}>
          <span className="text-lg font-bold">{icons[t.type]}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const ForgotPasswordForm = () => {
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [toasts, setToasts] = useState([]);
  const toastCounter = useRef(0);
  const intervalRef = useRef(null);

  // ── Toast helpers ──────────────────────────────────────────────────────

  const addToast = (message, type, duration = 5000) => {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  };

  // ── Cooldown ticker ────────────────────────────────────────────────────

  const startCooldown = () => {
    setCooldown(COOLDOWN_SECONDS);
    intervalRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => clearInterval(intervalRef.current), []);

  // ── Submit ─────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading || cooldown > 0) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, timestamp: Date.now() }),
      });
      const data = await response.json();

      if (response.ok) {
        addToast(
          "Reset-Link wurde gesendet. Bitte überprüfe dein E-Mail-Postfach.",
          "success"
        );
        startCooldown();
      } else {
        addToast(
          data.message ?? "Fehler beim Senden der Anfrage. Bitte erneut versuchen.",
          "error"
        );
      }
    } catch {
      addToast("Netzwerkfehler. Bitte erneut versuchen.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const isDisabled = isLoading || cooldown > 0;

  return (
    <>
      <ToastContainer toasts={toasts} />
      <div className="flex flex-col justify-center items-center min-h-screen bg-[#f5f4f2]">
        <div className="bg-[#FCFBF9] rounded-xl shadow-lg flex flex-col items-center p-10 w-[400px]">
          <div className="flex flex-row justify-center items-center gap-9 w-full mb-6">
            <div className="flex items-center h-full">
              <Image
                src={bokuLogo}
                alt="Boku Logo"
                width={150}
                height={150}
                className="object-contain"
              />
            </div>
            <span className="text-black text-[25px] font-medium leading-tight">
              Universität für
              <br />
              Bodenkultur Wien
            </span>
          </div>
          <div className="text-black text-5xl font-bold mb-8 text-center w-full">
            Passwort zurücksetzen
          </div>
          <form onSubmit={handleSubmit} className="w-full">
            <input
              type="text"
              id="username"
              name="username"
              placeholder="Benutzername"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={isDisabled}
              className="w-full bg-white text-black border border-[#e5e5e5] p-4 rounded-lg mb-4 text-lg focus:outline-none focus:ring-2 focus:ring-[#357174] disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={isDisabled}
              className="w-full bg-[#357174] text-white p-4 rounded-lg text-lg font-medium hover:bg-[#4da1a6] transition-colors duration-200 mb-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? "Wird gesendet…" : "Anfrage senden"}
            </button>
            {cooldown > 0 && (
              <p className="text-center text-sm text-gray-500 mt-1">
                Erneut versuchen in{" "}
                <span className="font-semibold text-[#357174]">
                  {cooldown}s
                </span>
              </p>
            )}
          </form>
        </div>
      </div>
    </>
  );
};

export default ForgotPasswordForm;
