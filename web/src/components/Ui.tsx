import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export const controlClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-pine";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

export function Button({
  tone = "ink",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "ink" | "pine" | "ghost" | "clay" }) {
  const tones = {
    ink: "bg-ink text-sheet",
    pine: "bg-pine text-white",
    ghost: "border border-line bg-white text-ink",
    clay: "bg-clay-soft text-clay",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium disabled:opacity-50 ${tones[tone]} ${props.className ?? ""}`}
    />
  );
}

export function Signed({ value, plain = false }: { value: number; plain?: boolean }) {
  const text = `${value > 0 && !plain ? "+" : ""}${format(value)}`;
  const color = plain ? "text-ink" : value < 0 ? "text-clay" : value > 0 ? "text-pine" : "text-ink";
  return <span className={`tabular ${color}`}>{text}</span>;
}

function format(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}${Math.round(Math.abs(value)).toLocaleString("ko-KR")}원`;
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}
