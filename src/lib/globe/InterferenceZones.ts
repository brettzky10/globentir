import * as THREE from "three";
import { latLngToVector3 } from "./Utils";

export interface InterferenceZone {
  id: string;
  lat: number;
  lng: number;
  radiusNm: number;          // radius in nautical miles
  type: "gps" | "rf" | "spoofing" | "jamming";
  severity: "low" | "medium" | "high" | "critical";
  label?: string;
  detectedAt?: number;       // unix ms
}

// 1 NM in degrees lat ≈ 1/60
const NM_TO_DEG = 1 / 60;
// Earth radius used by the 3D scene
const EARTH_RADIUS = 3000;
// NM to scene units: circumference = 2π * EARTH_RADIUS, mapped to 360°
const NM_TO_SCENE = (Math.PI * EARTH_RADIUS) / (180 * 60); // ≈ 0.873 scene units per NM

const SEVERITY_COLORS: Record<InterferenceZone["severity"], THREE.Color> = {
  low: new THREE.Color(0xffff00),
  medium: new THREE.Color(0xff8800),
  high: new THREE.Color(0xff3300),
  critical: new THREE.Color(0xff0055),
};

const TYPE_LABELS: Record<InterferenceZone["type"], string> = {
  gps: "GPS JAM",
  rf: "RF INT",
  spoofing: "SPOOF",
  jamming: "JAM",
};

interface ZoneMeshes {
  ring: THREE.Mesh;
  pulse: THREE.Mesh;
  spike: THREE.Line;
  group: THREE.Group;
}

export class InterferenceZones {
  private scene: THREE.Scene | null = null;
  private zones: Map<string, InterferenceZone> = new Map();
  private meshes: Map<string, ZoneMeshes> = new Map();
  private time = 0;
  private visible = true;

  addToScene(scene: THREE.Scene): void {
    this.scene = scene;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.meshes.forEach((m) => { m.group.visible = v; });
  }

  addZone(zone: InterferenceZone): void {
    this.zones.set(zone.id, zone);
    this.createMeshForZone(zone);
  }

  removeZone(id: string): void {
    this.zones.delete(id);
    const m = this.meshes.get(id);
    if (m && this.scene) {
      this.scene.remove(m.group);
      m.ring.geometry.dispose();
      (m.ring.material as THREE.Material).dispose();
      m.pulse.geometry.dispose();
      (m.pulse.material as THREE.Material).dispose();
      m.spike.geometry.dispose();
      (m.spike.material as THREE.Material).dispose();
    }
    this.meshes.delete(id);
  }

  clearAll(): void {
    [...this.zones.keys()].forEach((id) => this.removeZone(id));
  }

  setZones(zones: InterferenceZone[]): void {
    this.clearAll();
    zones.forEach((z) => this.addZone(z));
  }

  private createMeshForZone(zone: InterferenceZone): void {
    if (!this.scene) return;

    const color = SEVERITY_COLORS[zone.severity];
    const center = latLngToVector3(zone.lat, zone.lng, EARTH_RADIUS);
    const normal = center.clone().normalize();
    const radiusScene = zone.radiusNm * NM_TO_SCENE;

    const group = new THREE.Group();

    // ── Ring (torus on sphere surface) ──────────────────────────────────
    const ringGeo = new THREE.TorusGeometry(radiusScene, radiusScene * 0.025, 8, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);

    // ── Outer pulse ring ────────────────────────────────────────────────
    const pulseGeo = new THREE.TorusGeometry(radiusScene * 1.1, radiusScene * 0.015, 6, 64);
    const pulseMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const pulse = new THREE.Mesh(pulseGeo, pulseMat);

    // ── Vertical spike line ─────────────────────────────────────────────
    const spikePoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, radiusScene * 0.6, 0),
    ];
    const spikeGeo = new THREE.BufferGeometry().setFromPoints(spikePoints);
    const spikeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
    const spike = new THREE.Line(spikeGeo, spikeMat);

    group.add(ring);
    group.add(pulse);
    group.add(spike);

    // Position group at surface point and orient so ring lies flat on sphere
    const surfacePoint = normal.clone().multiplyScalar(EARTH_RADIUS + 5);
    group.position.copy(surfacePoint);

    // Orient the group: local Y = outward normal
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);
    group.quaternion.copy(quaternion);

    group.visible = this.visible;
    this.scene.add(group);
    this.meshes.set(zone.id, { ring, pulse, spike, group });
  }

  update(delta: number): void {
    this.time += delta;

    this.meshes.forEach((meshes, id) => {
      const zone = this.zones.get(id);
      if (!zone) return;

      // Pulse the outer ring scale
      const pulseScale = 1.0 + 0.15 * Math.sin(this.time * 2.5);
      meshes.pulse.scale.setScalar(pulseScale);

      // Fade opacity of pulse
      const pulseOpacity = 0.15 + 0.2 * (0.5 + 0.5 * Math.sin(this.time * 2.5));
      (meshes.pulse.material as THREE.MeshBasicMaterial).opacity = pulseOpacity;

      // Flicker inner ring for critical severity
      if (zone.severity === "critical") {
        const flicker = 0.5 + 0.5 * Math.abs(Math.sin(this.time * 8));
        (meshes.ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + flicker * 0.4;
      }

      // Slowly rotate the ring around the normal axis for visual interest
      meshes.ring.rotation.y += delta * 0.3;
    });
  }

  getZoneCount(): number {
    return this.zones.size;
  }

  getZones(): InterferenceZone[] {
    return Array.from(this.zones.values());
  }
}

// ─── Pre-defined Canadian interference zone data ─────────────────────────────
// These represent known/simulated GPS interference and jamming hotspots

export const CANADA_INTERFERENCE_ZONES: InterferenceZone[] = [
  {
    id: "CAN-JAM-001",
    lat: 55.1736,
    lng: -118.8025,
    radiusNm: 80,
    type: "gps",
    severity: "high",
    label: "Grande Prairie GPS Jam",
  },
  {
    id: "CAN-JAM-002",
    lat: 51.1215,
    lng: -114.0076,
    radiusNm: 50,
    type: "spoofing",
    severity: "critical",
    label: "Calgary Spoofing Zone",
  },
  {
    id: "CAN-JAM-003",
    lat: 45.5017,
    lng: -73.5673,
    radiusNm: 60,
    type: "rf",
    severity: "medium",
    label: "Montreal RF Interference",
  },
  {
    id: "CAN-JAM-004",
    lat: 43.6532,
    lng: -79.3832,
    radiusNm: 40,
    type: "jamming",
    severity: "low",
    label: "Toronto RF Noise",
  },
  {
    id: "CAN-JAM-005",
    lat: 49.2827,
    lng: -123.1207,
    radiusNm: 55,
    type: "gps",
    severity: "medium",
    label: "Vancouver GPS Degradation",
  },
  {
    id: "CAN-JAM-006",
    lat: 53.5461,
    lng: -113.4938,
    radiusNm: 45,
    type: "spoofing",
    severity: "high",
    label: "Edmonton Spoofing",
  },
  {
    id: "CAN-JAM-007",
    lat: 58.8003,
    lng: -122.6972,
    radiusNm: 120,
    type: "rf",
    severity: "low",
    label: "Fort Nelson Northern RF",
  },
  {
    id: "CAN-JAM-008",
    lat: 46.8139,
    lng: -71.2082,
    radiusNm: 35,
    type: "jamming",
    severity: "medium",
    label: "Quebec City Jamming",
  },
];
