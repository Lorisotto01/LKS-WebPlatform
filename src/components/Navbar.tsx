import { Link, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
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
 */
export function Navbar({ links = [] }: { links?: NavLink[] }) {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="transition-opacity hover:opacity-80">
          <Logo size="md" />
        </Link>

        {links.length > 0 && (
          <nav className="hidden items-center gap-7 md:flex">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
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
        </div>
      </div>
    </header>
  );
}
