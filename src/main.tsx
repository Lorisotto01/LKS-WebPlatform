import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/ui/toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
// Inter variabile ospitato in locale (niente Google Fonts: -2 origini e niente CSS esterno che blocca il rendering)
import "@fontsource-variable/inter";
import "./theme/index.css";

// L'albero dei provider è replicato in entry-server.tsx (prerender): tenerli allineati.
const tree = (
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

const root = document.getElementById("root")!;
// Pagine pubbliche: l'HTML è già prerenderizzato al build → si idrata. Le altre (login, dashboard…)
// arrivano dalla shell vuota app.html → rendering normale lato client.
if (root.firstElementChild) ReactDOM.hydrateRoot(root, tree);
else ReactDOM.createRoot(root).render(tree);
