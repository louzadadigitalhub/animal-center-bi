import { useEffect, useRef } from "react";

export default function MapPanel({ points = [], onSelect }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    const L = window.L;
    if (!L || !ref.current) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    const map = L.map(ref.current, { zoomControl: true }).setView([-29.467, -51.962], 12);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OSM &copy; CARTO",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    const layer = L.layerGroup().addTo(map);
    layerRef.current = layer;
    draw(L, layer, points, onSelect);
    if (points.length) {
      const b = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
      if (b.isValid()) map.fitBounds(b.pad(0.18));
    }
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    draw(L, layer, points, onSelect);
    if (points.length) {
      const b = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
      if (b.isValid()) map.fitBounds(b.pad(0.18));
    }
  }, [points, onSelect]);

  return <div ref={ref} className="geo-map" />;
}

function draw(L, layer, points, onSelect) {
  for (const p of points) {
    const m = L.circleMarker([p.lat, p.lng], {
      radius: Math.min(5.5, 2.4 + Math.sqrt(p.n || 1) * 0.35),
      color: "#3ec8f0",
      weight: 1,
      fillColor: "#3ec8f0",
      fillOpacity: 0.7,
    });
    m.bindTooltip(`${p.label} · ${p.n} atend.`);
    m.on("click", () => onSelect && onSelect(p));
    m.addTo(layer);
  }
}
