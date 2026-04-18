import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { Toaster } from "sonner";
import { LangProvider } from "@/lib/i18n";
import { ConfirmProvider } from "@/lib/confirm";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LangProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </LangProvider>
    <Toaster
      position="bottom-right"
      theme="dark"
      toastOptions={{
        style: {
          background: "var(--color-bg-elevated)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
        },
      }}
    />
  </React.StrictMode>,
);
