import { NavLink, Outlet } from "react-router-dom";
import { Rocket, Inbox, FileText, BarChart3 } from "lucide-react";
import { Navbar } from "@/components/Navbar";

const TABS = [
  { to: "release", label: "Release", icon: Rocket },
  { to: "segnalazioni", label: "Segnalazioni", icon: Inbox },
  { to: "docs-manager", label: "Docs Manager", icon: FileText },
  { to: "analytics", label: "Analytics", icon: BarChart3 },
];

/** Shell del pannello admin: header + barra tab + contenuto della tab attiva. */
export function AdminLayout() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-extrabold tracking-tight">Pannello admin</h1>
        <p className="mt-1.5 text-muted-foreground">
          Gestisci release, segnalazioni, documentazione e analytics. I permessi sono concessi solo al tuo account
          admin.
        </p>

        {/* Tab bar */}
        <nav className="mt-8 flex flex-wrap gap-1.5 border-b border-border/60 pb-px">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`
              }
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
