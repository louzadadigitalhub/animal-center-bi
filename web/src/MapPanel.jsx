import { useMemo, useRef, useState } from "react";
import { Map, MapControls, MapMarker, MapPopup } from "@/components/ui/map";

const LAJEADO = { center: [-51.9617, -29.4669], zoom: 12, bearing: 0, pitch: 0 };

function pinList(clients, points) {
  if (clients?.length) {
    return clients
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
      .map((c) => ({
        id: String(c.codigo || c.nome),
        lng: c.lng,
        lat: c.lat,
        title: c.nome,
        subtitle: [c.endereco, c.numero].filter(Boolean).join(", ") || c.bairro || c.cep || "",
        kind: "cliente",
        payload: c,
      }));
  }
  return (points || [])
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p, i) => ({
      id: String(p.bairro || p.label || i),
      lng: p.lng,
      lat: p.lat,
      title: p.label || p.bairro,
      subtitle: `${p.n || 0} atendimentos`,
      kind: "bairro",
      payload: p,
    }));
}

export default function MapPanel({ points = [], clients = [], onSelect }) {
  const mapRef = useRef(null);
  const pins = useMemo(() => pinList(clients, points), [clients, points]);
  const [viewport, setViewport] = useState(LAJEADO);
  const [openId, setOpenId] = useState(null);
  const open = pins.find((p) => p.id === openId) || null;

  function onLoad() {
    const map = mapRef.current?.getMap?.();
    if (!map || pins.length < 2) return;
    const lngs = pins.map((p) => p.lng);
    const lats = pins.map((p) => p.lat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 48, maxZoom: 14, duration: 600 }
    );
  }

  return (
    <div className="geo-map" style={{ position: "relative", minHeight: 420, height: 420, overflow: "hidden" }}>
      <Map
        ref={mapRef}
        viewport={viewport}
        onViewportChange={setViewport}
        onLoad={onLoad}
      >
        <MapControls />
        {pins.map((p) => (
          <MapMarker key={p.id} longitude={p.lng} latitude={p.lat} anchor="bottom">
            <button
              type="button"
              className="map-pin"
              aria-label={p.title}
              onClick={(e) => {
                e.stopPropagation();
                setOpenId(p.id);
                onSelect?.({ kind: p.kind, payload: p.payload });
              }}
            >
              <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden>
                <path
                  d="M11 1.5c-5 0-9 4-9 9.1 0 6.4 9 16 9 16s9-9.6 9-16C20 5.5 16 1.5 11 1.5z"
                  fill="var(--accent)"
                  stroke="var(--bg)"
                  strokeWidth="1.2"
                />
                <circle cx="11" cy="10.2" r="3.2" fill="var(--bg)" />
              </svg>
            </button>
          </MapMarker>
        ))}
        {open ? (
          <MapPopup longitude={open.lng} latitude={open.lat} onClose={() => setOpenId(null)}>
            <strong>{open.title}</strong>
            {open.subtitle ? <p>{open.subtitle}</p> : null}
          </MapPopup>
        ) : null}
      </Map>
      <p className="map-count">
        {pins.length} {clients.length ? "tutores no cadastro" : "pontos"} neste recorte
      </p>
    </div>
  );
}
