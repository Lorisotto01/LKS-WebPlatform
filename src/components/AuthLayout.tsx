import type { ReactNode, ComponentType } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "./Logo";

interface AuthLayoutProps {
  /** Lucide icon shown in the gradient badge above the title. */
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Optional footer line below the card (e.g. "Hai già un account?"). */
  footer?: ReactNode;
  /** Max card width. */
  width?: "sm" | "md";
}

/**
 * Shared chrome for every auth screen: dotted-grid backdrop, top bar with the
 * brand logo and a "back to site" link, and a centred glass card with a
 * gradient icon badge — exactly the layout in the wireframes.
 */
export function AuthLayout({
  icon: Icon,
  title,
  subtitle,
  children,
  footer,
  width = "md",
}: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen bg-dotgrid">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-hero-glow" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="transition-opacity hover:opacity-80">
          <Logo size="md" />
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Torna al sito
        </Link>
      </header>

      <main className="relative flex items-center justify-center px-6 pb-16 pt-6">
        <div
          className={`w-full ${width === "sm" ? "max-w-sm" : "max-w-md"} animate-fade-up rounded-xl border bg-card/80 p-8 shadow-card backdrop-blur`}
        >
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-gradient shadow-glow">
              <Icon className="h-7 w-7 text-white" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>

          {children}

          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
