import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { prefetchCore } from "./lib/data";
import "./styles/theme.css";

prefetchCore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
