"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import bokuLogo from "@/assets/img/Logo.png";


type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  const base =
    "flex items-center gap-3 px-5 py-4 rounded-lg shadow-lg text-white text-base font-medium transition-all duration-300 pointer-events-auto";
  const colors: Record<ToastType, string> = {
    success: "bg-[#357174]",
    error: "bg-red-500",
    info: "bg-[#4da1a6]",
  };
  const icons: Record<ToastType, string> = {
    success: "✓",
    error: "✕",
    info: "ℹ",
  };

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


type PageState = "loading" | "invalid" | "form" | "submitting" | "done";



function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-center items-center min-h-screen bg-[#f5f4f2]">
      <div className="bg-[#FCFBF9] rounded-xl shadow-lg flex flex-col items-center p-10 w-[420px]">
        <div className="flex flex-row justify-center items-center gap-9 w-full mb-6">
          <div className="flex items-center h-full">
            <Image src={bokuLogo} alt="Boku Logo" width={150} height={150} className="object-contain" />
          </div>
          <span className="text-black text-[25px] font-medium leading-tight">
            Universität für
            <br />
            Bodenkultur Wien
          </span>
        </div>
        <div className="text-black text-5xl font-bold mb-8 text-center w-full">
          Reset
          <br />
          Password
        </div>
        {children}
      </div>
    </div>
  );
}


export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [username, setUsername] = useState("");
  const [validToken, setValidToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [invalidReason, setInvalidReason] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastCounter, setToastCounter] = useState(0);



  const addToast = (message: string, type: ToastType, duration = 4000) => {
    const id = toastCounter + 1;
    setToastCounter((c) => c + 1);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  };

  

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setInvalidReason("No token found in the URL.");
      setPageState("invalid");
      addToast("Invalid password reset link.", "error");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/reset-password?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (res.ok && data.valid) {
          setUsername(data.username);
          setValidToken(data.token);
          setPageState("form");
          addToast("Token verified. Please enter your new password.", "info");
        } else {
          const msg: string = data.message ?? "";
          if (msg.toLowerCase().includes("expired")) {
            setInvalidReason("This reset link has expired. Please request a new one.");
            addToast("Reset link has expired.", "error");
          } else {
            setInvalidReason("This reset link is invalid or has already been used.");
            addToast("Invalid password reset link.", "error");
          }
          setPageState("invalid");
        }
      } catch {
        setInvalidReason("Network error. Please try again later.");
        addToast("Network error while verifying the link.", "error");
        setPageState("invalid");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== newPasswordConfirm) {
      addToast("The entered passwords do not match.", "error");
      return;
    }

    if (newPassword.length < 6) {
      addToast("Password must be at least 6 characters long.", "error");
      return;
    }

    setPageState("submitting");

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword,
          newPasswordConfirm,
          username,
          isValid: true,
          token: validToken,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        addToast("Password successfully reset!", "success", 5000);
        setPageState("done");
        setTimeout(() => router.push("/login"), 3000);
      } else {
        const msg: string = data.message ?? "An unknown error occurred.";
        addToast(msg, "error");
        setPageState("form");
      }
    } catch {
      addToast("Network error. Please try again later.", "error");
      setPageState("form");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (pageState === "loading") {
    return (
      <>
        <ToastContainer toasts={toasts} />
        <Card>
          <div className="flex flex-col items-center gap-4 w-full py-4">
            <div className="w-10 h-10 border-4 border-[#357174] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-base">Verifying link…</p>
          </div>
        </Card>
      </>
    );
  }

  if (pageState === "invalid") {
    return (
      <>
        <ToastContainer toasts={toasts} />
        <Card>
          <div className="w-full bg-red-50 border border-red-300 text-red-700 px-4 py-4 rounded-lg mb-6 text-base text-center">
            {invalidReason}
          </div>
          <Link
            href="/forgot-password"
            className="w-full bg-[#357174] text-white p-4 rounded-lg text-lg font-medium hover:bg-[#4da1a6] transition-colors duration-200 text-center block"
          >
            Request a new link
          </Link>
          <Link
            href="/login"
            className="text-black text-base font-normal w-full text-center mt-4 block"
          >
            Back to Login
          </Link>
        </Card>
      </>
    );
  }

  if (pageState === "done") {
    return (
      <>
        <ToastContainer toasts={toasts} />
        <Card>
          <div className="w-full bg-[#e8f5f5] border border-[#357174] text-[#357174] px-4 py-4 rounded-lg mb-6 text-base text-center font-medium">
            Password successfully reset!<br />
            <span className="text-gray-500 text-sm font-normal">Redirecting to login…</span>
          </div>
          <Link
            href="/login"
            className="w-full bg-[#357174] text-white p-4 rounded-lg text-lg font-medium hover:bg-[#4da1a6] transition-colors duration-200 text-center block"
          >
            Log in now
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <ToastContainer toasts={toasts} />
      <Card>
        <form onSubmit={handleSubmit} className="w-full">
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            disabled={pageState === "submitting"}
            className="w-full bg-white text-black border border-[#e5e5e5] p-4 rounded-lg mb-4 text-lg focus:outline-none focus:ring-2 focus:ring-[#357174] disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={newPasswordConfirm}
            onChange={(e) => setNewPasswordConfirm(e.target.value)}
            required
            disabled={pageState === "submitting"}
            className="w-full bg-white text-black border border-[#e5e5e5] p-4 rounded-lg mb-6 text-lg focus:outline-none focus:ring-2 focus:ring-[#357174] disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={pageState === "submitting"}
            className="w-full bg-[#357174] text-white p-4 rounded-lg text-lg font-medium hover:bg-[#4da1a6] transition-colors duration-200 mb-4 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {pageState === "submitting" ? "Saving…" : "Save password"}
          </button>
        </form>
        <Link
          href="/login"
          className="text-black text-base font-normal w-full text-center block"
        >
          Back to Login
        </Link>
      </Card>
    </>
  );
}
