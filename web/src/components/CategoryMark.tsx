import type { ReactNode } from "react";

export function CategoryMark({ name, color = "#6f685e" }: { name?: string; color?: string }) {
  return (
    <span aria-hidden className="inline-flex h-4 w-4 shrink-0 items-center justify-center" style={{ color }}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {glyph(name)}
      </svg>
    </span>
  );
}

function glyph(name?: string): ReactNode {
  switch (name) {
    case "식비":
      return (
        <>
          <path d="M5 3v7a3 3 0 0 0 6 0V3" />
          <path d="M8 3v18" />
          <path d="M19 3v8c0 1.2-1 2-2.2 2H15" />
          <path d="M16 3v18" />
        </>
      );
    case "카페·간식":
      return (
        <>
          <path d="M5 9h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z" />
          <path d="M16 10h2.2a2.5 2.5 0 0 1 0 5H16" />
          <path d="M8 5c.6 1 .2 1.6-.2 2.4" />
          <path d="M12 5c.6 1 .2 1.6-.2 2.4" />
        </>
      );
    case "교통비":
      return (
        <>
          <rect x="4" y="4" width="16" height="13" rx="2" />
          <path d="M4 11h16" />
          <path d="M8 17v2" />
          <path d="M16 17v2" />
          <path d="M8 8h.01" />
          <path d="M16 8h.01" />
        </>
      );
    case "교육비":
      return (
        <>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
          <path d="M12 3h5.5A2.5 2.5 0 0 1 20 5.5V21.5A2.5 2.5 0 0 0 17.5 19H12z" />
        </>
      );
    case "생활·쇼핑":
      return (
        <>
          <path d="M6 8h12l-1 13H7L6 8z" />
          <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
        </>
      );
    case "주거·공과금":
      return (
        <>
          <path d="M4 11 12 4l8 7" />
          <path d="M6 10.5V20h12v-9.5" />
        </>
      );
    case "통신":
      return (
        <>
          <rect x="8" y="3" width="8" height="18" rx="2" />
          <path d="M11 18h2" />
        </>
      );
    case "의료·건강":
      return (
        <>
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </>
      );
    case "문화·구독":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M10.5 9.2v5.6l4.8-2.8z" fill="currentColor" stroke="none" />
        </>
      );
    case "경조사":
      return (
        <>
          <rect x="4" y="10" width="16" height="10" rx="1.5" />
          <path d="M4 14h16" />
          <path d="M12 10v10" />
          <path d="M12 10c-2-3-6-3-6 0" />
          <path d="M12 10c2-3 6-3 6 0" />
        </>
      );
    case "금융":
      return (
        <>
          <ellipse cx="12" cy="7" rx="7" ry="3" />
          <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
          <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
        </>
      );
    case "대출":
      return (
        <>
          <path d="M4 20h16" />
          <path d="M6 20V10" />
          <path d="M10 20V10" />
          <path d="M14 20V10" />
          <path d="M18 20V10" />
          <path d="M3 10h18L12 4z" />
        </>
      );
    case "급여":
      return (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M6 9h.01" />
          <path d="M18 15h.01" />
        </>
      );
    case "기타수입":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </>
      );
    case "미분류":
      return <circle cx="12" cy="12" r="7" strokeDasharray="3 3" />;
    default:
      return (
        <>
          <path d="M8 7h8" />
          <path d="M8 12h8" />
          <path d="M8 17h5" />
        </>
      );
  }
}
