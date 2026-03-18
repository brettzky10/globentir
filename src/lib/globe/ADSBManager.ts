import * as THREE from "three";
import type { ADSBaircraft, ADSBSnapshot } from "@/app/api/adsb/route";
import { latLngToVector3 } from "./Utils";

export type { ADSBaircraft, ADSBSnapshot };

export interface LiveAircraftMarker {
  id: string;
  aircraft: ADSBaircraft;
  mesh: THREE.Mesh;
  labelData: {
    callsign: string;
    altitude: string;
    speed: string;
    type: string;
    lat: number;
    lng: number;
  };
}

const EARTH_RADIUS = 3000;
const ALTITUDE_SCALE = 0.015; // scene units per foot

// Colours by category/altitude
function getAircraftColor(ac: ADSBaircraft): THREE.Color {
  const alt = typeof ac.alt_baro === "number" ? ac.alt_baro : 0;
  if (ac.emergency && ac.emergency !== "none") return new THREE.Color(0xff0000);
  if (alt > 35000) return new THREE.Color(0x00e5ff);    // high cruise - cyan
  if (alt > 20000) return new THREE.Color(0x40c4ff);    // mid cruise - light blue
  if (alt > 10000) return new THREE.Color(0x69f0ae);    // climb - green
  if (alt > 3000)  return new THREE.Color(0xffff00);    // approach - yellow
  return new THREE.Color(0xff9800);                     // low/ground - orange
}

export class ADSBManager {
  private scene: THREE.Scene | null = null;
  private markers: Map<string, LiveAircraftMarker> = new Map();
  private snapshots: ADSBSnapshot[] = [];           // up to 60 snapshots = 1hr at 1/min
  private playbackIndex = 0;                        // which snapshot is "active"
  private isPlayback = false;
  private searchLat = 56.1304;
  private searchLon = -106.3468;
  private searchDistNm = 100;
  private isLoading = false;
  private onLoadingChange?: (v: boolean) => void;
  private onSnapshotsChange?: (snaps: ADSBSnapshot[]) => void;
  private onStatusChange?: (msg: string) => void;
  private queryCenter: THREE.Mesh | null = null;
  private queryRing: THREE.Line | null = null;

  addToScene(scene: THREE.Scene): void {
    this.scene = scene;
  }

  setCallbacks(cb: {
    onLoadingChange?: (v: boolean) => void;
    onSnapshotsChange?: (snaps: ADSBSnapshot[]) => void;
    onStatusChange?: (msg: string) => void;
  }): void {
    this.onLoadingChange = cb.onLoadingChange;
    this.onSnapshotsChange = cb.onSnapshotsChange;
    this.onStatusChange = cb.onStatusChange;
  }

  // ─── Fetch a new snapshot from the API ──────────────────────────────────────
  async fetchSnapshot(lat: number, lon: number, distNm = 100): Promise<void> {
    if (this.isLoading) return;
    this.searchLat = lat;
    this.searchLon = lon;
    this.searchDistNm = distNm;

    this.isLoading = true;
    this.onLoadingChange?.(true);
    this.onStatusChange?.("Fetching ADS-B data...");

    try {
      const res = await fetch(
        `/api/adsb?lat=${lat}&lon=${lon}&dist=${distNm}`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const snap: ADSBSnapshot = await res.json();

      // Cap history at 60 snapshots
      this.snapshots = [...this.snapshots, snap].slice(-60);
      this.onSnapshotsChange?.(this.snapshots);

      // Jump to latest
      this.playbackIndex = this.snapshots.length - 1;
      this.renderSnapshot(this.snapshots[this.playbackIndex]);
      this.updateQueryVisual(lat, lon, distNm);

      const count = snap.aircraft.length;
      this.onStatusChange?.(`Loaded ${count} aircraft @ ${new Date(snap.fetchedAt).toUTCString()}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      this.onStatusChange?.(`Error: ${msg}`);
    } finally {
      this.isLoading = false;
      this.onLoadingChange?.(false);
    }
  }

  // ─── Show a specific snapshot by index ──────────────────────────────────────
  seekToSnapshot(index: number): void {
    const i = Math.max(0, Math.min(index, this.snapshots.length - 1));
    this.playbackIndex = i;
    if (this.snapshots[i]) this.renderSnapshot(this.snapshots[i]);
  }

  getPlaybackIndex(): number { return this.playbackIndex; }
  getSnapshotCount(): number { return this.snapshots.length; }
  getSnapshots(): ADSBSnapshot[] { return this.snapshots; }
  getIsLoading(): boolean { return this.isLoading; }

  // ─── Render one snapshot into the scene ─────────────────────────────────────
  private renderSnapshot(snap: ADSBSnapshot): void {
    // Clear old markers
    this.clearMarkers();

    snap.aircraft.forEach((ac) => {
      if (!ac.lat || !ac.lon) return;
      this.createMarker(ac);
    });
  }

  private createMarker(ac: ADSBaircraft): void {
    if (!this.scene || !ac.lat || !ac.lon) return;

    const altFt = typeof ac.alt_baro === "number" ? ac.alt_baro : 0;
    const altScene = Math.max(altFt, 0) * ALTITUDE_SCALE;
    const pos = latLngToVector3(ac.lat, ac.lon, EARTH_RADIUS + 5 + altScene);
    const color = getAircraftColor(ac);

    // Diamond-shaped marker for each aircraft
    const geo = new THREE.OctahedronGeometry(12, 0);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);

    // Orient outward from earth
    const normal = pos.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(up, normal);

    // Rotate based on track
    if (ac.track !== undefined) {
      const trackRad = (ac.track * Math.PI) / 180;
      mesh.rotateOnWorldAxis(normal, -trackRad);
    }

    this.scene.add(mesh);

    const id = ac.hex;
    this.markers.set(id, {
      id,
      aircraft: ac,
      mesh,
      labelData: {
        callsign: ac.flight?.trim() ?? ac.hex,
        altitude: altFt > 0 ? `${(altFt / 1000).toFixed(1)}k ft` : "GND",
        speed: ac.gs !== undefined ? `${Math.round(ac.gs)} kts` : "—",
        type: ac.t ?? ac.category ?? "?",
        lat: ac.lat,
        lng: ac.lon,
      },
    });
  }

  private clearMarkers(): void {
    if (!this.scene) return;
    this.markers.forEach((m) => {
      this.scene!.remove(m.mesh);
      m.mesh.geometry.dispose();
      (m.mesh.material as THREE.Material).dispose();
    });
    this.markers.clear();
  }

  // ─── Draw query circle on globe ──────────────────────────────────────────────
  private updateQueryVisual(lat: number, lon: number, distNm: number): void {
    if (!this.scene) return;

    // Remove old visuals
    if (this.queryCenter) this.scene.remove(this.queryCenter);
    if (this.queryRing) this.scene.remove(this.queryRing);

    const NM_TO_SCENE = (Math.PI * EARTH_RADIUS) / (180 * 60);
    const radiusScene = distNm * NM_TO_SCENE;
    const center = latLngToVector3(lat, lon, EARTH_RADIUS + 8);
    const normal = center.clone().normalize();

    // Center dot
    const dotGeo = new THREE.SphereGeometry(8, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, depthWrite: false });
    this.queryCenter = new THREE.Mesh(dotGeo, dotMat);
    this.queryCenter.position.copy(center);
    this.scene.add(this.queryCenter);

    // Dashed circle at dist
    const segments = 128;
    const ringPoints: THREE.Vector3[] = [];
    const tangent1 = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    const tangent2 = new THREE.Vector3().crossVectors(normal, tangent1).normalize();

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const offset = tangent1
        .clone()
        .multiplyScalar(Math.cos(angle) * radiusScene)
        .add(tangent2.clone().multiplyScalar(Math.sin(angle) * radiusScene));
      const pt = center.clone().add(offset).normalize().multiplyScalar(EARTH_RADIUS + 8);
      ringPoints.push(pt);
    }

    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const ringMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    this.queryRing = new THREE.Line(ringGeo, ringMat);
    this.scene.add(this.queryRing);
  }

  getMarkers(): LiveAircraftMarker[] {
    return Array.from(this.markers.values());
  }

  dispose(): void {
    this.clearMarkers();
    if (this.scene) {
      if (this.queryCenter) this.scene.remove(this.queryCenter);
      if (this.queryRing) this.scene.remove(this.queryRing);
    }
  }
}
