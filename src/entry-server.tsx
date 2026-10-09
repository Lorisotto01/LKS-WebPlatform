/**
 * Entry per il prerender delle pagine pubbliche (scripts/prerender.mjs), eseguito in Node al build.
 * Qui c'è solo l'albero React; lo stream verso stringa lo gestisce lo script.
 *
 * L'albero dei provider deve restare IDENTICO a quello di main.tsx (cambia solo il router),
 * altrimenti l'idratazione nel browser non combacia con l'HTML statico.
 */
import { StaticRouter } from "react-router-dom/server";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/ui/toast";
import { ErrorBoundary } from "./components/ErrorBoundary";

export { renderToPipeableStream } from "react-dom/server";
export { SITE_URL, ssrSeo } from "./lib/seo";

export function app(url: string) {
  return (
    <ErrorBoundary>
      <StaticRouter location={url}>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </StaticRouter>
    </ErrorBoundary>
  );
}
