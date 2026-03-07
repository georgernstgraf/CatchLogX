"use client";

import { useTheme } from "./ThemeProvider";
import { Moon, Sun } from "lucide-react";

const DarkModeToggle = ({ variant = "sidebar" }: { variant?: "sidebar" | "page" }) => {
  const { theme, toggleTheme } = useTheme();

  const styles =
    variant === "page"
      ? "p-2 rounded-lg transition-colors duration-200 text-gray-600 dark:text-gray-300 hover:text-[#357174] hover:bg-gray-200 dark:hover:bg-gray-700"
      : "p-2 rounded-lg transition-colors duration-200 text-[#e5e5e5] hover:text-[#357174]";

  return (
    <button
      onClick={toggleTheme}
      className={styles}
      aria-label={theme === "dark" ? "Zu hellem Modus wechseln" : "Zu dunklem Modus wechseln"}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
};

export default DarkModeToggle;
