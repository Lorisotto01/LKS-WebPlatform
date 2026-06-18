import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

/** Catches render-time errors so the app never fails to a silent blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[SecureLocalShare] Errore di rendering:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>Si è verificato un errore</h1>
            <p style={{ color: "#9aa4b2", marginBottom: 16 }}>
              L'applicazione ha riscontrato un problema imprevisto.
            </p>
            <pre style={{ textAlign: "left", whiteSpace: "pre-wrap", background: "#1a1f29", padding: 12, borderRadius: 8, fontSize: 12, color: "#e5e7eb" }}>
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
