import * as THREE from "three";
import type { Earth } from "./Earth";
import type { InstancedPlanes } from "./InstancedPlanes";
import type { ParticlePlanes } from "./ParticlePlanes";
import type { MergedFlightPaths } from "./MergedFlightPaths";
import type { FlightData } from "./Data";

export type PlaneRenderer = InstancedPlanes | ParticlePlanes;

export class Flight {
  private flightOptions: FlightData;
  private departure: FlightData["departure"];
  private arrival: FlightData["arrival"];
  private origin: THREE.Vector3;
  private destination: THREE.Vector3;
  private earth: Earth;
  private planeRenderer: PlaneRenderer;
  public instanceId: number;
  private mergedFlightPaths: MergedFlightPaths | null;
  private curve: THREE.CatmullRomCurve3 | null = null;
  private progress = 0;
  private speed: number;
  private duration = 0;
  private waitTime = 5;
  private isWaiting = false;
  private waitTimer = 0;

  constructor(
    flightOptions: FlightData,
    earth: Earth,
    planeRenderer: PlaneRenderer,
    instanceId: number,
    mergedFlightPaths: MergedFlightPaths | null
  ) {
    this.flightOptions = flightOptions;
    this.departure = flightOptions.departure;
    this.arrival = flightOptions.arrival;
    this.origin = earth.latLngToVector3(this.departure.lat, this.departure.lng);
    this.destination = earth.latLngToVector3(this.arrival.lat, this.arrival.lng);
    this.earth = earth;
    this.planeRenderer = planeRenderer;
    this.instanceId = instanceId;
    this.mergedFlightPaths = mergedFlightPaths;
    this.speed = flightOptions.speed || 500;
    this.createFlightPath();
  }

  private createFlightPath(): void {
    const surfaceOffset = 5;
    const maxCruiseAltitude = 200;
    const minCruiseAltitude = 15;

    const startSurface = this.origin.clone().normalize().multiplyScalar(this.earth.getRadius() + surfaceOffset);
    const endSurface = this.destination.clone().normalize().multiplyScalar(this.earth.getRadius() + surfaceOffset);

    const distance = startSurface.distanceTo(endSurface);
    const maxDistance = this.earth.getRadius() * Math.PI;
    const distanceRatio = Math.min(distance / (maxDistance * 0.3), 1);
    const cruiseAltitude = minCruiseAltitude + (maxCruiseAltitude - minCruiseAltitude) * Math.pow(distanceRatio, 0.7);

    const climbPoint1 = startSurface.clone().lerp(endSurface, 0.2).normalize().multiplyScalar(this.earth.getRadius() + cruiseAltitude * 0.4);
    const climbPoint2 = startSurface.clone().lerp(endSurface, 0.35).normalize().multiplyScalar(this.earth.getRadius() + cruiseAltitude * 0.75);
    const cruisePeak = startSurface.clone().lerp(endSurface, 0.5).normalize().multiplyScalar(this.earth.getRadius() + cruiseAltitude * 0.85);
    const descentPoint1 = startSurface.clone().lerp(endSurface, 0.65).normalize().multiplyScalar(this.earth.getRadius() + cruiseAltitude * 0.75);
    const descentPoint2 = startSurface.clone().lerp(endSurface, 0.8).normalize().multiplyScalar(this.earth.getRadius() + cruiseAltitude * 0.4);

    this.curve = new THREE.CatmullRomCurve3([startSurface, climbPoint1, climbPoint2, cruisePeak, descentPoint1, descentPoint2, endSurface]);

    if (this.mergedFlightPaths) {
      this.mergedFlightPaths.addFlightPath(this.instanceId, this.curve, this.flightOptions);
    }

    this.calculateDuration();
  }

  private calculateDuration(): void {
    if (!this.curve) return;
    const pathLength = this.curve.getLength();
    this.duration = pathLength / this.speed;
  }

  update(deltaTime: number): void {
    if (!this.curve) return;

    if (this.isWaiting) {
      this.waitTimer += deltaTime;
      if (this.waitTimer >= this.waitTime) {
        this.swapRoute();
        this.isWaiting = false;
        this.waitTimer = 0;
        this.progress = 0;
      } else {
        const position = this.curve.getPointAt(1);
        const tangent = this.curve.getTangentAt(1).normalize();
        const normal = position.clone().normalize();
        this.updatePlane(position, tangent, normal);
      }
      return;
    }

    this.progress += deltaTime / this.duration;
    if (this.progress >= 1) {
      this.progress = 1;
      this.isWaiting = true;
      this.waitTimer = 0;
    }

    const position = this.curve.getPointAt(this.progress);
    const tangent = this.curve.getTangentAt(this.progress).normalize();
    const normal = position.clone().normalize();
    this.updatePlane(position, tangent, normal);
  }

  private updatePlane(position: THREE.Vector3, tangent: THREE.Vector3, normal: THREE.Vector3): void {
    if (!this.planeRenderer || this.instanceId === undefined) return;

    const planeMesh = this.planeRenderer.getMesh();
    if (!planeMesh || !planeMesh.visible) return;

    const planeOffset = 8;
    const liftedPosition = position.clone().add(normal.clone().multiplyScalar(planeOffset));

    if ((this.planeRenderer as { isParticleRenderer?: boolean }).isParticleRenderer) {
      const velocity = tangent.clone().multiplyScalar(50);
      const longitude = Math.atan2(position.z, position.x);
      const normalizedLng = (longitude + Math.PI) / (2 * Math.PI);
      const color = new THREE.Color().setHSL(normalizedLng, 0.8, 0.6);
      (this.planeRenderer as import("./ParticlePlanes").ParticlePlanes).setParticleTransform(this.instanceId, liftedPosition, velocity, color);
    } else {
      const up = new THREE.Vector3().crossVectors(normal, tangent).normalize();
      const quaternion = new THREE.Quaternion();
      const matrix = new THREE.Matrix4();
      matrix.lookAt(new THREE.Vector3(0, 0, 0), tangent, up);
      quaternion.setFromRotationMatrix(matrix);

      const additionalRotation = new THREE.Quaternion();
      additionalRotation.setFromEuler(new THREE.Euler(-Math.PI / 2, Math.PI / 2, 0));
      quaternion.multiply(additionalRotation);

      const planeType = this.instanceId % 8;
      (this.planeRenderer as import("./InstancedPlanes").InstancedPlanes).setInstanceTransform(
        this.instanceId,
        liftedPosition,
        quaternion,
        1,
        planeType,
        false
      );
    }
  }

  private swapRoute(): void {
    const tempDeparture = this.departure;
    this.departure = this.arrival;
    this.arrival = tempDeparture;
    this.origin = this.earth.latLngToVector3(this.departure.lat, this.departure.lng);
    this.destination = this.earth.latLngToVector3(this.arrival.lat, this.arrival.lng);
    this.createFlightPath();
  }

  setPlaneRenderer(newRenderer: PlaneRenderer): void {
    this.planeRenderer = newRenderer;
  }

  getProgress(): number {
    return this.progress;
  }

  getInstanceId(): number {
    return this.instanceId;
  }
}
