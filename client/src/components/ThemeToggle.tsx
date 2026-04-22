import { Moon, Sun } from "lucide-react";
import useThemeStore from "../stores/themeStore";

interface ThemeToggleProps {
  className?: string;
}

function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className={`p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 transition-colors ${className}`}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export default ThemeToggle;
