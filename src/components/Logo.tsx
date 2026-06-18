import { cn } from "@/utils/cn";

/**
 * Official SecureLocalShare brand mark — the shield-with-keyhole from
 * /public/icon.svg, inlined so it can be sized and recoloured with CSS.
 * Use <LogoMark /> for the icon alone, <Logo /> for icon + wordmark.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      role="img"
      aria-label="SecureLocalShare"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8", className)}
    >
      <defs>
        <linearGradient id="slsShield" x1="0.25" y1="0" x2="0.75" y2="1">
          <stop offset="0" stopColor="#1f3a6b" />
          <stop offset="0.55" stopColor="#142a52" />
          <stop offset="1" stopColor="#0b1730" />
        </linearGradient>
        <linearGradient id="slsRim" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#7c6cff" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="slsBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b82ff" />
          <stop offset="1" stopColor="#5b54e0" />
        </linearGradient>
        <mask id="slsKeyhole">
          <rect x="40" y="40" width="20" height="20" rx="6.5" fill="#fff" />
          <circle cx="50" cy="48" r="2.6" fill="#000" />
          <path d="M50 48 L47.4 55 H52.6 Z" fill="#000" />
        </mask>
      </defs>

      <path
        d="M50 4 L85 17 V45 C85 69 69 86 50 95 C31 86 15 69 15 45 V17 Z"
        fill="url(#slsShield)"
        stroke="url(#slsRim)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      <g stroke="#8b82ff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95">
        <path d="M40 45 H31 L26 38" />
        <path d="M40 51 H24" />
        <path d="M40 57 H29 L24 62" />
        <path d="M44 61 L40 67 H35" />
        <path d="M60 45 H69 L74 38" />
        <path d="M60 51 H76" />
        <path d="M60 57 H71 L76 62" />
        <path d="M56 61 L60 67 H65" />
        <path d="M44 39 L40 33 H35" />
        <path d="M56 39 L60 33 H65" />
      </g>

      <g fill="#c4bcff">
        <circle cx="25" cy="38" r="2.6" />
        <circle cx="23" cy="51" r="2.6" />
        <circle cx="23" cy="62" r="2.6" />
        <circle cx="34" cy="67" r="2.6" />
        <circle cx="75" cy="38" r="2.6" />
        <circle cx="77" cy="51" r="2.6" />
        <circle cx="77" cy="62" r="2.6" />
        <circle cx="66" cy="67" r="2.6" />
        <circle cx="34" cy="33" r="2.6" />
        <circle cx="66" cy="33" r="2.6" />
      </g>

      <path
        d="M43.5 42 V35.5 a6.5 6.5 0 0 1 13 0 V42"
        stroke="#a99fff"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="40" y="40" width="20" height="20" rx="6.5" fill="url(#slsBody)" mask="url(#slsKeyhole)" />
    </svg>
  );
}

interface LogoProps {
  /** Size of the icon. The wordmark scales with it. */
  size?: "sm" | "md" | "lg";
  /** Hide the "SecureLocalShare" text and show the mark only. */
  markOnly?: boolean;
  className?: string;
}

const SIZES = {
  sm: { mark: "h-6 w-6", text: "text-sm" },
  md: { mark: "h-8 w-8", text: "text-base" },
  lg: { mark: "h-10 w-10", text: "text-lg" },
} as const;

export function Logo({ size = "md", markOnly = false, className }: LogoProps) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={cn(s.mark, "drop-shadow-[0_2px_8px_hsl(248_90%_60%/0.35)]")} />
      {!markOnly && (
        <span className={cn("font-semibold tracking-tight text-foreground", s.text)}>
          SecureLocalShare
        </span>
      )}
    </span>
  );
}
