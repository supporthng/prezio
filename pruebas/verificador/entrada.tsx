import { createRoot } from "react-dom/client";
import { Equipo } from "@/app/equipo/Equipo";
createRoot(document.getElementById("app")!).render(<Equipo sitio="https://prezio-jade.vercel.app" />);
