import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "./context/ThemeContext";
import { installErrorReporter } from "./lib/errorReporter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ConfigurationErrorScreen } from "./components/ConfigurationErrorScreen";
import { runtimeConfig } from "./lib/runtimeConfig";

installErrorReporter();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    {runtimeConfig.isValid ? (
      <ThemeProvider>
        <App />
      </ThemeProvider>
    ) : (
      <ConfigurationErrorScreen errors={runtimeConfig.errors} />
    )}
  </ErrorBoundary>
);
