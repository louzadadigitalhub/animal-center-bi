import { forwardRef, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import MapLibre, { Marker, Popup, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/utils";

const FREE_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export const Map = forwardRef(function Map(
  {
    viewport,
    onViewportChange,
    initialViewState,
    mapStyle = FREE_STYLE,
    className,
    children,
    ...rest
  },
  ref
) {
  const controlled = viewport
    ? {
        longitude: viewport.center[0],
        latitude: viewport.center[1],
        zoom: viewport.zoom,
        bearing: viewport.bearing || 0,
        pitch: viewport.pitch || 0,
      }
    : undefined;

  const onMove = useCallback(
    (e) => {
      if (!onViewportChange) return;
      onViewportChange({
        center: [e.viewState.longitude, e.viewState.latitude],
        zoom: e.viewState.zoom,
        bearing: e.viewState.bearing,
        pitch: e.viewState.pitch,
      });
    },
    [onViewportChange]
  );

  return (
    <MapLibre
      ref={ref}
      {...controlled}
      initialViewState={
        controlled
          ? undefined
          : initialViewState || {
              longitude: -51.9617,
              latitude: -29.4669,
              zoom: 12,
              bearing: 0,
              pitch: 0,
            }
      }
      onMove={onMove}
      mapLib={maplibregl}
      mapStyle={mapStyle}
      attributionControl
      reuseMaps
      className={cn("h-full w-full", className)}
      style={{ width: "100%", height: "100%" }}
      {...rest}
    >
      {children}
    </MapLibre>
  );
});

export const MapMarker = forwardRef(function MapMarker({ longitude, latitude, children, ...props }, ref) {
  return (
    <Marker ref={ref} longitude={longitude} latitude={latitude} {...props}>
      {children}
    </Marker>
  );
});

export function MapPopup({ longitude, latitude, children, ...props }) {
  return (
    <Popup longitude={longitude} latitude={latitude} closeButton={false} closeOnClick={false} offset={18} {...props}>
      {children}
    </Popup>
  );
}

export function MapControls(props) {
  return <NavigationControl position="top-right" showCompass {...props} />;
}
