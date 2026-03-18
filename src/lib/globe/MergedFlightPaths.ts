import * as THREE from "three";
import type { FlightData } from "./Data";

export class MergedFlightPaths {
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;
  public mesh: THREE.LineSegments | null = null;
  private positions: Float32Array | null = null;
  private colors: Float32Array | null = null;
  private maxFlights = 0;
  private currentFlightCount = 0;
  private readonly pointsPerPath = 100;
  private curvesVisible = true;
  private needsPositionUpdate = false;
  private needsColorUpdate = false;

  constructor() {
    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      vertexColors: true,
    });
  }

  initialize(maxFlights: number): void {
    this.maxFlights = maxFlights;
    const totalPoints = maxFlights * (this.pointsPerPath + 1);
    this.positions = new Float32Array(totalPoints * 3);
    this.colors = new Float32Array(totalPoints * 3);
    this.positions.fill(0);
    this.colors.fill(0);

    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.mesh = new THREE.LineSegments(this.geometry, this.material);
    this.geometry.setDrawRange(0, 0);
  }

  addFlightPath(flightIndex: number, curve: THREE.CatmullRomCurve3, flightData: FlightData): void {
    if (flightIndex >= this.maxFlights || !this.curvesVisible || !this.positions || !this.colors) return;

    const pointOffset = flightIndex * (this.pointsPerPath + 1);
    const positionOffset = pointOffset * 3;
    const colorOffset = pointOffset * 3;

    const points = curve.getPoints(this.pointsPerPath);
    const originLng = flightData?.departure.lng ?? 0;
    const hue = ((originLng + 180) % 360) / 360;
    const baseColor = new THREE.Color();

    for (let i = 0; i < points.length; i++) {
      const bufferIndex = positionOffset + i * 3;
      this.positions[bufferIndex] = points[i].x;
      this.positions[bufferIndex + 1] = points[i].y;
      this.positions[bufferIndex + 2] = points[i].z;

      const progress = i / (points.length - 1);
      const lightness = 0.3 + progress * 0.4;
      baseColor.setHSL(hue, 1.0, lightness);
      const colorIndex = colorOffset + i * 3;
      this.colors[colorIndex] = baseColor.r;
      this.colors[colorIndex + 1] = baseColor.g;
      this.colors[colorIndex + 2] = baseColor.b;
    }

    if (points.length > 0) {
      const lastPoint = points[points.length - 1];
      const breakIndex = positionOffset + this.pointsPerPath * 3;
      this.positions[breakIndex] = lastPoint.x;
      this.positions[breakIndex + 1] = lastPoint.y;
      this.positions[breakIndex + 2] = lastPoint.z;
      baseColor.setHSL(hue, 1.0, 0.7);
      const breakColorIndex = colorOffset + this.pointsPerPath * 3;
      this.colors[breakColorIndex] = baseColor.r;
      this.colors[breakColorIndex + 1] = baseColor.g;
      this.colors[breakColorIndex + 2] = baseColor.b;
    }

    this.needsPositionUpdate = true;
    this.needsColorUpdate = true;
  }

  setVisibleFlightCount(count: number): void {
    this.currentFlightCount = Math.min(count, this.maxFlights);
    const visiblePoints = this.curvesVisible ? this.currentFlightCount * (this.pointsPerPath + 1) : 0;
    this.geometry.setDrawRange(0, visiblePoints);
  }

  setCurvesVisible(visible: boolean): void {
    this.curvesVisible = visible;
    const visiblePoints = this.curvesVisible ? this.currentFlightCount * (this.pointsPerPath + 1) : 0;
    this.geometry.setDrawRange(0, visiblePoints);
  }

  getCurvesVisible(): boolean {
    return this.curvesVisible;
  }

  addToScene(scene: THREE.Scene): void {
    if (this.mesh) scene.add(this.mesh);
  }

  removeFromScene(scene: THREE.Scene): void {
    if (this.mesh) scene.remove(this.mesh);
  }

  setOpacity(opacity: number): void {
    this.material.opacity = opacity;
  }

  getMesh(): THREE.LineSegments | null {
    return this.mesh;
  }

  applyBatchedUpdates(): void {
    if (this.needsPositionUpdate) {
      this.geometry.attributes.position.needsUpdate = true;
      this.needsPositionUpdate = false;
    }
    if (this.needsColorUpdate) {
      this.geometry.attributes.color.needsUpdate = true;
      this.needsColorUpdate = false;
    }
  }
}
