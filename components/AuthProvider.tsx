"use client";
import { createContext, useContext, useEffect, useState } from "react";

interface User {
  id: string;
  username: string;
  name: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (
    username: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Debug: Wenn sich der User-State ändert, loggen wir das
  useEffect(() => {
    console.log("User-State hat sich geändert:", user);
    console.log("Ist eingeloggt:", !!user);
  }, [user]);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/session");
      const data = await response.json();

      if (data.authenticated && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error || "Login failed" };
      }
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: "An unexpected error occurred" };
    }
  };

  const logout = async () => {
    console.log("🚪 Logout wird gestartet...");

    try {
      // Session auf dem Server löschen
      console.log("📞 API-Call für Logout wird gemacht");
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        console.warn(
          "⚠️ Server-Logout hat nicht geklappt, aber wir machen trotzdem weiter"
        );
      } else {
        console.log("✅ Server-Logout war erfolgreich");
      }
    } catch (error) {
      console.error("❌ Fehler beim Server-Logout:", error);
    }

    // User-State löschen
    console.log("🗑️ User wird aus dem State gelöscht");
    setUser(null);

    // Ein kleiner Timeout, damit der State-Update Zeit hat
    setTimeout(() => {
      console.log("🔄 Jetzt wird zur Login-Seite weitergeleitet...");
      console.log("📍 Aktuelle URL:", window.location.href);
      window.location.href = "/login";
      console.log("✅ window.location.href = '/login' wurde ausgeführt");
    }, 200);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
