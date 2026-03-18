import * as THREE from "three";
import { Atmosphere } from "./Atmosphere";
import { latLngToVector3, getRandomPointOnSphere } from "./Utils";

export class Earth {
  private radius: number;
  public mesh: THREE.Mesh | null = null;
  public atmosphere: Atmosphere;
  private onTextureLoaded: (() => void) | null;

  constructor(radius = 3000, onTextureLoaded: (() => void) | null = null) {
    this.radius = radius;
    this.atmosphere = new Atmosphere(radius);
    this.onTextureLoaded = onTextureLoaded;
    this.createEarth();
  }

  private createEarth(): void {
    const geometry = new THREE.SphereGeometry(this.radius, 64, 32);
    const textureLoader = new THREE.TextureLoader();
    const worldTexture = textureLoader.load(
      "/world.topo.jpg",
      () => {
        if (this.onTextureLoaded) this.onTextureLoaded();
      },
      undefined,
      (error) => {
        console.error("Error loading Earth texture:", error);
        if (this.onTextureLoaded) this.onTextureLoaded();
      }
    );

    worldTexture.wrapS = THREE.RepeatWrapping;
    worldTexture.wrapT = THREE.ClampToEdgeWrapping;
    worldTexture.minFilter = THREE.LinearFilter;
    worldTexture.magFilter = THREE.LinearFilter;
    worldTexture.flipY = true;

    const material = new THREE.MeshPhongMaterial({ map: worldTexture, shininess: 10 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.y = -Math.PI / 2;
  }

  addToScene(scene: THREE.Scene): void {
    if (this.mesh) scene.add(this.mesh);
    this.atmosphere.addToScene(scene);
  }

  getRandomPointOnSurface(): THREE.Vector3 {
    return getRandomPointOnSphere(this.radius);
  }

  getRadius(): number {
    return this.radius;
  }

  latLngToVector3(lat: number, lng: number): THREE.Vector3 {
    return latLngToVector3(lat, lng, this.radius);
  }
}
