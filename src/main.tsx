import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/mainStyle.css";
import "./styles/summaryBox.css";
import "./styles/backgroundPages.css";
import "./styles/buttons.css";
import "./styles/animations.css";
import "./styles/styleAI.css";
import "./styles/images.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
