import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AudioProvider } from "./contexts/AudioContext";
import { StationProvider } from "./contexts/StationContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AudioProvider>
      <StationProvider>
        <App />
      </StationProvider>
    </AudioProvider>
  </StrictMode>
);
