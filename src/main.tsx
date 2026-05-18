import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// Register multiplayer games globally so they're available on any route (e.g. /room/:id)
import "@/lib/multiplayer/games/uno";
import "@/lib/multiplayer/games/poker";

createRoot(document.getElementById("root")!).render(<App />);
