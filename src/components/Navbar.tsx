import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "./ui/button";
import { Logo } from "./Logo";

export interface NavLink {
  label: string;
  href: string;
}

/**
 * Top navigation. On the landing page pass `links` for the in-page anchors
 * (Funzionalita / Sicurezza / Download). Auth state decides the right-hand actions.
 *
 * A breakpoint mobile (<md) le voci `links` collassano in un menu hamburger
 * accessibile da tastiera (Esc per chiudere), così non si sovrappongono al logo.
 */
export function Navbar({ links = [] }: { links?: NavLink[] }) {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Chiudi il menu con Esc e blocca lo scroll del body mentre è aperto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const linkClass = "text-sm text-muted-foreground transition-colors hover:text-foreground";

  const renderLink = (l: NavLink, onClick?: () => void) =>
    l.href.startsWith("/") ? (
      <Link key={l.href} to={l.href} onClick={onClick} className={linkClass}>
        {l.label}
      </Link>
    ) : (
      <a key={l.href} href={l.href} onClick={onClick} className={linkClass}>
        {l.label}
      </a>
    );

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:px-6">
        <Link to="/" className="min-w-0 shrink-0 transition-opacity hover:opacity-80">
          <Logo size="md" compact />
        </Link>

        {/* Nav desktop */}
        {links.length > 0 && (
          <nav className="hidden items-center gap-7 md:flex">
            {links.map((l) => renderLink(l))}
          </nav>
        )}

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {user ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
                Dashboard
              </Button>
              {isAdmin && (
                <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
                  Admin
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                <LogOut className="h-4 w-4" /> Esci
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
                Accedi
              </Button>
              <Button size="sm" onClick={() => navigate("/register")}>
                Registrati
              </Button>
            </>
          )}

          {/* Toggle hamburger (solo mobile, solo se ci sono voci di menu) */}
          {links.length > 0 && (
            <button
              type="button"
              aria-label={open ? "Chiudi menu" : "Apri menu"}
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-card/60 text-muted-foreground transition-colors hover:text-foreground md:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {/* Pannello mobile a comparsa */}
      {links.length > 0 && open && (
        <nav
          id="mobile-nav"
          className="border-t border-border/60 bg-background/95 backdrop-blur-lg md:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-3 py-4 sm:px-6">
            {links.map((l) =>
              l.href.startsWith("/") ? (
                <Link
                  key={l.href}
                  to={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
                >
                  {l.label}
                </Link>
              ) : (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
                >
                  {l.label}
                </a>
              )
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
