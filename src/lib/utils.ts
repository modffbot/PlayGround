import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function formatDateTime(v: string | Date | null | undefined) {
  if (!v) return "—";
  try { return new Date(v).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return String(v); }
}
/** Escape text for Telegram MarkdownV2 / HTML-safe plain text. We send parse_mode HTML-safe via escaping. */
export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
