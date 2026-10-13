/**
 * Entry per il prerender delle pagine pubbliche (scripts/prerender.mjs), eseguito in Node al build.
 * Qui c'è solo l'albero React; lo stream verso stringa lo gestisce lo script.
 *
 * L'albero dei provider deve restare IDENTICO a quello di main.tsx (cambia solo il router),
 * altrimenti l'idratazione nel browser non combacia con l'HTML statico.
 */
// In react-router 7 StaticRouter sta nel pacchetto principale: il sottopercorso "/server" della v6
// non esiste più, e importarlo faceva fallire la build su Netlify (che installa dal lock, quindi la v7).
import { StaticRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/ui/toast";
import { ErrorBoundary } from "./components/ErrorBoundary";

export { renderToPipeableStream } from "react-dom/server";
export { SITE_URL, ssrSeo } from "./lib/seo";
export { ssrData } from "./lib/ssrData";
export { getDocSettings, getPublicDocBlocks } from "./lib/docs";
export { getAuthorProfile } from "./lib/profile";
export { parseChangelog } from "./lib/changelog";

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
