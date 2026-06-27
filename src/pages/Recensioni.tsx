import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquareQuote, Tag, ArrowRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { StarRating } from "@/components/StarRating";
import { useAuth } from "@/context/AuthContext";
import { listReviews, groupByVersion } from "@/lib/reviews";
import type { Review } from "@/types/database.types";

export function Recensioni() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listReviews().then((r) => {
      setReviews(r);
      setLoading(false);
    });
  }, []);

  const groups = groupByVersion(reviews);
  const overallAvg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

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

      <section className="relative overflow-hidden border-b border-border/50">
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-[320px] bg-hero-glow" />
        <div className="relative mx-auto max-w-4xl px-6 py-16 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <MessageSquareQuote className="h-3.5 w-3.5 text-primary" /> Recensioni
          </span>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">Cosa dicono gli utenti</h1>
          {reviews.length > 0 && (
            <div className="mt-5 inline-flex items-center gap-3 rounded-full border border-border/70 bg-card/60 px-5 py-2">
              <StarRating value={Math.round(overallAvg)} size={18} />
              <span className="text-sm">
                <strong>{overallAvg.toFixed(1)}</strong>
                <span className="text-muted-foreground"> su 5 · {reviews.length} recensioni</span>
              </span>
            </div>
          )}
          <p className="mx-auto mt-5 max-w-lg text-muted-foreground">
            {user ? (
              <>
                Hai una versione installata?{" "}
                <Link to="/dashboard" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  Lascia la tua recensione <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <>
                Vuoi recensire una versione?{" "}
                <Link to="/login" className="font-medium text-primary hover:underline">
                  Accedi
                </Link>{" "}
                e scrivi la tua dalla dashboard.
              </>
            )}
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-4xl px-6 py-14">
        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border bg-card/40" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="rounded-xl border bg-card/40 p-10 text-center text-muted-foreground">
            Ancora nessuna recensione. Sii il primo a lasciarne una dalla tua dashboard.
          </p>
        ) : (
          <div className="space-y-12">
            {groups.map((g) => (
              <section key={g.version}>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <h2 className="inline-flex items-center gap-2 font-mono text-xl font-bold">
                    <Tag className="h-5 w-5 text-primary" /> {g.version}
                  </h2>
                  <span className="inline-flex items-center gap-2 rounded-full bg-card/60 px-3 py-1 text-xs text-muted-foreground">
                    <StarRating value={Math.round(g.avg)} size={14} /> {g.avg.toFixed(1)} · {g.items.length}{" "}
                    {g.items.length === 1 ? "recensione" : "recensioni"}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {g.items.map((r) => (
                    <ReviewCard key={r.id} review={r} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const author = review.author_name || maskEmail(review.email) || "Utente";
  return (
    <article className="rounded-xl border bg-card/50 p-5 shadow-card transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between gap-2">
        <StarRating value={review.rating} size={16} />
        <span className="text-xs text-muted-foreground">
          {new Date(review.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </div>
      <h3 className="mt-3 font-semibold">{review.titolo}</h3>
      {review.descrizione && <p className="mt-1.5 text-sm text-muted-foreground">{review.descrizione}</p>}
      <p className="mt-3 text-xs text-muted-foreground">— {author}</p>
    </article>
  );
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [u, d] = email.split("@");
  if (!d) return email;
  const head = u.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
}
