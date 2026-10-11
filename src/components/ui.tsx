import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, InputHTMLAttributes, HTMLAttributes } from "react";

export function Button({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={cn("btn-neon rounded-xl px-5 py-2.5 font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed", className)} />;
}
export function GhostButton({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={cn("rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 font-bold hover:bg-white/10 transition", className)} />;
}
export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cn("glass rounded-2xl p-5 shadow-card", className)} />;
}
export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn("w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 outline-none focus:border-neon-cyan/60 focus:ring-2 focus:ring-neon-cyan/20 placeholder:text-white/30", className)} />;
}
export function Label({ className, ...p }: HTMLAttributes<HTMLLabelElement>) {
  return <label {...p} className={cn("mb-1 block text-sm font-bold text-white/80", className)} />;
}
export function Badge({ className, ...p }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...p} className={cn("inline-flex items-center rounded-full border border-neon-cyan/30 bg-neon-blue/15 px-3 py-0.5 text-xs font-bold text-neon-cyan", className)} />;
}
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="glass rounded-2xl p-10 text-center">
      <div className="text-4xl mb-3">🎮</div>
      <div className="font-black text-lg">{title}</div>
      {hint && <div className="text-white/60 text-sm mt-1">{hint}</div>}
    </div>
  );
}
export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-neon-blue via-neon-cyan to-neon-violet font-black text-xl shadow-glow">M</div>
      <div className="leading-tight">
        <div className="font-black text-lg neon-text">MODYX</div>
        <div className="text-[11px] tracking-widest text-white/60">FREE FIRE</div>
      </div>
    </div>
  );
}
