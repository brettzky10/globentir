"use client";

/**
 * ProjectionViewer
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps AirspaceViewer inside a Maptastic-warped canvas so the live airspace
 * map can be projection-mapped onto any physical surface.
 *
 * Layout
 * ──────
 *  • One full-screen black stage (outer shell, receives no pointer events itself)
 *  • #maptastic-layer  – the element Maptastic controls; a fixed div that
 *    contains the entire AirspaceViewer.  Maptastic applies a CSS matrix3d
 *    transform to this div so it can be warped to any quad on the screen.
 *  • Maptastic's own overlay canvas sits at z-index 1000000 (from the lib)
 *    and is only visible while the config mode is active (Shift+Space).
 *
 * Keyboard shortcuts
 * ──────────────────
 *  Shift + P          → toggle ALL HUD / controls / legend in AirspaceViewer
 *  Shift + Space      → toggle Maptastic config mode (corner-drag, rotate, scale)
 *
 * Maptastic config mode keys (while config active)
 * ─────────────────────────────────────────────────
 *  Drag corner handles  → warp quad corners
 *  Drag inside quad     → translate whole layer
 *  Alt + drag           → rotate / scale
 *  Arrow keys           → nudge (Shift = ×10)
 *  R                    → rotate 90°
 *  S                    → solo this layer
 *  H / V                → flip horizontal / vertical
 *  B                    → toggle screen-bounds guide
 *  C                    → toggle corner labels
 *  Shift + Space again  → exit config mode
 *
 * The Maptastic layout (corner positions) is auto-saved to localStorage under
 * the key "maptastic.layers" and restored on next load.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";

// ── AirspaceViewer is imported directly (not dynamic) because we're already
//    inside a dynamic() boundary at the page level.
import AirspaceViewer from "@/components/global/AirspaceViewer";

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  citySlug:    string;
  displayName: string;
  initialLat:  number | null;
  initialLng:  number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const LAYER_ID = "maptastic-layer";

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProjectionViewer({
  citySlug,
  displayName,
  initialLat,
  initialLng,
}: Props) {
  const router          = useRouter();
  const maptasticRef    = useRef<MaptasticInstance | null>(null);
  const configActiveRef = useRef(false);

  // Whether the AirspaceViewer HUD (controls, legend, labels) is shown
  const [hudVisible, setHudVisible] = useState(true);
  // Whether Maptastic config mode overlay hint is visible
  const [configHint, setConfigHint] = useState(false);
  // Toast message for Shift+P toggle feedback
  const [toast, setToast] = useState<string | null>(null);

  // ── Toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  // ── Load Maptastic script dynamically ────────────────────────────────────
  useEffect(() => {
    // Maptastic reads document.body for its canvas; wait until mounted
    const existing = document.getElementById("maptastic-script");
    if (existing) {
      initMaptastic();
      return;
    }
    const script = document.createElement("script");
    script.id  = "maptastic-script";
    script.src = "/maptastic.min.js";   // place maptastic.min.js in /public/
    script.onload = initMaptastic;
    document.head.appendChild(script);

    return () => {
      // Cleanup: Maptastic has no public destroy API, so we just drop the ref
      maptasticRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initMaptastic = useCallback(() => {
    // Small delay to ensure #maptastic-layer is in the DOM
    setTimeout(() => {
      if (typeof (window as MaptasticWindow).Maptastic !== "function") return;
      const instance = (window as MaptasticWindow).Maptastic({
        layers:   [LAYER_ID],
        labels:   true,
        crosshairs: false,
        autoSave: true,
        autoLoad: true,
      });
      maptasticRef.current = instance;
    }, 150);
  }, []);

  // ── Global keyboard handler ───────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Shift + P  →  toggle HUD
      if (e.shiftKey && e.key === "P") {
        e.preventDefault();
        setHudVisible(prev => {
          const next = !prev;
          showToast(next ? "HUD ON  (Shift+P)" : "HUD OFF  (Shift+P)");
          return next;
        });
        return;
      }

      // Shift + Space  →  toggle Maptastic config mode
      if (e.shiftKey && e.key === " ") {
        e.preventDefault();
        const next = !configActiveRef.current;
        configActiveRef.current = next;
        maptasticRef.current?.setConfigEnabled(next);
        setConfigHint(next);
        showToast(next ? "PROJECTION CONFIG ON  (Shift+Space to exit)" : "PROJECTION CONFIG OFF");
        return;
      }
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [showToast]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position:   "fixed",
        inset:      0,
        background: "#000",
        overflow:   "hidden",
      }}
    >
      {/*
       * ── Maptastic layer ────────────────────────────────────────────────────
       * This div is what Maptastic warps.  It starts at full-screen so the
       * initial state looks normal; the user then enters config mode and drags
       * the corners to match their projection surface.
       *
       * IMPORTANT: Maptastic sets position:fixed + top/left 0 + CSS matrix3d
       * on this element, so we let it take full viewport by default.
       * AirspaceViewer itself also expects to fill 100vw × 100vh.
       */}
      <div
        id={LAYER_ID}
        style={{
          position: "fixed",
          top:      0,
          left:     0,
          width:    "100vw",
          height:   "100vh",
          overflow: "hidden",
        }}
      >
        {/*
         * HUD visibility wrapper.
         * We pass `hudVisible` down as a prop so AirspaceViewer can hide its
         * own overlays. We also apply a CSS class on the container so that
         * any overlay children that AirspaceViewer renders at absolute/fixed
         * positions are hidden via CSS when HUD is off.
         */}
        <div
          className={hudVisible ? "hud-on" : "hud-off"}
          style={{ position: "relative", width: "100%", height: "100%" }}
        >
          <AirspaceViewer
            citySlug={citySlug}
            displayName={displayName}
            initialLat={initialLat}
            initialLng={initialLng}
            hudVisible={hudVisible}
          />
        </div>
      </div>

      {/* ── Projection config hint overlay (shown while config active) ──── */}
      {configHint && (
        <div
          style={{
            position:      "fixed",
            bottom:        24,
            left:          "50%",
            transform:     "translateX(-50%)",
            zIndex:        999999,          // just below Maptastic canvas (1000000)
            padding:       "10px 22px",
            borderRadius:  14,
            background:    "rgba(0,0,0,0.88)",
            border:        "1px solid rgba(255,200,0,0.35)",
            backdropFilter: "blur(16px)",
            fontFamily:    "monospace",
            fontSize:      11,
            color:         "rgba(255,200,0,0.85)",
            letterSpacing: "0.12em",
            pointerEvents: "none",
          }}
        >
          ⬡ PROJECTION CONFIG  ·  drag corners to warp  ·  Shift+Space to exit
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          style={{
            position:      "fixed",
            top:           24,
            left:          "50%",
            transform:     "translateX(-50%)",
            zIndex:        999998,
            padding:       "8px 20px",
            borderRadius:  12,
            background:    "rgba(0,0,0,0.82)",
            border:        "1px solid rgba(0,229,255,0.25)",
            backdropFilter: "blur(12px)",
            fontFamily:    "monospace",
            fontSize:      11,
            color:         "#00e5ff",
            letterSpacing: "0.15em",
            pointerEvents: "none",
            animation:     "fadeInOut 2.2s ease forwards",
          }}
        >
          {toast}
        </div>
      )}

      {/*
       * ── Back button (always visible, outside Maptastic layer) ──────────
       * Rendered at z-index below Maptastic's config canvas but above content.
       * Hidden when HUD is off so projection surface stays clean.
       */}
      {hudVisible && (
        <button
          onClick={() => router.back()}
          style={{
            position:      "fixed",
            top:           14,
            left:          14,
            zIndex:        999997,
            padding:       "6px 14px",
            borderRadius:  20,
            border:        "1px solid rgba(0,229,255,0.25)",
            background:    "rgba(0,229,255,0.07)",
            color:         "#00e5ff",
            cursor:        "pointer",
            fontFamily:    "monospace",
            fontSize:      11,
            letterSpacing: "0.1em",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,229,255,0.15)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,229,255,0.07)")}
        >
          ← GLOBE
        </button>
      )}

      {/* ── Keyboard shortcut reminder (shown when HUD visible) ─────────── */}
      {hudVisible && (
        <div
          style={{
            position:      "fixed",
            bottom:        14,
            right:         14,
            zIndex:        999997,
            fontFamily:    "monospace",
            fontSize:      10,
            color:         "rgba(255,255,255,0.18)",
            letterSpacing: "0.12em",
            pointerEvents: "none",
            textAlign:     "right",
            lineHeight:    1.7,
          }}
        >
          <div>Shift+P  →  hide HUD</div>
          <div>Shift+Space  →  projection warp</div>
        </div>
      )}

      {/* ── Global styles ─────────────────────────────────────────────────── */}
      <style>{`
        @keyframes fadeInOut {
          0%   { opacity: 0; transform: translateX(-50%) translateY(-6px); }
          12%  { opacity: 1; transform: translateX(-50%) translateY(0); }
          80%  { opacity: 1; }
          100% { opacity: 0; }
        }

        /*
         * When HUD is off, hide every direct child of the AirspaceViewer
         * that is positioned absolutely or fixed EXCEPT the Mapbox div and
         * the drawing canvas.  We do this with a CSS cascade trick:
         * .hud-off hides all z-index overlays by filtering on data attributes
         * that AirspaceViewer sets.  Because AirspaceViewer uses inline styles
         * with zIndex ≥ 5 for overlays, we simply hide all children that
         * are not the map container or canvas.
         *
         * The cleanest approach: AirspaceViewer receives hudVisible prop and
         * conditionally renders its overlay divs.  The CSS below is a fallback
         * safety net for any overlay that slips through.
         */
        .hud-off [data-hud],
        .hud-off [data-overlay] {
          display: none !important;
        }

        /* Slider thumb colours (carried over from AirspaceViewer) */
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: #00e5ff; cursor: pointer;
          box-shadow: 0 0 8px #00e5ff, 0 0 16px rgba(0,229,255,0.35);
          border: 2px solid rgba(0,0,0,0.4);
        }
        input[type=range]::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%;
          background: #00e5ff; cursor: pointer;
          box-shadow: 0 0 8px #00e5ff;
          border: 2px solid rgba(0,0,0,0.4);
        }
        input[type=range].bearing-slider::-webkit-slider-thumb {
          background: #a78bfa;
          box-shadow: 0 0 8px #a78bfa, 0 0 16px rgba(167,139,250,0.35);
        }
        input[type=range].bearing-slider::-moz-range-thumb {
          background: #a78bfa; box-shadow: 0 0 8px #a78bfa;
        }
        input[type=range].pitch-slider::-webkit-slider-thumb {
          background: #34d399;
          box-shadow: 0 0 8px #34d399, 0 0 16px rgba(52,211,153,0.35);
        }
        input[type=range].pitch-slider::-moz-range-thumb {
          background: #34d399; box-shadow: 0 0 8px #34d399;
        }
      `}</style>
    </div>
  );
}

// ─── Maptastic type shims ─────────────────────────────────────────────────────
interface MaptasticInstance {
  getLayout: () => unknown;
  setLayout: (layout: unknown) => void;
  setConfigEnabled: (enabled: boolean) => void;
  addLayer: (el: HTMLElement | string, points?: number[][]) => void;
}

interface MaptasticWindow extends Window {
  Maptastic: (options: {
    layers?:     (string | HTMLElement)[];
    labels?:     boolean;
    crosshairs?: boolean;
    autoSave?:   boolean;
    autoLoad?:   boolean;
    onchange?:   () => void;
  }) => MaptasticInstance;
}