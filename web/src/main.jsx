import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import SellerApp from "./SellerApp.jsx";
import RankingPublico from "./RankingPublico.jsx";
import { Avaliar, TvVets } from "./Publico.jsx";
import "./index.css";

// Tema aplicado antes de renderizar: vale para o dashboard e para /eu
document.documentElement.dataset.theme = localStorage.getItem("ac-theme") || "dark";

const rota = window.location.pathname;
const seller = rota === "/eu" || rota.startsWith("/eu/");
// /ranking e o telao do corredor: publico, sem login, sem dado de tutor
const ranking = rota === "/ranking" || rota.startsWith("/ranking/");
// /tv e a Coroa de Ouro na TV; /avaliar/<token> e a nota do tutor. Sem login.
const tv = rota === "/tv" || rota.startsWith("/tv/");
const avaliar = rota.match(/^\/avaliar\/([A-Za-z0-9_-]+)/);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {avaliar ? <Avaliar token={avaliar[1]} /> : tv ? <TvVets /> : ranking ? <RankingPublico /> : seller ? <SellerApp /> : <App />}
  </StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
