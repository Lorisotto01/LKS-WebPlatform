import { useEffect, useState } from "react";
import { User, Mail, MapPin, Link2, Sparkles } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { getAuthorProfile } from "@/lib/profile";
import type { AuthorProfile } from "@/types/database.types";

export function ChiSono() {
  const [profile, setProfile] = useState<AuthorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuthorProfile().then((p) => {
      setProfile(p);
      setLoading(false);
    });
  }, []);

  const name = profile?.display_name ?? "Lorenzo Sottocorno";
  const bioParagraphs = (profile?.bio ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="min-h-screen">
      <Navbar
        links={[
          { label: "Funzionalità", href: "/funzionalita" },
          { label: "Sicurezza", href: "/sicurezza" },
          { label: "Recensioni", href: "/recensioni" },
          { label: "Chi sono", href: "/chi-sono" },
        ]}
      />

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-[360px] bg-hero-glow" />
        <div className="relative mx-auto max-w-5xl px-6 py-16">
          <div className="flex flex-col items-center text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <User className="h-3.5 w-3.5 text-primary" /> Chi sono
            </span>

            {/* Foto profilo */}
            <div className="mt-8">
              {profile?.photo_url ? (
                <img
                  src={profile.photo_url}
                  alt={name}
                  className="h-36 w-36 rounded-full border border-border/70 object-cover shadow-glow"
                />
              ) : (
                <div className="grid h-36 w-36 place-items-center rounded-full border border-dashed border-border bg-card/60 text-muted-foreground">
                  <User className="h-12 w-12" />
                </div>
              )}
            </div>

            <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">{name}</h1>
            {profile?.headline && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-primary">
                <Sparkles className="h-4 w-4" /> {profile.headline}
              </p>
            )}
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-[1.7fr_1fr]">
            {/* Biografia (spazio centrale) */}
            <article className="rounded-2xl border bg-card/50 p-7 shadow-card">
              <h2 className="text-lg font-semibold">Biografia</h2>
              <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
                {loading ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 w-full rounded bg-card/70" />
                    <div className="h-4 w-5/6 rounded bg-card/70" />
                    <div className="h-4 w-4/6 rounded bg-card/70" />
                  </div>
                ) : bioParagraphs.length > 0 ? (
                  bioParagraphs.map((p, i) => <p key={i}>{p}</p>)
                ) : (
                  <p>La biografia sarà disponibile a breve.</p>
                )}
              </div>
            </article>

            {/* Card contatti */}
            <aside className="h-fit rounded-2xl border bg-card/50 p-6 shadow-card">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Mail className="h-5 w-5 text-primary" /> Contatti
              </h2>
              <ul className="mt-4 space-y-3 text-sm">
                {profile?.email && (
                  <ContactRow icon={Mail} label="Email" value={profile.email} href={`mailto:${profile.email}`} />
                )}
                {profile?.location && <ContactRow icon={MapPin} label="Località" value={profile.location} />}
                {(profile?.contacts ?? []).map((c, i) => (
                  <ContactRow key={i} icon={Link2} label={c.label} value={c.value} href={c.href} />
                ))}
                {!loading &&
                  !profile?.email &&
                  !profile?.location &&
                  (profile?.contacts?.length ?? 0) === 0 && (
                    <li className="text-muted-foreground">Nessun contatto disponibile al momento.</li>
                  )}
              </ul>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 transition-colors hover:border-primary/40">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
  return (
    <li>
      {href ? (
        <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
          {body}
        </a>
      ) : (
        body
      )}
    </li>
  );
}
