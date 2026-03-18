"use client";

/**
 * AirspaceViewer v5
 * ──────────────────────────────────────────────────────────────────────────────
 * Features:
 *  • Mapbox satellite, pitch 55°, rotatable/pannable globe view
 *  • Outside radius: dark + CSS blur vignette; inside: full map
 *  • Radius slider 5–50 NM → map zoom auto-adjusts to keep circle in frame
 *  • "Data Source" toggle: Simulated (Data.ts) ↔ Live (RapidAPI ADS-B)
 *  • Simulated: flights from Data.ts filtered to pass within radius, animated
 *  • Drone layer: city-specific 25 drones per Canadian city, ≤300 ft AGL,
 *    ≤1 km there-and-back, ~10 min flight, looping
 *  • Live ADS-B: RapidAPI polling every 8 s when toggled on
 *  • Layer toggles: Commercial, Drones, Military, Helicopters, Maritime (soon)
 *  • Click any aircraft → detail card
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { flights as ALL_FLIGHTS, type FlightData } from "@/lib/globe/Data";
import type { PollSnapshot, AircraftPosition } from "@/app/api/adsb-poll/route";

// ─── Constants ────────────────────────────────────────────────────────────────
const NM_TO_KM        = 1.852;
const DEG_TO_RAD      = Math.PI / 180;
const POLL_MS         = 8_000;
const LIVE_TRAIL_MAX  = 40;
const SIM_SPEED       = 0.010;      // route fraction / sec  (~100 s full loop)
const SIM_TRAIL_MAX   = 90;
const CRUISE_FT       = 33_000;
const MAP_STYLE       = "mapbox://styles/mapbox/satellite-streets-v12";

// Drone constants
const DRONE_SPEED     = 0.0028;    // fraction of 2-km round trip / sec (~10 min)
const DRONE_TRAIL_MAX = 60;
const DRONE_MAX_FT    = 300;       // AGL ceiling

// ─── Colour ramp ──────────────────────────────────────────────────────────────
function altRGB(ft: number): [number, number, number] {
  if (ft > 30_000) return [0,   229, 255];
  if (ft > 20_000) return [0,   200, 120];
  if (ft > 10_000) return [160, 230,  40];
  if (ft >  3_000) return [255, 200,   0];
  if (ft >    800) return [255, 120,   0];
  if (ft >    100) return [255,  80, 200]; // drones — magenta/pink
  return                  [200,  80, 255]; // very low — purple
}

// ─── Geo helpers ──────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
    Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function minDistSegKm(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  let best = Infinity;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const d = haversineKm(pLat, pLng, aLat + (bLat - aLat) * t, aLng + (bLng - aLng) * t);
    if (d < best) best = d;
  }
  return best;
}

function lerpPos(aLat: number, aLng: number, bLat: number, bLng: number, t: number) {
  return { lat: aLat + (bLat - aLat) * t, lng: aLng + (bLng - aLng) * t };
}

function arcFt(t: number, routeKm: number): number {
  return CRUISE_FT * Math.min(1, routeKm / 600) * Math.sin(Math.PI * t);
}

function hdg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const y = Math.sin(dLng) * Math.cos(lat2 * DEG_TO_RAD);
  const x =
    Math.cos(lat1 * DEG_TO_RAD) * Math.sin(lat2 * DEG_TO_RAD) -
    Math.sin(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.cos(dLng);
  return ((Math.atan2(y, x) / DEG_TO_RAD) + 360) % 360;
}

/** Convert metres offset to lat/lng delta */
function offsetLatLng(lat: number, lng: number, dxM: number, dyM: number) {
  return {
    lat: lat + (dyM / 111_320),
    lng: lng + (dxM / (111_320 * Math.cos(lat * DEG_TO_RAD))),
  };
}

/**
 * Compute the Mapbox zoom level that fits a radius (km) nicely in the viewport.
 * Formula derived from Mapbox tile size (512px) and equatorial tile width.
 */
function radiusToZoom(radiusKm: number, lat: number, viewportPx: number): number {
  // We want the diameter (2×radius) to fill ~85% of the viewport
  const targetPx = viewportPx * 0.85;
  const metersPerPx =
    (2 * radiusKm * 1000) / targetPx;
  // meters/px at given lat for zoom z: 156543.03 * cos(lat) / 2^z
  const zoom = Math.log2((156_543.03 * Math.cos(lat * DEG_TO_RAD)) / metersPerPx);
  return Math.max(6, Math.min(15, zoom));
}

// ─── Drone flight data per Canadian city ─────────────────────────────────────
// 25 drones per city; each has a home point and a waypoint ≤1 km away.
// Flights are there-and-back (ping-pong), 10-min loop.
// Positions defined as [dxM, dyM] offsets from city centre.
const CITY_DRONES: Record<string, Array<[number, number, number, number]>> = {
  // [homeDxM, homeDyM, wpDxM, wpDyM]  (metres east/north from city centre)
  "toronto": [
    [-800, 200, -400, 500], [300, -600, 700, -300], [-200, 800, 200, 400],
    [600, 400, 900, 100], [-500, -400, -100, -700], [100, 600, -300, 900],
    [700, -500, 400, -800], [-600, 100, -900, 400], [200, -300, 500, 0],
    [-300, 700, 0, 400], [800, 200, 500, 500], [-100, -800, -400, -500],
    [400, 300, 100, 600], [-700, 600, -400, 300], [500, -200, 800, 100],
    [-200, -500, 100, -800], [600, 700, 300, 400], [-800, -200, -500, 100],
    [300, 800, 0, 500], [700, 0, 400, 300], [-400, 400, -700, 100],
    [100, -700, 400, -400], [-600, -600, -300, -300], [800, -300, 500, 0],
    [-100, 300, 200, 600],
  ],
  "montreal": [
    [-700, 300, -300, 600], [400, -500, 800, -200], [-300, 700, 100, 400],
    [500, 300, 800, 0], [-400, -500, 0, -800], [200, 500, -200, 800],
    [800, -400, 500, -700], [-500, 200, -800, 500], [300, -200, 600, 100],
    [-200, 600, 100, 300], [700, 100, 400, 400], [-100, -700, -400, -400],
    [500, 200, 200, 500], [-600, 500, -300, 200], [600, -100, 900, 200],
    [-300, -400, 0, -700], [700, 600, 400, 300], [-700, -100, -400, 200],
    [400, 700, 100, 400], [600, 100, 300, 400], [-300, 300, -600, 0],
    [200, -600, 500, -300], [-500, -500, -200, -200], [700, -200, 400, 100],
    [-200, 200, 100, 500],
  ],
  "vancouver": [
    [-600, 400, -200, 700], [300, -700, 700, -400], [-400, 600, 0, 300],
    [700, 200, 400, 500], [-300, -600, 100, -900], [100, 700, -300, 400],
    [600, -600, 300, -900], [-700, 0, -400, 300], [400, -100, 700, 200],
    [-100, 800, 200, 500], [900, 100, 600, 400], [0, -800, -300, -500],
    [300, 400, 0, 700], [-800, 700, -500, 400], [400, -300, 700, 0],
    [-100, -600, 200, -900], [500, 800, 200, 500], [-900, -300, -600, 0],
    [200, 900, -100, 600], [800, 100, 500, 400], [-500, 200, -800, -100],
    [0, -900, 300, -600], [-700, -700, -400, -400], [600, -400, 300, -100],
    [-300, 100, 0, 400],
  ],
  "calgary": [
    [-500, 500, -100, 800], [200, -800, 600, -500], [-600, 400, -200, 100],
    [800, 100, 500, 400], [-200, -700, 200, -400], [300, 400, -100, 700],
    [700, -700, 400, -400], [-400, 300, -700, 600], [500, 0, 800, 300],
    [-300, 500, 0, 200], [600, 200, 300, 500], [-200, -600, -500, -300],
    [400, 100, 100, 400], [-700, 400, -400, 100], [700, -200, 500, 100],
    [-400, -300, -100, -600], [800, 500, 500, 200], [-600, -200, -300, 100],
    [300, 600, 0, 300], [500, 200, 200, 500], [-600, 100, -300, -200],
    [100, -800, 400, -500], [-400, -400, -100, -100], [900, -100, 600, 200],
    [-100, 400, 200, 700],
  ],
  "edmonton": [
    [-700, 200, -300, 500], [500, -400, 900, -100], [-200, 800, 200, 500],
    [400, 400, 700, 100], [-600, -300, -200, -600], [200, 300, -200, 600],
    [600, -800, 300, -500], [-800, 100, -500, 400], [300, -500, 600, -200],
    [-400, 600, -100, 300], [700, 300, 400, 600], [0, -900, -300, -600],
    [500, 0, 200, 300], [-500, 700, -200, 400], [800, -100, 500, 200],
    [-300, -200, 0, -500], [600, 600, 300, 300], [-900, -100, -600, 200],
    [100, 800, -200, 500], [900, 0, 600, 300], [-200, 300, -500, 0],
    [300, -700, 600, -400], [-600, -800, -300, -500], [700, -500, 400, -200],
    [-100, 500, 200, 800],
  ],
  "ottawa": [
    [-400, 600, 0, 900], [300, -900, 700, -600], [-500, 300, -100, 600],
    [600, 200, 900, -100], [-300, -600, 100, -900], [100, 500, -300, 800],
    [800, -600, 500, -900], [-600, 200, -900, 500], [400, -200, 700, 100],
    [-200, 700, 100, 400], [800, 200, 500, 500], [-100, -700, -400, -400],
    [300, 300, 0, 600], [-700, 500, -400, 200], [600, -100, 900, 200],
    [-400, -400, -100, -700], [700, 700, 400, 400], [-800, -200, -500, 100],
    [200, 800, -100, 500], [700, 100, 400, 400], [-500, 100, -800, -200],
    [100, -800, 400, -500], [-700, -600, -400, -300], [800, -200, 500, 100],
    [-200, 200, 100, 500],
  ],
  "winnipeg": [
    [-900, 100, -500, 400], [400, -600, 800, -300], [-300, 900, 100, 600],
    [500, 500, 800, 200], [-700, -200, -300, -500], [200, 400, -200, 700],
    [700, -900, 400, -600], [-500, 300, -800, 600], [600, -100, 900, 200],
    [-100, 700, 200, 400], [900, 200, 600, 500], [0, -800, -300, -500],
    [400, 100, 100, 400], [-600, 600, -300, 300], [500, -200, 800, 100],
    [-200, -500, 100, -800], [600, 800, 300, 500], [-800, -300, -500, 0],
    [300, 700, 0, 400], [800, 0, 500, 300], [-400, 200, -700, -100],
    [100, -700, 400, -400], [-500, -700, -200, -400], [700, -300, 400, 0],
    [-300, 200, 0, 500],
  ],
  "quebec-city": [
    [-600, 300, -200, 600], [400, -800, 800, -500], [-400, 700, 0, 400],
    [700, 100, 400, 400], [-200, -800, 200, -500], [100, 600, -300, 900],
    [900, -500, 600, -800], [-700, 100, -400, 400], [300, -300, 600, 0],
    [-300, 600, 0, 300], [600, 300, 300, 600], [-100, -900, -400, -600],
    [500, 100, 200, 400], [-800, 400, -500, 100], [700, -100, 400, 200],
    [-300, -300, 0, -600], [800, 600, 500, 300], [-700, -200, -400, 100],
    [200, 700, -100, 400], [600, 200, 300, 500], [-600, 0, -300, -300],
    [200, -700, 500, -400], [-400, -500, -100, -200], [800, -100, 500, 200],
    [-200, 300, 100, 600],
  ],
  "hamilton": [
    [-500, 400, -100, 700], [300, -700, 700, -400], [-600, 300, -200, 600],
    [600, 300, 900, 0], [-400, -500, 0, -800], [200, 600, -200, 900],
    [700, -600, 400, -900], [-400, 200, -700, 500], [400, -100, 700, 200],
    [-200, 800, 100, 500], [800, 100, 500, 400], [0, -800, -300, -500],
    [400, 200, 100, 500], [-700, 600, -400, 300], [500, -100, 800, 200],
    [-100, -600, 200, -900], [600, 700, 300, 400], [-800, -200, -500, 100],
    [300, 800, 0, 500], [700, 0, 400, 300], [-500, 100, -800, -200],
    [100, -900, 400, -600], [-600, -700, -300, -400], [700, -300, 400, 0],
    [-100, 400, 200, 700],
  ],
  "halifax": [
    [-600, 200, -200, 500], [300, -800, 700, -500], [-300, 700, 100, 400],
    [700, 100, 400, 400], [-200, -700, 200, -400], [200, 500, -200, 800],
    [800, -400, 500, -700], [-500, 200, -800, 500], [400, -200, 700, 100],
    [-100, 700, 200, 400], [700, 300, 400, 600], [-100, -800, -400, -500],
    [500, 100, 200, 400], [-600, 500, -300, 200], [600, -200, 900, 100],
    [-300, -300, 0, -600], [700, 600, 400, 300], [-800, -100, -500, 200],
    [200, 800, -100, 500], [800, 0, 500, 300], [-400, 200, -700, -100],
    [0, -800, 300, -500], [-500, -600, -200, -300], [800, -200, 500, 100],
    [-200, 300, 100, 600],
  ],
};

// Fallback: generate pseudo-random drones for any city not in the table
function genDronesForCity(lat: number, lng: number, seed: number): Array<[number, number, number, number]> {
  const drones: Array<[number, number, number, number]> = [];
  let s = seed;
  const rng = () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
  for (let i = 0; i < 25; i++) {
    const angle1  = rng() * Math.PI * 2;
    const dist1   = rng() * 800 + 50;
    const angle2  = angle1 + (rng() - 0.5) * 1.5;
    const dist2   = dist1 + rng() * 600 + 100;
    drones.push([
      Math.cos(angle1) * dist1, Math.sin(angle1) * dist1,
      Math.cos(angle2) * dist2, Math.sin(angle2) * dist2,
    ]);
  }
  return drones;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface SimAC {
  id:       string;
  f:        FlightData;
  routeKm:  number;
  t:        number;
  lat:      number; lng: number; altFt: number; track: number;
  trail:    Array<{ lat: number; lng: number; altFt: number }>;
}

interface DroneAC {
  id:       string;
  homeLat:  number; homeLng: number;
  wpLat:    number; wpLng:   number;
  routeKm:  number;
  t:        number;     // 0–1 ping-pong progress
  dir:      1 | -1;     // direction: forward | backward
  altFt:    number;
  lat:      number; lng: number; track: number;
  trail:    Array<{ lat: number; lng: number; altFt: number }>;
}

interface LiveTrail {
  pts:     Array<{ lat: number; lng: number; altFt: number; ts: number }>;
  current: AircraftPosition;
}

interface LayerState {
  commercial:  boolean;
  drones:      boolean;
  military:    boolean;
  helicopters: boolean;
  maritime:    boolean;
}

type DataSource = "sim" | "live";

interface Props {
  citySlug:    string;
  displayName: string;
  initialLat:  number | null;
  initialLng:  number | null;
  /** When false (projection mode), all HUD overlays are hidden */
  hudVisible?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AirspaceViewer({ displayName, initialLat, initialLng, citySlug, hudVisible = true }: Props) {
  const router        = useRouter();
  const mapDivRef     = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const interactRef   = useRef<HTMLDivElement>(null);  // transparent hit-test layer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef        = useRef<any>(null);
  const rafRef        = useRef<number>(0);
  const prevTRef      = useRef<number>(0);

  const simRef        = useRef<SimAC[]>([]);
  const dronesRef     = useRef<DroneAC[]>([]);
  const liveRef       = useRef<Map<string, LiveTrail>>(new Map());
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs for use inside RAF loop (no stale closures)
  const radiusRef     = useRef<number>(20);
  const layersRef     = useRef<LayerState>({ commercial: true, drones: true, military: true, helicopters: true, maritime: false });
  const sourceRef     = useRef<DataSource>("sim");
  const selRef        = useRef<{ kind: "sim" | "drone" | "live"; id: string } | null>(null);
  const hovRef        = useRef<string | null>(null);

  const [radiusNm,    setRadiusNm]   = useState(20);
  const [bearing,     setBearing]    = useState(0);
  const [pitch,       setPitch]      = useState(55);
  const [mapReady,    setMapReady]   = useState(false);
  const [error,       setError]      = useState<string | null>(null);
  const [simCount,    setSimCount]   = useState(0);
  const [liveCount,   setLiveCount]  = useState(0);
  const [droneCount,  setDroneCount] = useState(0);
  const [lastPoll,    setLastPoll]   = useState<Date | null>(null);
  const [layers,      setLayers]     = useState<LayerState>(layersRef.current);
  const [source,      setSource]     = useState<DataSource>("sim");
  const [selSim,      setSelSim]     = useState<SimAC | null>(null);
  const [selDrone,    setSelDrone]   = useState<DroneAC | null>(null);
  const [selAc,       setSelAc]      = useState<AircraftPosition | null>(null);

  const cityLat = initialLat ?? 43.6532;
  const cityLng = initialLng ?? -79.3832;

  // Sync refs
  useEffect(() => { radiusRef.current = radiusNm; }, [radiusNm]);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { sourceRef.current = source; }, [source]);

  // ─── Build simulated commercial aircraft ──────────────────────────────────
  const buildSim = useCallback((nm: number) => {
    const rKm = nm * NM_TO_KM;
    const qualifying = ALL_FLIGHTS.filter(f =>
      minDistSegKm(cityLat, cityLng, f.departure.lat, f.departure.lng, f.arrival.lat, f.arrival.lng) <= rKm
    );
    const acs: SimAC[] = qualifying.map((f, i) => {
      const routeKm = haversineKm(f.departure.lat, f.departure.lng, f.arrival.lat, f.arrival.lng);
      const t0      = i / Math.max(qualifying.length, 1);
      const pos     = lerpPos(f.departure.lat, f.departure.lng, f.arrival.lat, f.arrival.lng, t0);
      return { id: `sim-${i}`, f, routeKm, t: t0, lat: pos.lat, lng: pos.lng, altFt: arcFt(t0, routeKm), track: hdg(f.departure.lat, f.departure.lng, f.arrival.lat, f.arrival.lng), trail: [] };
    });
    simRef.current = acs;
    setSimCount(acs.length);
  }, [cityLat, cityLng]);

  // ─── Build drones for this city ───────────────────────────────────────────
  const buildDrones = useCallback(() => {
    const slug    = citySlug.toLowerCase().replace(/\s+/g, "-");
    const table   = CITY_DRONES[slug] ?? genDronesForCity(cityLat, cityLng, Math.round(cityLat * 1000 + cityLng * 1000));
    const drones: DroneAC[] = table.map(([hx, hy, wx, wy], i) => {
      const home = offsetLatLng(cityLat, cityLng, hx, hy);
      const wp   = offsetLatLng(cityLat, cityLng, wx, wy);
      const rKm  = haversineKm(home.lat, home.lng, wp.lat, wp.lng);
      const t0   = (i / table.length);
      return {
        id:      `drone-${i}`,
        homeLat: home.lat, homeLng: home.lng,
        wpLat:   wp.lat,   wpLng:   wp.lng,
        routeKm: rKm,
        t: t0, dir: 1 as const,
        altFt: DRONE_MAX_FT * Math.sin(Math.PI * t0),
        lat: home.lat, lng: home.lng,
        track: hdg(home.lat, home.lng, wp.lat, wp.lng),
        trail: [],
      };
    });
    dronesRef.current = drones;
    setDroneCount(drones.length);
  }, [cityLat, cityLng, citySlug]);

  useEffect(() => { buildSim(radiusNm); }, [radiusNm, buildSim]);
  useEffect(() => { buildDrones(); }, [buildDrones]);

  // ─── Mapbox init ──────────────────────────────────────────────────────────
  useEffect(() => {
    const container = mapDivRef.current;
    if (!container) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) { setError("Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local"); return; }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mapboxgl = require("mapbox-gl");
    mapboxgl.accessToken = token;

    const initZoom = radiusToZoom(radiusNm * NM_TO_KM, cityLat, window.innerWidth);
    const map = new mapboxgl.Map({
      container,
      style:    MAP_STYLE,
      center:   [cityLng, cityLat],
      zoom:     initZoom,
      pitch:    55,
      bearing:  -20,
      antialias: true,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");

    map.on("load", () => {
      if (map.getLayer("building")) {
        map.addLayer({
          id: "3d-buildings", source: "composite", "source-layer": "building",
          type: "fill-extrusion", minzoom: 13,
          paint: { "fill-extrusion-color": "#0a1020", "fill-extrusion-height": ["get", "height"], "fill-extrusion-opacity": 0.55 },
        }, "building");
      }

      // ── Ground-locked radius circle (GeoJSON line, sticks to the earth) ──
      const circleGeo = makeCircleGeoJSON(cityLat, cityLng, 20);
      map.addSource("radius-ring", { type: "geojson", data: circleGeo });
      // Subtle filled disc inside
      map.addLayer({
        id: "radius-fill", type: "fill", source: "radius-ring",
        paint: { "fill-color": "#00e5ff", "fill-opacity": 0.04 },
      });
      // Glowing ring border
      map.addLayer({
        id: "radius-border", type: "line", source: "radius-ring",
        paint: {
          "line-color": "#00e5ff",
          "line-width": 2.5,
          "line-opacity": 0.75,
          "line-blur": 1,
        },
      });
      // Second dashed ring slightly outside for sci-fi look
      map.addLayer({
        id: "radius-dash", type: "line", source: "radius-ring",
        paint: {
          "line-color": "#00e5ff",
          "line-width": 1,
          "line-opacity": 0.35,
          "line-dasharray": [4, 5],
        },
      });
      // City centre dot
      map.addSource("city-dot", {
        type: "geojson",
        data: { type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [cityLng, cityLat] } },
      });
      map.addLayer({
        id: "city-dot-layer", type: "circle", source: "city-dot",
        paint: { "circle-radius": 5, "circle-color": "#00e5ff", "circle-opacity": 0.9, "circle-stroke-width": 2, "circle-stroke-color": "rgba(0,229,255,0.4)" },
      });

      mapRef.current = map;
      setMapReady(true);
    });

    map.on("error", (e: unknown) => console.error("[Mapbox]", e));

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Auto-zoom when radius changes ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const vp  = Math.min(window.innerWidth, window.innerHeight);
    const z   = radiusToZoom(radiusNm * NM_TO_KM, cityLat, vp);
    map.easeTo({ zoom: z, duration: 600 });
  }, [radiusNm, mapReady, cityLat]);

  // ─── Bearing / pitch sync ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.easeTo({ bearing, duration: 300 });
  }, [bearing, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.easeTo({ pitch, duration: 300 });
  }, [pitch, mapReady]);

  // ─── Update ground-locked circle ring when radius changes ────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource("radius-ring") as { setData?: (d: unknown) => void } | undefined;
    if (src?.setData) src.setData(makeCircleGeoJSON(cityLat, cityLng, radiusNm));
  }, [radiusNm, mapReady, cityLat, cityLng]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapReady) return;

    const syncCanvas = () => {
      const dpr    = window.devicePixelRatio || 1;
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    syncCanvas();
    window.addEventListener("resize", syncCanvas);
    prevTRef.current = performance.now();

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const map = mapRef.current;
      const ctx = canvas.getContext("2d");
      if (!map || !ctx) return;

      const dt  = Math.min((now - prevTRef.current) / 1000, 0.1);
      prevTRef.current = now;
      const dpr = window.devicePixelRatio || 1;
      const W   = canvas.width, H = canvas.height;
      const L   = layersRef.current;
      const src = sourceRef.current;

      // ── Compute circle centre + radius in canvas px ─────────────────────
      let cx = W / 2, cy = H / 2;
      let circleRadPx = 220;
      try {
        const cPt = map.project([cityLng, cityLat]);
        cx = cPt.x * dpr;
        cy = cPt.y * dpr;
        const latOff = (radiusRef.current * NM_TO_KM) / 111.32;
        const ePt    = map.project([cityLng, cityLat + latOff]);
        circleRadPx  = Math.abs(cy - ePt.y * dpr);
      } catch { /* fallback */ }

      ctx.clearRect(0, 0, W, H);

      // ── 1. Outside-radius dark vignette (tracks the map projection) ──────
      // The hard ring is a Mapbox GeoJSON layer (ground-locked).
      // Here we just darken everything outside the projected circle so that
      // tiles outside the radius are dimmed but still hint at the globe shape.
      const grad = ctx.createRadialGradient(cx, cy, circleRadPx * 0.82, cx, cy, circleRadPx * 1.22);
      grad.addColorStop(0,   "rgba(0,0,0,0)");
      grad.addColorStop(0.5, "rgba(0,0,0,0.62)");
      grad.addColorStop(1,   "rgba(0,0,0,0.93)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Solid black beyond ~1.25× the circle (clips tiles that are way off)
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.96)";
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(cx, cy, circleRadPx * 1.25, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
      ctx.restore();

      // ── Altitude → vertical offset scale ─────────────────────────────────
      const altScale = (circleRadPx / CRUISE_FT) * 0.3;

      const project = (lat: number, lng: number, altFt: number): [number, number] | null => {
        try {
          const pt = map.project([lng, lat]);
          return [pt.x * dpr, pt.y * dpr - altFt * altScale];
        } catch { return null; }
      };

      // ── 3. Simulated commercial flights ──────────────────────────────────
      if (src === "sim" && L.commercial) {
        for (const ac of simRef.current) {
          ac.t = (ac.t + dt * SIM_SPEED) % 1;
          const pos    = lerpPos(ac.f.departure.lat, ac.f.departure.lng, ac.f.arrival.lat, ac.f.arrival.lng, ac.t);
          ac.lat       = pos.lat; ac.lng = pos.lng;
          ac.altFt     = arcFt(ac.t, ac.routeKm);
          const tNext  = Math.min(ac.t + 0.005, 0.999);
          const nxt    = lerpPos(ac.f.departure.lat, ac.f.departure.lng, ac.f.arrival.lat, ac.f.arrival.lng, tNext);
          ac.track     = hdg(pos.lat, pos.lng, nxt.lat, nxt.lng);
          ac.trail.push({ lat: ac.lat, lng: ac.lng, altFt: ac.altFt });
          if (ac.trail.length > SIM_TRAIL_MAX) ac.trail.shift();

          drawTrail(ctx, ac.trail, project, dpr, false);
          const sp = project(ac.lat, ac.lng, ac.altFt);
          if (sp) {
            const [r, g, b] = altRGB(ac.altFt);
            const isSel = selRef.current?.kind === "sim" && selRef.current.id === ac.id;
            const isHov = hovRef.current === ac.id;
            const sz    = (isSel ? 11 : isHov ? 9 : 7) * dpr;
            ctx.save();
            ctx.translate(sp[0], sp[1]);
            ctx.rotate((ac.track * Math.PI) / 180);
            ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
            ctx.shadowBlur  = (isSel ? 22 : 10) * dpr;
            drawPlane(ctx, sz, r, g, b);
            ctx.restore();
          }
        }
      }

      // ── 4. Live ADS-B ─────────────────────────────────────────────────────
      if (src === "live") {
        const nowMs = Date.now();
        for (const [, trail] of liveRef.current) {
          // Sub-layer filtering
          const cat = trail.current.category?.toUpperCase() ?? "";
          const typ = trail.current.type?.toUpperCase() ?? "";
          const isHeli = cat === "A7" || ["R22","R44","H60","EC35"].some(t => typ.includes(t));
          const isMil  = cat.startsWith("B") || ["RCH","REACH","DUKE"].some(c => (trail.current.callsign ?? "").startsWith(c));
          if (isHeli && !L.helicopters) continue;
          if (isMil  && !L.military)    continue;
          if (!isHeli && !isMil && !L.commercial) continue;

          // Trail
          ctx.save();
          for (let i = 1; i < trail.pts.length; i++) {
            const p0 = trail.pts[i - 1], p1 = trail.pts[i];
            const s0 = project(p0.lat, p0.lng, p0.altFt);
            const s1 = project(p1.lat, p1.lng, p1.altFt);
            if (!s0 || !s1) continue;
            const age   = (nowMs - p0.ts) / (LIVE_TRAIL_MAX * POLL_MS);
            const alpha = Math.max(0, 1 - age) * 0.88;
            const [r, g, b] = altRGB(p0.altFt);
            ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]);
            ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
            ctx.lineWidth   = 2.5 * dpr; ctx.lineCap = "round";
            ctx.shadowColor = `rgba(${r},${g},${b},0.4)`; ctx.shadowBlur = 4 * dpr;
            ctx.stroke();
          }
          ctx.restore();

          const cur = trail.pts[trail.pts.length - 1];
          if (!cur) continue;
          const sp = project(cur.lat, cur.lng, cur.altFt);
          if (!sp) continue;
          const [r, g, b] = altRGB(trail.current.altFt);
          const isSel = selRef.current?.kind === "live" && selRef.current.id === trail.current.hex;
          const isHov = hovRef.current === trail.current.hex;
          const sz    = (isSel ? 11 : isHov ? 9 : 7) * dpr;
          ctx.save();
          ctx.translate(sp[0], sp[1]);
          ctx.rotate((trail.current.trackDeg * Math.PI) / 180);
          ctx.shadowColor = `rgba(${r},${g},${b},0.9)`; ctx.shadowBlur = (isSel ? 22 : 10) * dpr;
          drawPlane(ctx, sz, r, g, b);
          // live ring
          ctx.shadowBlur = 0;
          ctx.beginPath(); ctx.arc(0, 0, sz * 0.42, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(105,240,174,0.5)"; ctx.lineWidth = 1 * dpr; ctx.stroke();
          ctx.restore();
        }
      }

      // ── 5. Drones (always shown when layer on, regardless of data source) ─
      if (L.drones) {
        for (const d of dronesRef.current) {
          // Advance ping-pong
          d.t += dt * DRONE_SPEED * d.dir;
          if (d.t >= 1) { d.t = 1; d.dir = -1; }
          else if (d.t <= 0) { d.t = 0; d.dir = 1; }

          const fwd = d.dir === 1;
          const pos = lerpPos(d.homeLat, d.homeLng, d.wpLat, d.wpLng, d.t);
          d.lat    = pos.lat; d.lng = pos.lng;
          // Altitude: rises going out, descends coming back; max at midpoint
          d.altFt  = DRONE_MAX_FT * Math.sin(Math.PI * d.t);
          d.track  = fwd
            ? hdg(d.homeLat, d.homeLng, d.wpLat, d.wpLng)
            : hdg(d.wpLat, d.wpLng, d.homeLat, d.homeLng);

          d.trail.push({ lat: d.lat, lng: d.lng, altFt: d.altFt });
          if (d.trail.length > DRONE_TRAIL_MAX) d.trail.shift();

          drawTrail(ctx, d.trail, project, dpr, true);

          const sp = project(d.lat, d.lng, d.altFt);
          if (sp) {
            const isSel = selRef.current?.kind === "drone" && selRef.current.id === d.id;
            const isHov = hovRef.current === d.id;
            const sz    = (isSel ? 9 : isHov ? 8 : 6) * dpr;
            ctx.save();
            ctx.translate(sp[0], sp[1]);
            ctx.shadowColor = `rgba(255,80,200,0.9)`;
            ctx.shadowBlur  = (isSel ? 20 : 8) * dpr;
            drawDrone(ctx, sz);
            ctx.restore();
          }
        }
      }

      // ── 6. City label ─────────────────────────────────────────────────────
      {
        const sp = project(cityLat, cityLng, 0);
        if (sp) {
          ctx.save();
          ctx.font       = `bold ${Math.round(18 * dpr)}px 'Arial Black', sans-serif`;
          ctx.textAlign  = "center";
          ctx.textBaseline = "bottom";
          // Shadow for readability
          ctx.shadowColor = "rgba(0,0,0,0.95)"; ctx.shadowBlur = 8 * dpr;
          ctx.fillStyle  = "rgba(255,255,255,0.92)";
          ctx.fillText(displayName, sp[0], sp[1] - 18 * dpr);
          // City dot
          ctx.shadowBlur = 12 * dpr; ctx.shadowColor = "#00e5ff";
          ctx.fillStyle  = "#00e5ff";
          ctx.beginPath(); ctx.arc(sp[0], sp[1], 4 * dpr, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", syncCanvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, cityLat, cityLng, displayName]);

  // ─── Canvas mouse events ──────────────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const map = mapRef.current;
    if (!map) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const HIT = 18;
    let found: string | null = null;

    if (sourceRef.current === "sim") {
      for (const ac of simRef.current) {
        try { const p = map.project([ac.lng, ac.lat]); if (Math.abs(p.x - mx) < HIT && Math.abs(p.y - my) < HIT) { found = ac.id; break; } } catch { /**/ }
      }
    } else {
      for (const [, t] of liveRef.current) {
        const c = t.pts[t.pts.length - 1];
        if (!c) continue;
        try { const p = map.project([c.lng, c.lat]); if (Math.abs(p.x - mx) < HIT && Math.abs(p.y - my) < HIT) { found = t.current.hex; break; } } catch { /**/ }
      }
    }
    if (!found) {
      for (const d of dronesRef.current) {
        try { const p = map.project([d.lng, d.lat]); if (Math.abs(p.x - mx) < HIT && Math.abs(p.y - my) < HIT) { found = d.id; break; } } catch { /**/ }
      }
    }
    hovRef.current = found;
    // Set cursor on the interact div so Mapbox still receives pointer events
    if (interactRef.current) interactRef.current.style.cursor = found ? "pointer" : "default";
  }, []);

  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const map = mapRef.current;
    if (!map) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const HIT = 18;
    let hit = false;

    if (sourceRef.current === "sim") {
      for (const ac of simRef.current) {
        try {
          const p = map.project([ac.lng, ac.lat]);
          if (Math.abs(p.x - mx) < HIT && Math.abs(p.y - my) < HIT) {
            const same = selRef.current?.kind === "sim" && selRef.current.id === ac.id;
            selRef.current = same ? null : { kind: "sim", id: ac.id };
            setSelSim(same ? null : { ...ac }); setSelDrone(null); setSelAc(null);
            hit = true; break;
          }
        } catch { /**/ }
      }
    } else {
      for (const [, trail] of liveRef.current) {
        const c = trail.pts[trail.pts.length - 1]; if (!c) continue;
        try {
          const p = map.project([c.lng, c.lat]);
          if (Math.abs(p.x - mx) < HIT && Math.abs(p.y - my) < HIT) {
            const same = selRef.current?.kind === "live" && selRef.current.id === trail.current.hex;
            selRef.current = same ? null : { kind: "live", id: trail.current.hex };
            setSelAc(same ? null : trail.current); setSelSim(null); setSelDrone(null);
            hit = true; break;
          }
        } catch { /**/ }
      }
    }
    if (!hit) {
      for (const d of dronesRef.current) {
        try {
          const p = map.project([d.lng, d.lat]);
          if (Math.abs(p.x - mx) < HIT && Math.abs(p.y - my) < HIT) {
            const same = selRef.current?.kind === "drone" && selRef.current.id === d.id;
            selRef.current = same ? null : { kind: "drone", id: d.id };
            setSelDrone(same ? null : { ...d }); setSelSim(null); setSelAc(null);
            hit = true; break;
          }
        } catch { /**/ }
      }
    }
    // Only deselect / consume the click if we actually hit something.
    // If no aircraft was hit, do NOT stopPropagation — let Mapbox handle it
    // as a normal drag/click so the map stays interactive.
    if (!hit) {
      selRef.current = null; setSelSim(null); setSelDrone(null); setSelAc(null);
    }
  }, []);

  // ─── ADS-B polling ────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/adsb-poll?lat=${cityLat}&lng=${cityLng}&dist=${radiusRef.current}`);
      if (!res.ok) return;
      const snap: PollSnapshot = await res.json();
      const now = Date.now();
      const m   = liveRef.current;
      for (const ac of snap.aircraft) {
        const pt = { lat: ac.lat, lng: ac.lng, altFt: ac.altFt, ts: now };
        const ex = m.get(ac.hex);
        if (ex) { ex.pts.push(pt); if (ex.pts.length > LIVE_TRAIL_MAX) ex.pts.shift(); ex.current = ac; }
        else m.set(ac.hex, { pts: [pt], current: ac });
      }
      const stale = now - POLL_MS * 4;
      for (const [hex, t] of m) if ((t.pts[t.pts.length - 1]?.ts ?? 0) < stale) m.delete(hex);
      setLiveCount(snap.aircraft.length);
      setLastPoll(new Date(snap.fetchedAt));
    } catch { /**/ }
  }, [cityLat, cityLng]);

  // Only poll when source = live
  useEffect(() => {
    if (!mapReady || source !== "live") { if (pollRef.current) clearInterval(pollRef.current); return; }
    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [mapReady, source, poll]);

  const toggleLayer = (k: keyof LayerState) => setLayers(p => ({ ...p, [k]: !p[k] }));

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#000", overflow: "hidden", fontFamily: "'Courier New', monospace" }}>

      {/* Mapbox — receives all drag/rotate/zoom events directly */}
      <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} />

      {/* Canvas: pointer-events NONE so it never blocks Mapbox drag/rotate.
          Drawing only — the interaction div below handles clicks. */}
      <canvas ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 5, pointerEvents: "none" }} />

      {/* Transparent interaction layer — sits above canvas.
          onMouseMove: update cursor when hovering an aircraft.
          onClick: select aircraft or pass through (no stopPropagation unless hit).
          pointer-events: auto so Mapbox STILL gets drag because this div passes
          non-hit events straight through via the cursor check. */}
      <div
        ref={interactRef}
        style={{ position: "absolute", inset: 0, zIndex: 6, pointerEvents: "auto", cursor: "default" }}
        onMouseMove={onMouseMove}
        onClick={onCanvasClick}
      />

      {/* Error */}
      {error && (
        <div style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ color: "#ff5555", fontSize: 13, letterSpacing: "0.1em", textAlign: "center", maxWidth: 380, padding: "0 24px" }}>{error}</div>
          <button onClick={() => router.back()} style={{ padding: "8px 20px", borderRadius: 20, border: "1px solid rgba(0,229,255,0.3)", background: "rgba(0,229,255,0.08)", color: "#00e5ff", cursor: "pointer", fontFamily: "monospace", fontSize: 11 }}>← BACK</button>
        </div>
      )}

      {/* Loading */}
      {!mapReady && !error && (
        <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "rgba(0,0,0,0.88)", pointerEvents: "none" }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", border: "2px solid rgba(0,229,255,0.12)", borderTopColor: "#00e5ff", animation: "spin 0.8s linear infinite" }} />
          <span style={{ color: "rgba(0,229,255,0.55)", fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase" }}>Loading Airspace</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* ── TOP BAR ────────────────────────────────────────────────────── */}
      {hudVisible && (
      <div data-hud style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "linear-gradient(to bottom,rgba(0,0,0,0.92),transparent)", borderBottom: "1px solid rgba(0,229,255,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => router.back()}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,229,255,0.15)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,229,255,0.07)")}
            style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid rgba(0,229,255,0.25)", background: "rgba(0,229,255,0.07)", color: "#00e5ff", cursor: "pointer", fontFamily: "monospace", fontSize: 11, letterSpacing: "0.1em" }}>
            ← GLOBE
          </button>
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.09)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#00e5ff", boxShadow: "0 0 8px #00e5ff", animation: "pulse 2s ease infinite" }} />
            <span style={{ color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" }}>{displayName}</span>
            <span style={{ color: "rgba(0,229,255,0.45)", fontSize: 10, letterSpacing: "0.15em" }}>AIRSPACE</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
          {source === "sim" && <span>SIM&nbsp;<span style={{ color: "#6aa0ff" }}>{simCount}</span></span>}
          {source === "live" && <span>LIVE&nbsp;<span style={{ color: "#69f0ae" }}>{liveCount}</span></span>}
          <span>🚁&nbsp;<span style={{ color: "#ff50c8" }}>{droneCount}</span></span>
          <span>R&nbsp;<span style={{ color: "#00e5ff" }}>{radiusNm}&nbsp;NM</span></span>
          {lastPoll && source === "live" && <span style={{ color: "rgba(255,255,255,0.18)" }}>{lastPoll.toLocaleTimeString("en", { hour12: false })}</span>}
          {source === "live" && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#69f0ae", animation: "pulse 1.5s ease infinite" }} />
              <span style={{ color: "#69f0ae" }}>LIVE</span>
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── DATA SOURCE TOGGLE (top centre) ──────────────────────────── */}
      {hudVisible && (
      <div data-hud style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 25, display: "flex", borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(16px)" }}>
        {(["sim", "live"] as DataSource[]).map(s => (
          <button key={s} onClick={() => setSource(s)}
            style={{
              padding: "7px 18px", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
              cursor: "pointer", fontFamily: "monospace", border: "none", outline: "none",
              background: source === s ? (s === "sim" ? "rgba(100,160,255,0.3)" : "rgba(105,240,174,0.25)") : "rgba(0,0,0,0.5)",
              color: source === s ? (s === "sim" ? "#6aa0ff" : "#69f0ae") : "rgba(255,255,255,0.3)",
              transition: "all 0.2s",
            }}>
            {s === "sim" ? "⬛ Data.ts" : "📡 RapidAPI Live"}
          </button>
        ))}
      </div>
      )}

      {/* ── VIEW CONTROLS (bottom centre) ─────────────────────────────── */}
      {hudVisible && (
      <div data-hud style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 20, minWidth: 320 }}>
        <div style={{ padding: "14px 20px", background: "rgba(0,0,0,0.85)", border: "1px solid rgba(0,229,255,0.18)", borderRadius: 18, backdropFilter: "blur(20px)", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Radius */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11 }}>
              <span style={{ color: "rgba(255,255,255,0.28)", letterSpacing: "0.15em" }}>RADIUS</span>
              <span style={{ color: "#00e5ff", fontWeight: 700 }}>{radiusNm} NM</span>
              <span style={{ color: "rgba(255,255,255,0.18)" }}>{(radiusNm * NM_TO_KM).toFixed(0)} km</span>
            </div>
            <input type="range" min={5} max={50} step={1} value={radiusNm}
              onChange={e => setRadiusNm(+e.target.value)}
              style={{ width: "100%", height: 4, borderRadius: 2, outline: "none", WebkitAppearance: "none", appearance: "none", background: `linear-gradient(to right,#00e5ff ${((radiusNm - 5) / 45) * 100}%,rgba(255,255,255,0.08) ${((radiusNm - 5) / 45) * 100}%)`, cursor: "pointer" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "rgba(255,255,255,0.15)" }}>
              <span>5 NM</span><span>25 NM</span><span>50 NM</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 -4px" }} />

          {/* Bearing */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11 }}>
              <span style={{ color: "rgba(255,255,255,0.28)", letterSpacing: "0.15em" }}>BEARING</span>
              <span style={{ color: "#00e5ff", fontWeight: 700 }}>
                {bearing === 0 ? "N" : bearing === 90 ? "E" : bearing === 180 ? "S" : bearing === 270 ? "W" : `${bearing}°`}
              </span>
              <span style={{ color: "rgba(255,255,255,0.18)" }}>
                {bearing === 0 || bearing === 360 ? "North up" : bearing < 90 ? "NE" : bearing < 180 ? "SE" : bearing < 270 ? "SW" : "NW"}
              </span>
            </div>
            <input type="range" min={0} max={359} step={1} value={bearing}
              onChange={e => setBearing(+e.target.value)}
              className="bearing-slider"
              style={{ width: "100%", height: 4, borderRadius: 2, outline: "none", WebkitAppearance: "none", appearance: "none", background: `linear-gradient(to right,#a78bfa ${(bearing / 359) * 100}%,rgba(255,255,255,0.08) ${(bearing / 359) * 100}%)`, cursor: "pointer" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "rgba(255,255,255,0.15)" }}>
              <span>N (0°)</span><span>E (90°)</span><span>S (180°)</span><span>W (270°)</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 -4px" }} />

          {/* Pitch */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11 }}>
              <span style={{ color: "rgba(255,255,255,0.28)", letterSpacing: "0.15em" }}>PITCH</span>
              <span style={{ color: "#00e5ff", fontWeight: 700 }}>{pitch}°</span>
              <span style={{ color: "rgba(255,255,255,0.18)" }}>
                {pitch < 15 ? "Top-down" : pitch < 40 ? "Oblique" : pitch < 65 ? "3D view" : "Low angle"}
              </span>
            </div>
            <input type="range" min={0} max={85} step={1} value={pitch}
              onChange={e => setPitch(+e.target.value)}
              className="pitch-slider"
              style={{ width: "100%", height: 4, borderRadius: 2, outline: "none", WebkitAppearance: "none", appearance: "none", background: `linear-gradient(to right,#34d399 ${(pitch / 85) * 100}%,rgba(255,255,255,0.08) ${(pitch / 85) * 100}%)`, cursor: "pointer" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "rgba(255,255,255,0.15)" }}>
              <span>0° top</span><span>45°</span><span>85° low</span>
            </div>
          </div>

        </div>
      </div>
      )}

      {/* ── LAYER TOGGLES (left) ─────────────────────────────────────── */}
      {hudVisible && (
      <div data-hud style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", zIndex: 20, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontSize: 9, color: "rgba(0,229,255,0.35)", letterSpacing: "0.18em", padding: "3px 8px", textTransform: "uppercase" }}>LAYERS</div>
        {(Object.keys(layers) as Array<keyof LayerState>).map(key => {
          const m  = LAYER_META[key];
          const on = layers[key];
          return (
            <button key={key} onClick={() => toggleLayer(key)} style={{
              display: "flex", alignItems: "center", gap: 9, padding: "7px 12px", borderRadius: 10,
              background: on ? `rgba(${m.rgb},0.09)` : "rgba(255,255,255,0.02)",
              border: `1px solid ${on ? `rgba(${m.rgb},0.28)` : "rgba(255,255,255,0.06)"}`,
              cursor: "pointer", backdropFilter: "blur(14px)", minWidth: 168, textAlign: "left",
            }}>
              <span style={{ fontSize: 15 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase", color: on ? "#fff" : "rgba(255,255,255,0.28)" }}>{m.label}</div>
                {m.soon && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: "0.1em" }}>COMING SOON</div>}
              </div>
              <div style={{ position: "relative", width: 26, height: 13, borderRadius: 7, flexShrink: 0, background: on ? `rgba(${m.rgb},0.32)` : "rgba(255,255,255,0.05)", border: `1px solid ${on ? `rgba(${m.rgb},0.5)` : "rgba(255,255,255,0.09)"}` }}>
                <div style={{ position: "absolute", top: 1.5, width: 10, height: 10, borderRadius: "50%", transition: "left 0.2s", left: on ? "calc(100% - 12px)" : 1.5, background: on ? `rgb(${m.rgb})` : "rgba(255,255,255,0.2)" }} />
              </div>
            </button>
          );
        })}
      </div>
      )}

      {/* ── ALTITUDE LEGEND ──────────────────────────────────────────── */}
      {hudVisible && (
      <div data-hud style={{ position: "absolute", bottom: 28, right: 14, zIndex: 20 }}>
        <div style={{ padding: "11px 13px", background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, backdropFilter: "blur(16px)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: "0.18em", marginBottom: 7, textTransform: "uppercase" }}>ALTITUDE</div>
          {ALT_LEGEND.map(({ label, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <div style={{ width: 18, height: 3, borderRadius: 2, background: color, boxShadow: `0 0 5px ${color}` }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ── SELECTED SIM CARD ─────────────────────────────────────────── */}
      {hudVisible && selSim && (
        <InfoCard title={selSim.id.toUpperCase()} badge="SIM" badgeColor="100,160,255"
          onClose={() => { setSelSim(null); selRef.current = null; }}
          rows={[
            ["FROM",  `${selSim.f.departure.lat.toFixed(2)}°, ${selSim.f.departure.lng.toFixed(2)}°`],
            ["TO",    `${selSim.f.arrival.lat.toFixed(2)}°, ${selSim.f.arrival.lng.toFixed(2)}°`],
            ["DIST",  `${Math.round(selSim.routeKm)} km`],
            ["SPEED", `${selSim.f.speed} kts`],
            ["ALT",   `${Math.round(selSim.altFt).toLocaleString()} ft`],
            ["TRACK", `${Math.round(selSim.track)}°`],
            ["PROG",  `${(selSim.t * 100).toFixed(0)}%`],
          ]}
          altFt={selSim.altFt} maxAlt={CRUISE_FT}
        />
      )}

      {/* ── SELECTED DRONE CARD ───────────────────────────────────────── */}
      {hudVisible && selDrone && (
        <InfoCard title={selDrone.id.toUpperCase()} badge="DRONE" badgeColor="255,80,200"
          onClose={() => { setSelDrone(null); selRef.current = null; }}
          rows={[
            ["ID",     selDrone.id],
            ["ALT",   `${Math.round(selDrone.altFt)} ft AGL`],
            ["TRACK", `${Math.round(selDrone.track)}°`],
            ["PROG",  `${(selDrone.t * 100).toFixed(0)}% ${selDrone.dir === 1 ? "→" : "←"}`],
            ["ROUTE", `${(selDrone.routeKm * 1000).toFixed(0)} m`],
            ["POS",   `${selDrone.lat.toFixed(4)}, ${selDrone.lng.toFixed(4)}`],
          ]}
          altFt={selDrone.altFt} maxAlt={DRONE_MAX_FT}
        />
      )}

      {/* ── SELECTED LIVE CARD ────────────────────────────────────────── */}
      {hudVisible && selAc && !selSim && !selDrone && (
        <InfoCard title={selAc.callsign || selAc.hex} badge="LIVE" badgeColor="105,240,174"
          onClose={() => { setSelAc(null); selRef.current = null; }}
          rows={[
            ["HEX",    selAc.hex],
            ["REG",    selAc.reg || "—"],
            ["TYPE",   selAc.type || "—"],
            ["ALT",    `${selAc.altFt.toLocaleString()} ft`],
            ["SPEED",  `${Math.round(selAc.speedKts)} kts`],
            ["TRACK",  `${Math.round(selAc.trackDeg)}°`],
            ["V/S",    `${selAc.vertRate > 0 ? "+" : ""}${Math.round(selAc.vertRate)} fpm`],
            ["POS",    `${selAc.lat.toFixed(3)}, ${selAc.lng.toFixed(3)}`],
          ]}
          altFt={selAc.altFt} maxAlt={45000}
        />
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance:none; width:16px; height:16px; border-radius:50%;
          background:#00e5ff; cursor:pointer;
          box-shadow:0 0 8px #00e5ff,0 0 16px rgba(0,229,255,0.35);
          border:2px solid rgba(0,0,0,0.4);
        }
        input[type=range]::-moz-range-thumb {
          width:16px; height:16px; border-radius:50%;
          background:#00e5ff; cursor:pointer;
          box-shadow:0 0 8px #00e5ff; border:2px solid rgba(0,0,0,0.4);
        }
        input[type=range].bearing-slider::-webkit-slider-thumb {
          background:#a78bfa;
          box-shadow:0 0 8px #a78bfa,0 0 16px rgba(167,139,250,0.35);
        }
        input[type=range].bearing-slider::-moz-range-thumb {
          background:#a78bfa; box-shadow:0 0 8px #a78bfa;
        }
        input[type=range].pitch-slider::-webkit-slider-thumb {
          background:#34d399;
          box-shadow:0 0 8px #34d399,0 0 16px rgba(52,211,153,0.35);
        }
        input[type=range].pitch-slider::-moz-range-thumb {
          background:#34d399; box-shadow:0 0 8px #34d399;
        }
        .mapboxgl-ctrl-top-right { top: 52px !important; }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function InfoCard({ title, badge, badgeColor, onClose, rows, altFt, maxAlt }: {
  title: string; badge: string; badgeColor: string;
  onClose: () => void; rows: [string, string][];
  altFt: number; maxAlt: number;
}) {
  const pct = Math.min(100, (altFt / maxAlt) * 100);
  const [r, g, b] = altFt < 500 ? [255, 80, 200] : altRGB(altFt);
  return (
    <div style={{ position: "absolute", top: 58, right: 14, zIndex: 20, width: 248, background: "rgba(2,6,18,0.97)", border: `1px solid rgba(${badgeColor},0.28)`, borderRadius: 13, backdropFilter: "blur(24px)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", borderBottom: `1px solid rgba(${badgeColor},0.09)` }}>
        <span style={{ color: `rgb(${badgeColor})`, fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>✈ {title}</span>
        <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `rgba(${badgeColor},0.1)`, color: `rgba(${badgeColor},0.85)`, letterSpacing: "0.1em" }}>{badge}</span>
        <button onClick={onClose} style={{ color: "rgba(255,255,255,0.3)", cursor: "pointer", background: "none", border: "none", fontSize: 14 }}>✕</button>
      </div>
      <div style={{ padding: "11px 13px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 14px" }}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.12em", fontFamily: "monospace" }}>{k}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.78)", fontFamily: "monospace" }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "0 13px 11px" }}>
        <div style={{ width: "100%", height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: `rgb(${r},${g},${b})`, boxShadow: `0 0 6px rgb(${r},${g},${b})`, transition: "width 0.3s" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Canvas draw helpers ──────────────────────────────────────────────────────
type ProjectFn = (lat: number, lng: number, altFt: number) => [number, number] | null;

function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: Array<{ lat: number; lng: number; altFt: number }>,
  project: ProjectFn,
  dpr: number,
  isDrone: boolean,
) {
  if (trail.length < 2) return;
  ctx.save();
  for (let i = 1; i < trail.length; i++) {
    const p0 = trail[i - 1], p1 = trail[i];
    const s0 = project(p0.lat, p0.lng, p0.altFt);
    const s1 = project(p1.lat, p1.lng, p1.altFt);
    if (!s0 || !s1) continue;
    const frac  = i / trail.length;
    const alpha = frac * (isDrone ? 0.8 : 0.88);
    const width = frac * (isDrone ? 2.0 : 2.8);
    const [r, g, b] = isDrone ? [255, 80, 200] : altRGB(p0.altFt);
    ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]);
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
    ctx.lineWidth   = width * dpr; ctx.lineCap = "round";
    ctx.shadowColor = `rgba(${r},${g},${b},0.45)`; ctx.shadowBlur = 4 * dpr;
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlane(ctx: CanvasRenderingContext2D, sz: number, r: number, g: number, b: number) {
  ctx.beginPath();
  ctx.moveTo(0, -sz);
  ctx.lineTo( sz * 0.55,  sz * 0.32); ctx.lineTo( sz * 0.20,  sz * 0.14);
  ctx.lineTo( sz * 0.26,  sz * 0.82); ctx.lineTo(0, sz * 0.52);
  ctx.lineTo(-sz * 0.26,  sz * 0.82); ctx.lineTo(-sz * 0.20,  sz * 0.14);
  ctx.lineTo(-sz * 0.55,  sz * 0.32);
  ctx.closePath();
  ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fill();
}

function drawDrone(ctx: CanvasRenderingContext2D, sz: number) {
  // X-shape / quadcopter silhouette
  const arm = sz * 0.9;
  ctx.strokeStyle = "rgb(255,80,200)"; ctx.lineWidth = sz * 0.55; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-arm, -arm); ctx.lineTo(arm, arm); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(arm, -arm); ctx.lineTo(-arm, arm); ctx.stroke();
  // Centre body dot
  ctx.fillStyle = "rgb(255,150,220)";
  ctx.beginPath(); ctx.arc(0, 0, sz * 0.35, 0, Math.PI * 2); ctx.fill();
}

/** Build a GeoJSON Polygon approximating a geodesic circle */
function makeCircleGeoJSON(lat: number, lng: number, nm: number) {
  const km     = nm * NM_TO_KM;
  const pts    = 128;
  const coords: [number, number][] = [];
  for (let i = 0; i <= pts; i++) {
    const angle = (i / pts) * 2 * Math.PI;
    const dx    = (km / 111.32) * Math.cos(angle) / Math.cos(lat * DEG_TO_RAD);
    const dy    = (km / 111.32) * Math.sin(angle);
    coords.push([lng + dx, lat + dy]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [coords] } };
}

// ─── Static config ────────────────────────────────────────────────────────────
const LAYER_META: Record<keyof LayerState, { label: string; icon: string; rgb: string; soon?: boolean }> = {
  commercial:  { label: "Commercial",   icon: "✈",  rgb: "100,180,255" },
  drones:      { label: "Drones / UAV", icon: "🚁",  rgb: "255,80,200"  },
  military:    { label: "Military",     icon: "🛡",   rgb: "255,80,80"   },
  helicopters: { label: "Helicopters",  icon: "🚁",  rgb: "100,255,120" },
  maritime:    { label: "Maritime",     icon: "⚓",   rgb: "0,180,255",   soon: true },
};

const ALT_LEGEND = [
  { label: "> 30k ft  Cruise",   color: "rgb(0,229,255)"  },
  { label: "20–30k ft  High",    color: "rgb(0,200,120)"  },
  { label: "10–20k ft  Mid",     color: "rgb(160,230,40)" },
  { label: "3–10k ft  Climb",    color: "rgb(255,200,0)"  },
  { label: "< 3k ft   Low",      color: "rgb(255,120,0)"  },
  { label: "< 300 ft  Drones",   color: "rgb(255,80,200)" },
];