import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import SellerApp from "./SellerApp.jsx";
import "./index.css";

// Tema aplicado antes de renderizar: vale para o dashboard e para /eu
document.documentElement.dataset.theme = localStorage.getItem("ac-theme") || "dark";

const seller = window.location.pathname === "/eu" || window.location.pathname.startsWith("/eu/");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {seller ? <SellerApp /> : <App />}
  </StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
