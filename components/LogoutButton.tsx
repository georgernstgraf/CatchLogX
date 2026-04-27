"use client";
import React from "react";
import { useAuth } from "@/components/AuthProvider";

interface LogoutButtonProps {
  className?: string;
  children?: React.ReactNode;
}

const LogoutButton: React.FC<LogoutButtonProps> = ({
  className = "w-full bg-[#357174] text-white p-3 rounded-lg cursor-pointer text-sm font-medium hover:bg-[#4da1a6] transition-colors duration-200",
  children = "Sign out",
}) => {
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoggingOut}
      className={`${className} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {isLoggingOut ? "Signing out..." : children}
    </button>
  );
};

export default LogoutButton;
