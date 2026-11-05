import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/base.css";
import "./styles/a9.css";
import "./styles/ui.css";
import "./styles/screens.css";
import "./styles/watchlist.css";
import "./styles/notifications.css";
import "./styles/screener.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
