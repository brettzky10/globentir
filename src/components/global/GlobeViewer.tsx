"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Earth } from "@/lib/globe/Earth";
import { Flight } from "@/lib/globe/Flight";
import { InstancedPlanes } from "@/lib/globe/InstancedPlanes";
import { ParticlePlanes } from "@/lib/globe/ParticlePlanes";
import { MergedFlightPaths } from "@/lib/globe/MergedFlightPaths";
import { Stars } from "@/lib/globe/Stars";
import { InterferenceZones, CANADA_INTERFERENCE_ZONES } from "@/lib/globe/InterferenceZones";
import type { InterferenceZone } from "@/lib/globe/InterferenceZones";
import { ADSBManager } from "@/lib/globe/ADSBManager";
import type { ADSBSnapshot } from "@/lib/globe/ADSBManager";
import type { ADSBaircraft } from "@/app/api/adsb/route";
import { CountryGlobe, COUNTRY_CENTROIDS } from "@/lib/globe/CountryGlobe";
import type { CountryInfo } from "@/lib/globe/CountryGlobe";
import { CityLabels } from "@/lib/globe/CityLabels";
import { getCitiesForCountry } from "@/lib/globe/cities";
import { buildAirspaceUrl } from "@/lib/globe/cityNav";
import {
  getSunVector3,
  getCurrentUtcTimeHours,
  hoursToTimeString,
  animateCameraToPosition,
  latLngToVector3,
  vector3ToLatLng,
} from "@/lib/globe/Utils";
import { flights as flightData } from "@/lib/globe/Data";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppPhase = "globe" | "transition" | "flight";

interface GlobeControls {
  planeSize: number;
  animationSpeed: number;
  flightCount: number;
  dayNightEffect: boolean;
  atmosphereEffect: boolean;
  showFlightPaths: boolean;
  showPlanes: boolean;
  realTimeSun: boolean;
  simulatedTime: number;
  nightBrightness: number;
  dayBrightness: number;
  colorizePlanes: boolean;
  planeRenderType: "instanced" | "particles";
  showInterference: boolean;
  showCities: boolean;
}

type ActivePanel = "adsb" | "interference" | "controls" | null;

const EARTH_RADIUS = 3000;
const MONO = "'Courier New', monospace";

// ─── Component ────────────────────────────────────────────────────────────────

export default function GlobeViewer() {
  const router        = useRouter();
  const mountRef      = useRef<HTMLDivElement>(null);
  const sceneRef      = useRef<THREE.Scene | null>(null);
  const cameraRef     = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const orbitRef      = useRef<OrbitControls | null>(null);
  const earthRef      = useRef<Earth | null>(null);
  const starsRef      = useRef<Stars | null>(null);
  const flightsRef    = useRef<Flight[]>([]);
  const allFlightsRef = useRef<Flight[]>([]);
  const ipRef         = useRef<InstancedPlanes | null>(null);
  const ppRef         = useRef<ParticlePlanes | null>(null);
  const crRef         = useRef<InstancedPlanes | ParticlePlanes | null>(null);
  const mfpRef        = useRef<MergedFlightPaths | null>(null);
  const ambRef        = useRef<THREE.AmbientLight | null>(null);
  const dirRef        = useRef<THREE.DirectionalLight | null>(null);
  const intRef        = useRef<InterferenceZones | null>(null);
  const adsbRef       = useRef<ADSBManager | null>(null);
  const countryGlobeRef = useRef<CountryGlobe | null>(null);
  const cityLabelsRef   = useRef<CityLabels | null>(null);
  const clockRef      = useRef(new THREE.Clock());
  const rafRef        = useRef<number | null>(null);
  const phaseRef      = useRef<AppPhase>("globe");
  const autoRotateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ctrlRef = useRef<GlobeControls>({
    planeSize: 5.0, animationSpeed: 0.3, flightCount: 200,
    dayNightEffect: true, atmosphereEffect: true, showFlightPaths: true,
    showPlanes: true, realTimeSun: true, simulatedTime: getCurrentUtcTimeHours(),
    nightBrightness: 0.8, dayBrightness: 2.0, colorizePlanes: true,
    planeRenderType: "instanced", showInterference: true, showCities: true,
  });

  // UI state
  const [uiCtrl, setUiCtrl]       = useState<GlobeControls>(ctrlRef.current);
  const [phase, setPhase]         = useState<AppPhase>("globe");
  const [earthReady, setEarthReady] = useState(false);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [timeDisplay, setTimeDisplay] = useState(hoursToTimeString(getCurrentUtcTimeHours()));
  const [coords, setCoords]       = useState<{ lat: number; lng: number } | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  // ADS-B state
  const [adsbLat, setAdsbLat]     = useState("");
  const [adsbLon, setAdsbLon]     = useState("");
  const [adsbDist, setAdsbDist]   = useState("100");
  const [adsbStatus, setAdsbStatus] = useState("Enter coordinates and click Fetch");
  const [adsbLoading, setAdsbLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<ADSBSnapshot[]>([]);
  const [playbackIdx, setPlaybackIdx] = useState(0);
  const [selAircraft, setSelAircraft] = useState<ADSBaircraft | null>(null);

  // Interference state
  const [zones]     = useState<InterferenceZone[]>(CANADA_INTERFERENCE_ZONES);
  const [selZone, setSelZone] = useState<InterferenceZone | null>(null);

  const updateCtrl = useCallback(<K extends keyof GlobeControls>(k: K, v: GlobeControls[K]) => {
    ctrlRef.current = { ...ctrlRef.current, [k]: v };
    setUiCtrl(p => ({ ...p, [k]: v }));
  }, []);

  const updateSun = useCallback(() => {
    const ctrl = ctrlRef.current;
    const dl = dirRef.current;
    if (!dl) return;
    if (ctrl.realTimeSun) {
      const t = getCurrentUtcTimeHours();
      ctrlRef.current.simulatedTime = t;
      setTimeDisplay(hoursToTimeString(t));
      dl.position.copy(getSunVector3(EARTH_RADIUS, t));
    } else if (ctrl.dayNightEffect) {
      dl.position.copy(getSunVector3(EARTH_RADIUS, ctrl.simulatedTime));
    }
  }, []);

  // ─── Init Three.js scene ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 200000);
    camera.position.set(0, 0, EARTH_RADIUS * 2.8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const amb = new THREE.AmbientLight(0x404040, 0.8);
    scene.add(amb); ambRef.current = amb;
    const dir = new THREE.DirectionalLight(0xffffff, 2.0);
    dir.position.copy(getSunVector3(EARTH_RADIUS, getCurrentUtcTimeHours()));
    scene.add(dir); dirRef.current = dir;

    // Stars
    const stars = new Stars(6000, 15000, 80000);
    stars.addToScene(scene); starsRef.current = stars;

    // Earth
    const earth = new Earth(EARTH_RADIUS, () => {
      setEarthReady(true);
    });
    earth.addToScene(scene); earthRef.current = earth;

    // Country globe overlay
    const cg = new CountryGlobe();
    cg.addToScene(scene);
    cg.setCallbacks(
      (iso, name) => setHoveredCountry(name),
      (info) => handleCountryClick(info)
    );
    cg.loadGeoJSON("/countries.geojson");
    countryGlobeRef.current = cg;

    // City labels
    const cl = new CityLabels();
    cl.mount(mount);
    cl.setCamera(camera);
    cl.setRenderer(renderer);
    cityLabelsRef.current = cl;

    // Flight planes (hidden until flight phase)
    const ip = new InstancedPlanes(flightData.length, 10);
    ip.addToScene(scene);
    ip.setGlobalScale(ctrlRef.current.planeSize);
    ip.setColorization(true);
    ip.getMesh()!.visible = false;
    ipRef.current = ip;

    const pp = new ParticlePlanes(flightData.length, EARTH_RADIUS);
    pp.addToScene(scene);
    pp.setGlobalScale(ctrlRef.current.planeSize * 2);
    pp.setColorization(true);
    pp.getMesh()!.visible = false;
    ppRef.current = pp;

    crRef.current = ip;

    const mfp = new MergedFlightPaths();
    mfp.initialize(flightData.length);
    mfp.addToScene(scene);
    if (mfp.getMesh) mfp.getMesh()!.visible = false;
    mfpRef.current = mfp;

    const allFlights = flightData.map((opts, i) => new Flight(opts, earth, ip, i, mfp));
    allFlightsRef.current = allFlights;
    flightsRef.current = allFlights.slice(0, ctrlRef.current.flightCount);
    ip.setActiveCount(ctrlRef.current.flightCount);

    // Interference zones (hidden until flight phase for non-Canada)
    const intZones = new InterferenceZones();
    intZones.addToScene(scene);
    CANADA_INTERFERENCE_ZONES.forEach(z => intZones.addZone(z));
    intZones.setVisible(false);
    intRef.current = intZones;

    // ADS-B manager
    const adsb = new ADSBManager();
    adsb.addToScene(scene);
    adsb.setCallbacks({
      onLoadingChange: setAdsbLoading,
      onSnapshotsChange: (snaps) => { setSnapshots([...snaps]); setPlaybackIdx(snaps.length - 1); },
      onStatusChange: setAdsbStatus,
    });
    adsbRef.current = adsb;

    // Orbit controls
    const oc = new OrbitControls(camera, renderer.domElement);
    oc.enableDamping = true;
    oc.dampingFactor = 0.06;
    oc.screenSpacePanning = false;
    oc.minDistance = EARTH_RADIUS * 1.08;
    oc.maxDistance = EARTH_RADIUS * 8;
    oc.autoRotate = true;
    oc.autoRotateSpeed = 0.4;
    orbitRef.current = oc;

    // Resume auto-rotate after 4s idle
    const resumeAutoRotate = () => {
      if (autoRotateTimerRef.current) clearTimeout(autoRotateTimerRef.current);
      if (phaseRef.current === "globe") {
        oc.autoRotate = false;
        autoRotateTimerRef.current = setTimeout(() => {
          if (phaseRef.current === "globe") oc.autoRotate = true;
        }, 4000);
      }
    };
    renderer.domElement.addEventListener("pointerdown", resumeAutoRotate);

    // Animation loop
    function animate() {
      rafRef.current = requestAnimationFrame(animate);
      const delta = clockRef.current.getDelta();
      oc.update();
      starsRef.current?.update(delta);

      if (phaseRef.current === "flight") {
        intRef.current?.update(delta);
        const ctrl = ctrlRef.current;
        if (ctrl.showPlanes && flightsRef.current.length) {
          const adj = delta * ctrl.animationSpeed;
          flightsRef.current.forEach(f => f.update(adj));
          const cr = crRef.current;
          if (cr && !(cr as { isParticleRenderer?: boolean }).isParticleRenderer) {
            (cr as InstancedPlanes).forceMatrixUpdate();
          }
        }
        if (crRef.current === ppRef.current) ppRef.current?.update(delta);
        mfpRef.current?.applyBatchedUpdates();
        cityLabelsRef.current?.update();
      }

      updateSun();

      if (cameraRef.current && earthRef.current) {
        const pt = cameraRef.current.position.clone().normalize().multiplyScalar(EARTH_RADIUS);
        const c = vector3ToLatLng(pt, EARTH_RADIUS);
        setCoords({ lat: +c.lat.toFixed(2), lng: +c.lng.toFixed(2) });
      }

      renderer.render(scene, camera);
    }
    animate();

    // Mouse events for country hover/click (globe phase only)
    const onMouseMove = (e: MouseEvent) => {
      if (phaseRef.current !== "globe") return;
      countryGlobeRef.current?.handleMouseMove(e, camera, renderer);
    };
    const onClick = (e: MouseEvent) => {
      if (phaseRef.current !== "globe") return;
      countryGlobeRef.current?.handleClick(e, camera, renderer);
    };
    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("click", onClick);

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("pointerdown", resumeAutoRotate);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (autoRotateTimerRef.current) clearTimeout(autoRotateTimerRef.current);
      adsb.dispose();
      cl.unmount();
      cg.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Country click → zoom + transition to flight phase ─────────────────────
  const handleCountryClick = useCallback((info: CountryInfo) => {
    if (phaseRef.current !== "globe") return;
    phaseRef.current = "transition";
    setPhase("transition");
    setSelectedCountry(info);

    // Populate ADS-B defaults from centroid
    setAdsbLat(info.centroid.lat.toFixed(4));
    setAdsbLon(info.centroid.lng.toFixed(4));

    const camera = cameraRef.current!;
    const oc = orbitRef.current!;
    oc.autoRotate = false;

    // Target position: country centroid zoomed in
    const targetDir = latLngToVector3(info.centroid.lat, info.centroid.lng, 1).normalize();
    const zoomDist  = EARTH_RADIUS * 1.75;
    const targetPos = targetDir.multiplyScalar(zoomDist);
    const startPos  = camera.position.clone();

    // Smooth camera fly-in
    const duration = 1600;
    const startTime = Date.now();
    function flyIn() {
      const t = Math.min((Date.now() - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(startPos, targetPos, ease);
      camera.lookAt(0, 0, 0);
      if (t < 1) {
        requestAnimationFrame(flyIn);
      } else {
        // Transition complete → flight phase
        phaseRef.current = "flight";
        setPhase("flight");
        activateFlightMode(info);
      }
    }
    flyIn();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activateFlightMode = (info: CountryInfo) => {
    // Hide country overlay
    countryGlobeRef.current?.setVisible(false);

    // Show flights
    const ip = ipRef.current!;
    ip.getMesh()!.visible = ctrlRef.current.showPlanes;
    crRef.current = ip;
    flightsRef.current = allFlightsRef.current.slice(0, ctrlRef.current.flightCount);
    ip.setActiveCount(ctrlRef.current.flightCount);
    mfpRef.current?.setVisibleFlightCount(ctrlRef.current.flightCount);
    if (mfpRef.current?.getMesh) mfpRef.current!.getMesh()!.visible = ctrlRef.current.showFlightPaths;

    // Show interference zones
    intRef.current?.setVisible(ctrlRef.current.showInterference);

    // Show city labels — clicking them navigates to airspace page
    const cities = getCitiesForCountry(info.iso, 12);
    if (cities.length > 0 && ctrlRef.current.showCities) {
      cityLabelsRef.current?.setOnCityClick((city) => {
        router.push(buildAirspaceUrl(city));
      });
      cityLabelsRef.current?.setCities(cities);
      cityLabelsRef.current?.setVisible(true);
    }

    // Open ADS-B panel
    setActivePanel("adsb");
  };

  // ─── Back to globe ──────────────────────────────────────────────────────────
  const handleBackToGlobe = useCallback(() => {
    phaseRef.current = "globe";
    setPhase("globe");
    setSelectedCountry(null);
    setActivePanel(null);
    setSnapshots([]);
    setSelAircraft(null);

    // Hide flight objects
    ipRef.current?.getMesh() && (ipRef.current!.getMesh()!.visible = false);
    ppRef.current?.getMesh() && (ppRef.current!.getMesh()!.visible = false);
    if (mfpRef.current?.getMesh) mfpRef.current!.getMesh()!.visible = false;
    intRef.current?.setVisible(false);
    cityLabelsRef.current?.setVisible(false);

    // Show country overlay
    countryGlobeRef.current?.setVisible(true);
    countryGlobeRef.current?.deselectAll();

    // Zoom out
    const camera = cameraRef.current!;
    const oc = orbitRef.current!;
    const startPos = camera.position.clone();
    const targetDist = EARTH_RADIUS * 2.8;
    const targetPos = camera.position.clone().normalize().multiplyScalar(targetDist);
    const startTime = Date.now();
    const duration = 1200;
    function flyOut() {
      const t = Math.min((Date.now() - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(startPos, targetPos, ease);
      camera.lookAt(0, 0, 0);
      if (t < 1) requestAnimationFrame(flyOut);
      else { oc.autoRotate = true; }
    }
    flyOut();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Search ────────────────────────────────────────────────────────────────
  const searchResults = searchQuery.length >= 1
    ? Object.entries(COUNTRY_CENTROIDS)
        .filter(([, v]) => v.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 10)
    : [];

  const handleSearchSelect = (iso: string) => {
    const centroid = COUNTRY_CENTROIDS[iso];
    if (!centroid) return;
    setSearchQuery("");
    setSearchOpen(false);
    // Simulate a click on that country
    const fakeInfo: CountryInfo = {
      iso,
      name: centroid.name,
      feature: null as never,
      centroid: { lat: centroid.lat, lng: centroid.lng },
    };
    handleCountryClick(fakeInfo);
  };

  // ─── ADS-B ─────────────────────────────────────────────────────────────────
  const handleFetchADSB = useCallback(async () => {
    const lat = parseFloat(adsbLat), lon = parseFloat(adsbLon), dist = parseFloat(adsbDist);
    if (isNaN(lat) || isNaN(lon) || isNaN(dist)) { setAdsbStatus("Invalid coordinates"); return; }
    await adsbRef.current?.fetchSnapshot(lat, lon, dist);
  }, [adsbLat, adsbLon, adsbDist]);

  const handlePlaybackSeek = useCallback((i: number) => {
    setPlaybackIdx(i);
    adsbRef.current?.seekToSnapshot(i);
  }, []);

  // ─── Globe controls ─────────────────────────────────────────────────────────
  const handlePlaneSizeChange  = (v: number) => { updateCtrl("planeSize", v); const cr = crRef.current; if (cr) cr.setGlobalScale(v * ((cr as {isParticleRenderer?:boolean}).isParticleRenderer ? 2 : 1)); };
  const handleFlightCountChange = (v: number) => { updateCtrl("flightCount", v); flightsRef.current = allFlightsRef.current.slice(0, v); crRef.current?.setActiveCount(v); mfpRef.current?.setVisibleFlightCount(v); };
  const handleAnimSpeedChange  = (v: number) => updateCtrl("animationSpeed", v);
  const handleRenderTypeChange = (type: "instanced" | "particles") => {
    updateCtrl("planeRenderType", type);
    crRef.current?.getMesh() && (crRef.current!.getMesh()!.visible = false);
    const nr = type === "particles" ? ppRef.current! : ipRef.current!;
    crRef.current = nr;
    nr.getMesh()!.visible = ctrlRef.current.showPlanes;
    allFlightsRef.current.forEach(f => f.setPlaneRenderer(nr));
    nr.setActiveCount(ctrlRef.current.flightCount);
    nr.setGlobalScale(ctrlRef.current.planeSize * (type === "particles" ? 2 : 1));
    nr.setColorization(ctrlRef.current.colorizePlanes);
  };
  const handleShowFlightPaths  = (v: boolean) => { updateCtrl("showFlightPaths", v); if (mfpRef.current?.getMesh) mfpRef.current!.getMesh()!.visible = v; };
  const handleShowPlanes       = (v: boolean) => { updateCtrl("showPlanes", v); const m = crRef.current?.getMesh(); if (m) m.visible = v; };
  const handleColorizePlanes   = (v: boolean) => { updateCtrl("colorizePlanes", v); crRef.current?.setColorization(v); };
  const handleDayNight         = (v: boolean) => { updateCtrl("dayNightEffect", v); const dl = dirRef.current, al = ambRef.current; if (!dl || !al) return; if (v) { dl.intensity = ctrlRef.current.dayBrightness; al.intensity = ctrlRef.current.nightBrightness; } else { dl.intensity = 0.5; al.intensity = 1.2; } };
  const handleAtmosphere       = (v: boolean) => { updateCtrl("atmosphereEffect", v); const a = earthRef.current?.atmosphere; if (a?.mesh) a.mesh.visible = v; };
  const handleRealTimeSun      = (v: boolean) => { updateCtrl("realTimeSun", v); if (!v && dirRef.current) dirRef.current.position.set(0, 1000, 1000); };
  const handleTimeSlider       = (v: number) => { updateCtrl("simulatedTime", v); updateCtrl("realTimeSun", false); setTimeDisplay(hoursToTimeString(v)); if (dirRef.current && ctrlRef.current.dayNightEffect) dirRef.current.position.copy(getSunVector3(EARTH_RADIUS, v)); };
  const handleDayBrightness    = (v: number) => { updateCtrl("dayBrightness", v); if (dirRef.current && ctrlRef.current.dayNightEffect) dirRef.current.intensity = v; };
  const handleNightBrightness  = (v: number) => { updateCtrl("nightBrightness", v); if (ambRef.current && ctrlRef.current.dayNightEffect) ambRef.current.intensity = v; };
  const handleShowInterference = (v: boolean) => { updateCtrl("showInterference", v); intRef.current?.setVisible(v); };
  const handleShowCities       = (v: boolean) => { updateCtrl("showCities", v); cityLabelsRef.current?.setVisible(v); if (v && selectedCountry) { const cities = getCitiesForCountry(selectedCountry.iso, 12); cityLabelsRef.current?.setCities(cities); } };

  const currentSnap  = snapshots[playbackIdx];
  const liveAircraft = currentSnap?.aircraft ?? [];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-screen bg-black overflow-hidden" style={{ fontFamily: MONO }}>
      {/* THREE.js canvas */}
      <div ref={mountRef} className="absolute inset-0" style={{ cursor: phase === "globe" ? "crosshair" : "default" }} />

      {/* ── GLOBE PHASE UI ───────────────────────────────────────────────── */}

      {/* Loading state */}
      {!earthReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-black">
          <div className="w-12 h-12 rounded-full" style={{ border: "2px solid rgba(93,162,255,0.1)", borderTopColor: "#5da2ff", animation: "spin 0.9s linear infinite" }} />
          <p className="mt-4 text-xs tracking-[0.3em] uppercase" style={{ color: "rgba(93,162,255,0.5)" }}>Initializing Globe</p>
          <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Intro hint (globe phase) */}
      {earthReady && phase === "globe" && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center z-20 pointer-events-none">
          <div className="px-5 py-2 rounded-full text-xs tracking-widest uppercase"
            style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(93,162,255,0.2)", color: "rgba(255,255,255,0.4)", backdropFilter: "blur(10px)" }}>
            Click a country to view its airspace
          </div>
        </div>
      )}

      {/* Country hover tooltip */}
      {earthReady && phase === "globe" && hoveredCountry && (
        <div className="absolute bottom-20 left-0 right-0 flex justify-center z-20 pointer-events-none">
          <div className="px-6 py-2.5 rounded text-xs tracking-widest uppercase"
            style={{ background: "rgba(0,0,0,0.85)", border: "1px solid rgba(93,162,255,0.4)", color: "#fff", backdropFilter: "blur(10px)" }}>
            {hoveredCountry}
          </div>
        </div>
      )}

      {/* Search box (globe phase) */}
      {earthReady && phase === "globe" && (
        <div className="absolute top-5 left-5 z-30" style={{ width: "260px" }}>
          <div className="flex items-center px-4 rounded-full" style={{ height: "40px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(15px)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" className="mr-3 flex-shrink-0">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
              placeholder="SEARCH COUNTRY..."
              className="w-full bg-transparent text-xs tracking-widest outline-none"
              style={{ color: "#fff", caretColor: "#5da2ff" }}
            />
          </div>
          {searchOpen && searchResults.length > 0 && (
            <div className="mt-3 rounded-2xl overflow-hidden" style={{ background: "rgba(8,8,18,0.9)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(20px)", maxHeight: "280px", overflowY: "auto" }}>
              {searchResults.map(([iso, v]) => (
                <div key={iso} onMouseDown={() => handleSearchSelect(iso)}
                  className="px-5 py-3 cursor-pointer text-xs tracking-widest uppercase transition-all"
                  style={{ color: "rgba(255,255,255,0.55)", borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#5da2ff")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}>
                  {v.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* UTC clock top-right (globe phase) */}
      {earthReady && phase === "globe" && (
        <div className="absolute top-5 right-5 z-20 flex items-center gap-3 px-4 py-2.5 rounded-full"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(15px)" }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#5da2ff" }} />
          <span className="text-xs tracking-widest" style={{ color: "#5da2ff" }}>{timeDisplay} UTC</span>
        </div>
      )}

      {/* ── FLIGHT PHASE UI ──────────────────────────────────────────────── */}

      {/* Top bar */}
      {phase === "flight" && selectedCountry && (
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-2 z-20"
          style={{ background: "linear-gradient(to bottom,rgba(0,0,0,0.9) 0%,transparent 100%)", borderBottom: "1px solid rgba(93,162,255,0.07)" }}>
          <div className="flex items-center gap-3">
            <button onClick={handleBackToGlobe}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs tracking-wider transition-all"
              style={{ background: "rgba(93,162,255,0.08)", border: "1px solid rgba(93,162,255,0.25)", color: "#5da2ff", cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(93,162,255,0.18)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(93,162,255,0.08)")}>
              ← GLOBE
            </button>
            <span className="w-px h-4" style={{ background: "rgba(255,255,255,0.1)" }} />
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#5da2ff" }} />
            <span className="text-xs tracking-[0.2em] uppercase" style={{ color: "rgba(93,162,255,0.85)" }}>
              {selectedCountry.name} Airspace
            </span>
          </div>
          <div className="flex items-center gap-5 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            <span>ROUTES <span style={{ color: "rgba(255,255,255,0.7)" }}>{uiCtrl.flightCount}</span></span>
            <span>LIVE <span style={{ color: "#69f0ae" }}>{liveAircraft.filter(a => a.lat && a.lon).length}</span></span>
            <span>ZONES <span style={{ color: "#ff8800" }}>{zones.length}</span></span>
            <span>UTC <span style={{ color: "#5da2ff" }}>{timeDisplay}</span></span>
            {coords && <span style={{ color: "rgba(255,255,255,0.25)" }}>{coords.lat > 0 ? "N" : "S"}{Math.abs(coords.lat)}° {coords.lng > 0 ? "E" : "W"}{Math.abs(coords.lng)}°</span>}
          </div>
        </div>
      )}

      {/* Vertical tab buttons */}
      {phase === "flight" && (
        <div className="absolute top-12 right-0 z-30 flex flex-col" style={{ gap: "1px" }}>
          {(["adsb", "interference", "controls"] as const).map(p => (
            <button key={p} onClick={() => setActivePanel(activePanel === p ? null : p)}
              className="flex items-center justify-center"
              style={{ width: "28px", height: "80px", background: activePanel === p ? "rgba(93,162,255,0.12)" : "rgba(0,0,0,0.8)", borderLeft: `2px solid ${activePanel === p ? "#5da2ff" : "rgba(255,255,255,0.08)"}`, color: activePanel === p ? "#5da2ff" : "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: "9px", letterSpacing: "0.12em", writingMode: "vertical-rl", textOrientation: "mixed", transform: "rotate(180deg)", textTransform: "uppercase", backdropFilter: "blur(8px)" }}>
              {p === "adsb" ? "ADS-B" : p === "interference" ? "INT ZONES" : "SETTINGS"}
            </button>
          ))}
        </div>
      )}

      {/* ADS-B Panel */}
      {phase === "flight" && activePanel === "adsb" && (
        <Panel title="ADS-B LIVE DATA" onClose={() => setActivePanel(null)}>
          <div className="mb-3 p-3 rounded" style={{ background: "rgba(93,162,255,0.04)", border: "1px solid rgba(93,162,255,0.1)" }}>
            <p className="text-xs mb-2" style={{ color: "rgba(93,162,255,0.5)", letterSpacing: "0.12em" }}>QUERY LOCATION</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <Field label="LATITUDE"  value={adsbLat}  onChange={setAdsbLat}  placeholder="56.13" />
              <Field label="LONGITUDE" value={adsbLon}  onChange={setAdsbLon}  placeholder="-106.3" />
            </div>
            <div className="mb-3"><Field label="RADIUS (NM)" value={adsbDist} onChange={setAdsbDist} placeholder="100" /></div>
            <button onClick={handleFetchADSB} disabled={adsbLoading}
              className="w-full py-2 text-xs tracking-widest uppercase rounded"
              style={{ background: adsbLoading ? "rgba(93,162,255,0.03)" : "rgba(93,162,255,0.1)", border: "1px solid rgba(93,162,255,0.25)", color: adsbLoading ? "rgba(93,162,255,0.25)" : "#5da2ff", cursor: adsbLoading ? "not-allowed" : "pointer" }}>
              {adsbLoading ? "⟳ Fetching..." : "▶  Fetch Snapshot"}
            </button>
          </div>
          <div className="mb-3 px-2 py-1.5 rounded text-xs" style={{ background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.35)", borderLeft: "2px solid rgba(93,162,255,0.2)" }}>
            {adsbStatus}
          </div>

          {snapshots.length > 0 && (
            <div className="mb-4 p-3 rounded" style={{ background: "rgba(93,162,255,0.04)", border: "1px solid rgba(93,162,255,0.1)" }}>
              <div className="flex justify-between text-xs mb-2">
                <span style={{ color: "rgba(93,162,255,0.5)", letterSpacing: "0.12em" }}>PLAYBACK</span>
                <span style={{ color: "#5da2ff" }}>{currentSnap ? new Date(currentSnap.fetchedAt).toLocaleTimeString("en", { timeZone: "UTC", hour12: false }) + " UTC" : "—"}</span>
              </div>
              <input type="range" min={0} max={Math.max(0, snapshots.length - 1)} step={1} value={playbackIdx}
                onChange={e => handlePlaybackSeek(parseInt(e.target.value))}
                className="w-full h-1 rounded appearance-none cursor-pointer mb-2"
                style={{ background: `linear-gradient(to right, #5da2ff ${snapshots.length > 1 ? (playbackIdx / (snapshots.length - 1)) * 100 : 100}%, rgba(255,255,255,0.08) ${snapshots.length > 1 ? (playbackIdx / (snapshots.length - 1)) * 100 : 100}%)` }} />
              <div className="flex justify-between text-xs mb-2" style={{ color: "rgba(255,255,255,0.2)" }}>
                <span>Snap {playbackIdx + 1}/{snapshots.length}</span>
                <span>{liveAircraft.filter(a => a.lat && a.lon).length} w/ position</span>
              </div>
              <div className="flex gap-0.5 flex-wrap">
                {snapshots.map((s, i) => (
                  <button key={i} onClick={() => handlePlaybackSeek(i)}
                    className="w-2 h-2 rounded-full"
                    style={{ background: i === playbackIdx ? "#5da2ff" : "rgba(93,162,255,0.25)", boxShadow: i === playbackIdx ? "0 0 4px #5da2ff" : "none", cursor: "pointer", border: "none" }}
                    title={new Date(s.fetchedAt).toLocaleTimeString()} />
                ))}
              </div>
            </div>
          )}

          {liveAircraft.length > 0 && (
            <div>
              <div className="grid grid-cols-4 px-2 mb-1 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                <span>CALL</span><span>TYPE</span><span>ALT</span><span>KTS</span>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: "240px" }}>
                {liveAircraft.filter(a => a.lat && a.lon).slice(0, 80).map(ac => {
                  const alt = typeof ac.alt_baro === "number" ? ac.alt_baro : 0;
                  const col = alt > 35000 ? "#5da2ff" : alt > 10000 ? "#69f0ae" : alt > 3000 ? "#ffff00" : "#ff9800";
                  const sel = selAircraft?.hex === ac.hex;
                  return (
                    <div key={ac.hex} onClick={() => setSelAircraft(sel ? null : ac)}
                      className="grid grid-cols-4 px-2 py-1 mb-px rounded cursor-pointer text-xs"
                      style={{ background: sel ? "rgba(93,162,255,0.08)" : "rgba(255,255,255,0.015)", border: `1px solid ${sel ? "rgba(93,162,255,0.2)" : "transparent"}` }}>
                      <span style={{ color: "rgba(255,255,255,0.75)" }} className="truncate">{ac.flight?.trim() ?? ac.hex}</span>
                      <span style={{ color: "rgba(255,255,255,0.35)" }}>{ac.t ?? "—"}</span>
                      <span style={{ color: col }}>{alt > 0 ? `${Math.round(alt / 1000)}k` : "GND"}</span>
                      <span style={{ color: "rgba(255,255,255,0.35)" }}>{ac.gs ? `${Math.round(ac.gs)}` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selAircraft && (
            <div className="mt-3 p-3 rounded" style={{ background: "rgba(93,162,255,0.05)", border: "1px solid rgba(93,162,255,0.18)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold" style={{ color: "#5da2ff" }}>{selAircraft.flight?.trim() ?? selAircraft.hex}</span>
                {selAircraft.emergency && selAircraft.emergency !== "none" && <span className="text-xs px-1 rounded" style={{ background: "rgba(255,0,0,0.2)", color: "#ff4444" }}>⚠ EMERGENCY</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[["HEX",selAircraft.hex],["REG",selAircraft.r??"—"],["TYPE",selAircraft.t??selAircraft.category??"—"],["ALT",typeof selAircraft.alt_baro==="number"?`${selAircraft.alt_baro.toLocaleString()} ft`:"—"],["SPEED",selAircraft.gs!==undefined?`${Math.round(selAircraft.gs)} kts`:"—"],["TRACK",selAircraft.track!==undefined?`${selAircraft.track.toFixed(0)}°`:"—"],["LAT",selAircraft.lat?.toFixed(4)??"—"],["LON",selAircraft.lon?.toFixed(4)??"—"],["SQUAWK",selAircraft.squawk??"—"]].map(([k,v])=>(
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>{k}</span>
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* Interference panel */}
      {phase === "flight" && activePanel === "interference" && (
        <Panel title="INTERFERENCE ZONES" onClose={() => setActivePanel(null)}>
          <div className="mb-3"><Toggle label="Show on Globe" value={uiCtrl.showInterference} onChange={handleShowInterference} /></div>
          <div className="mb-4 p-3 rounded" style={{ background: "rgba(255,80,0,0.04)", border: "1px solid rgba(255,80,0,0.12)" }}>
            <p className="text-xs mb-2" style={{ color: "rgba(255,140,0,0.6)", letterSpacing: "0.12em" }}>SEVERITY</p>
            {[["#ff0055","Critical"],["#ff3300","High"],["#ff8800","Medium"],["#ffff00","Low"]].map(([c,l])=>(
              <div key={c} className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full" style={{ background: c, boxShadow: `0 0 5px ${c}` }} />
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{l}</span>
              </div>
            ))}
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: "340px" }}>
            {zones.map(z => {
              const cols = { critical:"#ff0055", high:"#ff3300", medium:"#ff8800", low:"#ffff00" };
              const c = cols[z.severity];
              const sel = selZone?.id === z.id;
              return (
                <div key={z.id} onClick={() => setSelZone(sel ? null : z)}
                  className="flex items-center gap-2 px-2 py-2 mb-px rounded cursor-pointer"
                  style={{ background: sel ? "rgba(255,80,0,0.08)" : "rgba(255,255,255,0.015)", border: `1px solid ${sel ? "rgba(255,80,0,0.2)" : "transparent"}` }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c, boxShadow: `0 0 4px ${c}` }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.65)" }}>{z.label ?? z.id}</div>
                    <div className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>{z.type.toUpperCase()} · {z.radiusNm} NM</div>
                  </div>
                  <span className="text-xs uppercase flex-shrink-0" style={{ color: c, fontSize: "9px" }}>{z.severity}</span>
                </div>
              );
            })}
          </div>
          {selZone && (
            <div className="mt-3 p-3 rounded" style={{ background: "rgba(255,80,0,0.05)", border: "1px solid rgba(255,80,0,0.18)" }}>
              <p className="text-xs font-bold mb-2" style={{ color: "#ff8800" }}>{selZone.label ?? selZone.id}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[["TYPE",selZone.type.toUpperCase()],["SEV",selZone.severity.toUpperCase()],["RADIUS",`${selZone.radiusNm} NM`],["LAT",selZone.lat.toFixed(4)],["LON",selZone.lng.toFixed(4)]].map(([k,v])=>(
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>{k}</span>
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* Settings panel */}
      {phase === "flight" && activePanel === "controls" && (
        <Panel title="SETTINGS" onClose={() => setActivePanel(null)}>
          <Section title="PLANES">
            <CtrlRow label="Render Type">
              <div className="flex gap-1">
                {(["instanced","particles"] as const).map(t => (
                  <button key={t} onClick={() => handleRenderTypeChange(t)} className="flex-1 py-1 text-xs rounded"
                    style={{ background: uiCtrl.planeRenderType===t?"rgba(93,162,255,0.15)":"rgba(255,255,255,0.03)", border:`1px solid ${uiCtrl.planeRenderType===t?"rgba(93,162,255,0.4)":"rgba(255,255,255,0.08)"}`, color:uiCtrl.planeRenderType===t?"#5da2ff":"rgba(255,255,255,0.35)", cursor:"pointer", textTransform:"uppercase" }}>
                    {t}
                  </button>
                ))}
              </div>
            </CtrlRow>
            <Slider label="Size"   value={uiCtrl.planeSize}   min={1}  max={10} step={0.1} onChange={handlePlaneSizeChange} />
            <Slider label="Count"  value={uiCtrl.flightCount} min={1}  max={flightData.length} step={1} onChange={handleFlightCountChange} />
            <Toggle label="Colorize"    value={uiCtrl.colorizePlanes}  onChange={handleColorizePlanes} />
            <Toggle label="Show Planes" value={uiCtrl.showPlanes}      onChange={handleShowPlanes} />
            <Toggle label="Show Paths"  value={uiCtrl.showFlightPaths} onChange={handleShowFlightPaths} />
            <Toggle label="City Labels" value={uiCtrl.showCities}      onChange={handleShowCities} />
          </Section>
          <Section title="ANIMATION">
            <Slider label="Speed" value={uiCtrl.animationSpeed} min={0.1} max={3} step={0.1} onChange={handleAnimSpeedChange} />
          </Section>
          <Section title="LIGHTING">
            <Toggle label="Day/Night"     value={uiCtrl.dayNightEffect}  onChange={handleDayNight} />
            <Toggle label="Atmosphere"    value={uiCtrl.atmosphereEffect} onChange={handleAtmosphere} />
            <Toggle label="Real-time Sun" value={uiCtrl.realTimeSun}     onChange={handleRealTimeSun} />
            <div className="flex justify-between text-xs mb-2"><span style={{ color: "rgba(255,255,255,0.35)" }}>UTC</span><span style={{ color: "#5da2ff" }}>{timeDisplay}</span></div>
            <Slider label="Time"       value={uiCtrl.simulatedTime}  min={0} max={24}  step={0.1} onChange={handleTimeSlider} />
            <Slider label="Day"        value={uiCtrl.dayBrightness}  min={0} max={3}   step={0.1} onChange={handleDayBrightness} />
            <Slider label="Night"      value={uiCtrl.nightBrightness} min={0} max={2}  step={0.1} onChange={handleNightBrightness} />
          </Section>
        </Panel>
      )}

      {/* Bottom hint – flight phase */}
      {phase === "flight" && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center py-1.5 z-10" style={{ background: "linear-gradient(to top,rgba(0,0,0,0.6) 0%,transparent 100%)" }}>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.18)" }}>
            Drag · Zoom · {flightData.length} static routes
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function Panel({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute top-12 right-7 z-20 flex flex-col rounded-lg overflow-hidden"
      style={{ width: "300px", maxHeight: "calc(100vh - 56px)", background: "rgba(3,7,16,0.94)", border: "1px solid rgba(93,162,255,0.12)", backdropFilter: "blur(24px)" }}>
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(93,162,255,0.1)", background: "rgba(93,162,255,0.04)" }}>
        <span className="text-xs tracking-[0.15em]" style={{ color: "rgba(93,162,255,0.7)" }}>{title}</span>
        <button onClick={onClose} style={{ color: "rgba(255,255,255,0.25)", cursor: "pointer", background: "none", border: "none", fontSize: "12px" }}>✕</button>
      </div>
      <div className="overflow-y-auto p-4 flex-1">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.28)", letterSpacing: "0.1em" }}>{label}</div>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-2 py-1.5 text-xs rounded"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(93,162,255,0.18)", color: "rgba(255,255,255,0.8)", outline: "none", fontFamily: "monospace" }} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-xs mb-2 pb-1" style={{ color: "rgba(93,162,255,0.5)", borderBottom: "1px solid rgba(93,162,255,0.08)", letterSpacing: "0.15em" }}>{title}</div>
      {children}
    </div>
  );
}

function CtrlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-2"><div className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</div>{children}</div>;
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
        <span style={{ color: "rgba(93,162,255,0.7)" }}>{value.toFixed(step < 1 ? 1 : 0)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right,rgba(93,162,255,0.45) ${pct}%,rgba(255,255,255,0.07) ${pct}%)`, outline: "none" }} />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
      <button onClick={() => onChange(!value)} className="relative w-8 h-4 rounded-full"
        style={{ background: value ? "rgba(93,162,255,0.2)" : "rgba(255,255,255,0.06)", border: `1px solid ${value ? "rgba(93,162,255,0.4)" : "rgba(255,255,255,0.12)"}`, cursor: "pointer" }}>
        <span className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
          style={{ left: value ? "calc(100% - 14px)" : "1px", background: value ? "#5da2ff" : "rgba(255,255,255,0.25)" }} />
      </button>
    </div>
  );
}
