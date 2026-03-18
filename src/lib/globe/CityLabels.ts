import * as THREE from "three";
import { latLngToVector3 } from "./Utils";
import type { City } from "./cities";
import { buildAirspaceUrl } from "./cityNav";

const EARTH_RADIUS = 3000;

interface CityLabel {
  city: City;
  element: HTMLElement;
  worldPos: THREE.Vector3;
}

export class CityLabels {
  private container: HTMLElement;
  private labels: CityLabel[] = [];
  private visible = false;
  private camera: THREE.Camera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private onCityClick: ((city: City) => void) | null = null;

  setOnCityClick(cb: (city: City) => void) {
    this.onCityClick = cb;
  }

  constructor() {
    this.container = document.createElement("div");
    this.container.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 15;
      overflow: hidden;
    `;
  }

  mount(parent: HTMLElement) {
    parent.appendChild(this.container);
  }

  unmount() {
    this.container.remove();
  }

  setCamera(camera: THREE.Camera) { this.camera = camera; }
  setRenderer(renderer: THREE.WebGLRenderer) { this.renderer = renderer; }

  setCities(cities: City[]) {
    this.clearLabels();
    for (const city of cities) {
      const el = this.createLabelElement(city);
      const worldPos = latLngToVector3(city.lat, city.lng, EARTH_RADIUS * 1.002);
      this.labels.push({ city, element: el, worldPos });
      this.container.appendChild(el);
    }
  }

  clearLabels() {
    this.labels.forEach(l => l.element.remove());
    this.labels = [];
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.container.style.display = v ? "block" : "none";
    if (!v) this.clearLabels();
  }

  private createLabelElement(city: City): HTMLElement {
    const el = document.createElement("div");
    el.style.cssText = `
      position: absolute;
      pointer-events: auto;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      opacity: 0;
      transition: opacity 0.4s ease;
      cursor: pointer;
    `;

    // Dot marker
    const dot = document.createElement("div");
    const dotSize = city.pop > 5000000 ? 6 : city.pop > 1000000 ? 5 : 4;
    dot.style.cssText = `
      width: ${dotSize}px;
      height: ${dotSize}px;
      border-radius: 50%;
      background: #00e5ff;
      box-shadow: 0 0 ${dotSize * 3}px rgba(0,229,255,0.9), 0 0 ${dotSize}px rgba(255,255,255,0.9);
      flex-shrink: 0;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    `;

    // Name label
    const name = document.createElement("div");
    const fontSize = city.pop > 5000000 ? 10 : city.pop > 2000000 ? 9 : 8;
    name.style.cssText = `
      font-family: monospace;
      font-size: ${fontSize}px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.9);
      text-shadow: 0 0 8px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,1);
      white-space: nowrap;
      padding: 2px 5px;
      border-radius: 3px;
      transition: background 0.15s ease, color 0.15s ease;
    `;
    name.textContent = city.name;

    el.appendChild(dot);
    el.appendChild(name);

    // Hover effects
    el.addEventListener("mouseenter", () => {
      dot.style.transform = "scale(1.7)";
      dot.style.boxShadow = `0 0 ${dotSize * 5}px rgba(0,229,255,1), 0 0 ${dotSize * 2}px #fff`;
      name.style.background = "rgba(0,229,255,0.18)";
      name.style.color = "#00e5ff";
    });
    el.addEventListener("mouseleave", () => {
      dot.style.transform = "scale(1)";
      dot.style.boxShadow = `0 0 ${dotSize * 3}px rgba(0,229,255,0.9)`;
      name.style.background = "transparent";
      name.style.color = "rgba(255,255,255,0.9)";
    });

    // Click → navigate to airspace page
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.onCityClick) {
        this.onCityClick(city);
      } else {
        const url = buildAirspaceUrl(city);
        window.location.href = url;
      }
    });

    // Fade in
    requestAnimationFrame(() => { el.style.opacity = "1"; });

    return el;
  }

  update() {
    if (!this.visible || !this.camera || !this.renderer) return;

    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const projMatrix = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );

    const cameraPos = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPos);

    for (const label of this.labels) {
      // Check if point is on the visible hemisphere
      const toCity = label.worldPos.clone().normalize();
      const toCamera = cameraPos.clone().normalize();
      const dot = toCity.dot(toCamera);

      if (dot < 0.1) {
        // Behind globe — hide
        label.element.style.opacity = "0";
        continue;
      }

      // Project to NDC
      const projected = label.worldPos.clone().applyMatrix4(projMatrix);

      // Convert NDC to screen pixels
      const sx = (projected.x * 0.5 + 0.5) * w;
      const sy = (1 - (projected.y * 0.5 + 0.5)) * h;

      label.element.style.left = `${sx}px`;
      label.element.style.top  = `${sy}px`;

      // Fade based on how face-on it is
      const fadeFactor = Math.min(1, (dot - 0.1) / 0.15);
      label.element.style.opacity = String(fadeFactor.toFixed(3));
    }
  }
}
