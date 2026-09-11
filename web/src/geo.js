const CITIES = {
  95900: { cidade: "Lajeado", lat: -29.4669, lng: -51.9617 },
  95901: { cidade: "Lajeado", lat: -29.458, lng: -51.952 },
  95902: { cidade: "Lajeado", lat: -29.474, lng: -51.97 },
  95903: { cidade: "Lajeado", lat: -29.452, lng: -51.968 },
  95904: { cidade: "Lajeado", lat: -29.462, lng: -51.948 },
  95905: { cidade: "Lajeado", lat: -29.48, lng: -51.955 },
  95906: { cidade: "Lajeado", lat: -29.47, lng: -51.94 },
  95907: { cidade: "Lajeado", lat: -29.455, lng: -51.975 },
  95908: { cidade: "Lajeado", lat: -29.445, lng: -51.958 },
  95909: { cidade: "Lajeado", lat: -29.488, lng: -51.965 },
  95910: { cidade: "Lajeado", lat: -29.44, lng: -51.945 },
  95911: { cidade: "Lajeado", lat: -29.49, lng: -51.94 },
  95912: { cidade: "Lajeado", lat: -29.435, lng: -51.97 },
  95913: { cidade: "Lajeado", lat: -29.5, lng: -51.95 },
  95914: { cidade: "Lajeado", lat: -29.43, lng: -51.955 },
  95915: { cidade: "Lajeado", lat: -29.478, lng: -51.98 },
  95880: { cidade: "Estrela", lat: -29.5006, lng: -51.9692 },
  95920: { cidade: "Arroio do Meio", lat: -29.4014, lng: -51.9456 },
  95800: { cidade: "Venancio Aires", lat: -29.6143, lng: -52.1931 },
  95940: { cidade: "Encantado", lat: -29.2361, lng: -51.87 },
};

const BAIRRO_OFF = {
  centro: [0, 0],
  florestal: [0.008, -0.007],
  floresta: [0.006, -0.011],
  montanha: [0.011, 0.007],
  moinhos: [-0.007, 0.01],
  "moinhos d agua": [-0.006, 0.012],
  universitario: [-0.01, -0.008],
  conventos: [0.014, 0.004],
  "sao pedro": [-0.013, 0.006],
  interior: [0.028, 0.02],
  "sao cristovao": [0.02, -0.018],
};

function nkey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function locate({ cep, bairro, id }) {
  const prefix = String(cep || "").replace(/\D/g, "").slice(0, 5);
  const base = CITIES[prefix] || { cidade: "Lajeado", lat: -29.4669, lng: -51.9617 };
  const off = BAIRRO_OFF[nkey(bairro)] || [0, 0];
  const j = hash(id || bairro || cep);
  const jlat = ((j % 17) - 8) * 0.00035;
  const jlng = (((j >> 4) % 17) - 8) * 0.00035;
  return {
    cidade: base.cidade,
    lat: base.lat + off[0] + jlat,
    lng: base.lng + off[1] + jlng,
  };
}
