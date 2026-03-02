"use client";
import Link from "next/link";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import bokuLogo from "@/assets/img/Logo.png";
import Image from "next/image";
import { useAuth } from "@/components/AuthProvider";
import DarkModeToggle from "@/components/DarkModeToggle";

const LoginForm = () => {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const router = useRouter();
  const { login } = useAuth();
  const [user, setUser] = React.useState(null);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      // Verify session with database
      const response = await fetch("/api/auth/session");

      if (response.ok) {
        const data = await response.json();

        if (data.authenticated) {
          setUser({
            id: data.user.id,
            username: data.user.username,
          });
          router.replace("/");
        }
      }
    } catch (error) {
      console.error("Session check fehlgeschlagen:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await login(username, password);

      if (result.success) {
        // Login successful, redirect to dashboard or home page
        router.push("/");
      } else {
        // Login failed, show error message
        setError(result.error || "Login failed. Please try again.");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="flex flex-col justify-center items-center min-h-screen bg-[#f5f4f2] dark:bg-gray-900 relative">
      <div className="absolute top-4 right-4">
        <DarkModeToggle variant="page" />
      </div>
      <div className="bg-[#FCFBF9] dark:bg-gray-800 rounded-xl shadow-lg flex flex-col items-center p-10 w-[400px]">
        <div className="flex flex-row items-center gap-9 w-full mb-6">
          <div className="flex items-center h-full">
            <Image
              src={bokuLogo}
              alt="Boku Logo"
              width={150}
              height={150}
              className="object-contain"
            />
          </div>
          <span className="text-black dark:text-gray-100 text-[25px] font-medium leading-tight">
            Universität für
            <br />
            Bodenkultur Wien
          </span>
        </div>
        <div className="text-black dark:text-gray-100 text-5xl font-bold mb-8 text-center w-full">
          Login
        </div>

        {error && (
          <div className="w-full bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full">
          <input
            type="text"
            id="username"
            name="username"
            placeholder="Benutzername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={isLoading}
            className="w-full bg-white dark:bg-gray-900 text-black dark:text-gray-200 border border-[#e5e5e5] dark:border-gray-600 p-4 rounded-lg mb-4 text-lg focus:outline-none focus:ring-2 focus:ring-[#357174] disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          />
          <input
            type="password"
            id="password"
            name="password"
            placeholder="Passwort"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            className="w-full bg-white dark:bg-gray-900 text-black dark:text-gray-200 border border-[#e5e5e5] dark:border-gray-600 p-4 rounded-lg mb-6 text-lg focus:outline-none focus:ring-2 focus:ring-[#357174] disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#357174] text-white p-4 rounded-lg text-lg font-medium hover:bg-[#4da1a6] transition-colors duration-200 mb-4 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? "Wird angemeldet..." : "Anmelden"}
          </button>
        </form>
        <Link
          href="/forgot-password"
          className="text-black dark:text-gray-300 text-base font-normal w-full text-center mb-4"
        >
          Passwort vergessen?
        </Link>
      </div>
    </div>
  );
};

export default LoginForm;
