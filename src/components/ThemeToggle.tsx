"use client";
import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./icons";

type Theme = "light" | "dark";

function apply(t: Theme) {
  const root = document.documentElement;
  root.classList.add("theme-anim");
  root.dataset.theme = t;
  try { localStorage.setItem("tropical-theme", t); } catch {}
  window.setTimeout(() => root.classList.remove("theme-anim"), 300);
}

function useTheme(): [Theme | null, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);
  return [theme, (t) => { apply(t); setTheme(t); }];
}

/** The Light | Dark pill switch. */
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const [theme, set] = useTheme();
  return (
    <div role="radiogroup" aria-label="Colour theme" className={`grid grid-cols-2 rounded-full bg-[var(--track)] p-1 text-[14px] font-bold ${className}`}>
      {(["light", "dark"] as const).map((t) => {
        const on = theme === t;
        return (
          <button key={t} type="button" role="radio" aria-checked={on} onClick={() => set(t)}
            className={`flex h-10 items-center justify-center gap-2 rounded-full transition-all ${on ? (t === "dark" ? "bg-[#140b0d] text-white shadow-[0_4px_14px_rgba(0,0,0,0.3)]" : "bg-white text-[#140b0d] shadow-[0_4px_14px_rgba(40,10,15,0.15)]") : "text-zinc-500 hover:text-zinc-800"}`}>
            {t === "light" ? <IconSun size={16} /> : <IconMoon size={16} />}{t === "light" ? "Light" : "Dark"}
          </button>
        );
      })}
    </div>
  );
}

/** A compact round button that flips the theme (for top bars). */
export function ThemeButton({ onHero = false }: { onHero?: boolean }) {
  const [theme, set] = useTheme();
  const dark = theme === "dark";
  return (
    <button type="button" onClick={() => set(dark ? "light" : "dark")} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}
      className={`grid h-10 w-10 place-items-center rounded-xl transition-colors ${onHero ? "bg-white/15 text-white hover:bg-white/25" : "bg-[var(--primary-soft)] text-[var(--primary)] hover:bg-[var(--primary-track)]"}`}>
      {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
    </button>
  );
}
