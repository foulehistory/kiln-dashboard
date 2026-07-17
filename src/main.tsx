import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initialTheme } from "./theme";
import "./index.css";

// Set before the first paint, not in a useEffect - otherwise the window
// flashes the default dark theme for a frame before switching to a stored
// or system-preferred light theme.
document.documentElement.dataset.theme = initialTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
