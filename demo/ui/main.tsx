import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppBoundary } from "./AppBoundary";
import { IntroGate } from "./IntroGate";
import "./design.css";
import "./Universal.css";
import "./ShowcaseTheme.css";

try { document.documentElement.dataset.theme = localStorage.getItem("allday-demo-theme") === "dark" ? "dark" : "light"; } catch { document.documentElement.dataset.theme = "light"; }

createRoot(document.getElementById("root")!).render(<React.StrictMode><AppBoundary><IntroGate><App/></IntroGate></AppBoundary></React.StrictMode>);
