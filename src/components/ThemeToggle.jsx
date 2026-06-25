export function ThemeToggle({ value, onChange }) {
  const nextTheme = value === "dark" ? "light" : "dark";

  return (
    <button
      aria-label={value === "dark" ? "切换到白天模式" : "切换到黑夜模式"}
      className="theme-toggle"
      onClick={() => onChange(nextTheme)}
      title={value === "dark" ? "切换到白天模式" : "切换到黑夜模式"}
      type="button"
    >
      {value === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" className="theme-icon" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.4M12 19.6V22M4.93 4.93l1.7 1.7M17.37 17.37l1.7 1.7M2 12h2.4M19.6 12H22M4.93 19.07l1.7-1.7M17.37 6.63l1.7-1.7" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" className="theme-icon" viewBox="0 0 24 24">
      <path d="M20.2 14.6A8.2 8.2 0 0 1 9.4 3.8 8.9 8.9 0 1 0 20.2 14.6Z" />
    </svg>
  );
}
