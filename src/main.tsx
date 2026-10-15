import ReactDOM from "react-dom/client";
import { MoneyGarden } from "./ui/App";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import "./ui/global.css";

// No StrictMode: the reference mounts the tree directly, and StrictMode's
// dev-only double effects would run the async storage load twice.
// ErrorBoundary: a render crash shows a rescue screen, not a blank page.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <MoneyGarden />
  </ErrorBoundary>,
);

// Offline support — hosted build only. The single-file build has nothing to
// precache, and service workers don't exist on file:// anyway.
if (
  !__SINGLE_FILE__ &&
  import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  /^https?:$/.test(location.protocol)
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {
      /* offline support is progressive — the app works without it */
    });
  });
}
