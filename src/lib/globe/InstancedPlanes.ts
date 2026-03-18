import * as THREE from "three";
import { createSVGTexture } from "./Utils";

export class InstancedPlanes {
  private maxCount: number;
  private size: number;
  public instancedMesh: THREE.InstancedMesh | null = null;
  public activeCount = 0;
  private planeTextures: THREE.CanvasTexture[] = [];
  public isParticleRenderer = false;
  private planeTypes: Float32Array;
  public globalScale = 1;
  private planeColors: THREE.Color[] = [
    new THREE.Color(0xe8f5e9),
    new THREE.Color(0xe1f5fe),
    new THREE.Color(0xede7f6),
    new THREE.Color(0xeceff1),
    new THREE.Color(0xfffde7),
    new THREE.Color(0xfff3e0),
    new THREE.Color(0xffebee),
    new THREE.Color(0xfafafa),
  ];

  constructor(maxCount = 35000, size = 100) {
    this.maxCount = maxCount;
    this.size = size;
    this.planeTypes = new Float32Array(maxCount);
    this.createInstancedMesh();
  }

  private createInstancedMesh(): void {
    const geometry = new THREE.PlaneGeometry(this.size, this.size);

    for (let i = 1; i <= 8; i++) {
      const texture = createSVGTexture(`/plane${i}.svg`);
      this.planeTextures.push(texture);
    }

    const material = new THREE.ShaderMaterial({
      uniforms: {
        planeTextures: { value: this.planeTextures },
        planeColors: { value: this.planeColors },
        opacity: { value: 1.0 },
        useColorization: { value: 1.0 },
      },
      vertexShader: `
        attribute float planeType;
        varying vec2 vUv;
        varying float vPlaneType;
        void main() {
          vUv = vec2(uv.x, 1.0 - uv.y);
          vPlaneType = planeType;
          vec3 transformed = position;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D planeTextures[8];
        uniform vec3 planeColors[8];
        uniform float opacity;
        uniform float useColorization;
        varying vec2 vUv;
        varying float vPlaneType;
        void main() {
          int textureIndex = int(vPlaneType);
          vec4 texColor;
          vec3 planeColor;
          if (textureIndex == 0) { texColor = texture2D(planeTextures[0], vUv); planeColor = planeColors[0]; }
          else if (textureIndex == 1) { texColor = texture2D(planeTextures[1], vUv); planeColor = planeColors[1]; }
          else if (textureIndex == 2) { texColor = texture2D(planeTextures[2], vUv); planeColor = planeColors[2]; }
          else if (textureIndex == 3) { texColor = texture2D(planeTextures[3], vUv); planeColor = planeColors[3]; }
          else if (textureIndex == 4) { texColor = texture2D(planeTextures[4], vUv); planeColor = planeColors[4]; }
          else if (textureIndex == 5) { texColor = texture2D(planeTextures[5], vUv); planeColor = planeColors[5]; }
          else if (textureIndex == 6) { texColor = texture2D(planeTextures[6], vUv); planeColor = planeColors[6]; }
          else { texColor = texture2D(planeTextures[7], vUv); planeColor = planeColors[7]; }
          vec3 finalColor = mix(vec3(1.0, 1.0, 1.0), planeColor, useColorization);
          gl_FragColor = vec4(finalColor, texColor.a * opacity);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });

    this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.maxCount);
    geometry.setAttribute("planeType", new THREE.InstancedBufferAttribute(this.planeTypes, 1));

    const matrix = new THREE.Matrix4();
    matrix.makeScale(0, 0, 0);
    for (let i = 0; i < this.maxCount; i++) {
      this.instancedMesh.setMatrixAt(i, matrix);
      this.planeTypes[i] = Math.floor(Math.random() * 8);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    geometry.attributes.planeType.needsUpdate = true;
  }

  setInstanceTransform(
    instanceId: number,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    scale = 1,
    planeType: number | null = null,
    triggerUpdate = true
  ): void {
    if (instanceId >= this.maxCount || !this.instancedMesh || !this.instancedMesh.visible) return;

    const finalScale = scale * (this.globalScale || 1);
    const matrix = new THREE.Matrix4();
    matrix.compose(position, rotation, new THREE.Vector3(finalScale, finalScale, finalScale));
    this.instancedMesh.setMatrixAt(instanceId, matrix);

    if (triggerUpdate) this.instancedMesh.instanceMatrix.needsUpdate = true;

    if (planeType !== null) {
      this.planeTypes[instanceId] = Math.max(0, Math.min(7, planeType));
      if (triggerUpdate) this.instancedMesh.geometry.attributes.planeType.needsUpdate = true;
    }
  }

  hideInstance(instanceId: number): void {
    if (instanceId >= this.maxCount || !this.instancedMesh) return;
    const matrix = new THREE.Matrix4();
    matrix.makeScale(0, 0, 0);
    this.instancedMesh.setMatrixAt(instanceId, matrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  setActiveCount(count: number): void {
    this.activeCount = Math.min(count, this.maxCount);
    if (!this.instancedMesh || !this.instancedMesh.visible) return;
    for (let i = 0; i < this.maxCount; i++) {
      if (i >= this.activeCount) {
        this.hideInstance(i);
      } else {
        this.planeTypes[i] = Math.floor(Math.random() * 8);
      }
    }
    if (this.instancedMesh.geometry.attributes.planeType) {
      this.instancedMesh.geometry.attributes.planeType.needsUpdate = true;
    }
  }

  setGlobalScale(scale: number): void {
    this.globalScale = scale;
  }

  setOpacity(opacity: number): void {
    if (this.instancedMesh && (this.instancedMesh.material as THREE.ShaderMaterial).uniforms) {
      (this.instancedMesh.material as THREE.ShaderMaterial).uniforms.opacity.value = opacity;
    }
  }

  setColorization(enabled: boolean): void {
    if (this.instancedMesh && (this.instancedMesh.material as THREE.ShaderMaterial).uniforms) {
      (this.instancedMesh.material as THREE.ShaderMaterial).uniforms.useColorization.value = enabled ? 1.0 : 0.0;
    }
  }

  addToScene(scene: THREE.Scene): void {
    if (this.instancedMesh) scene.add(this.instancedMesh);
  }

  removeFromScene(scene: THREE.Scene): void {
    if (this.instancedMesh) scene.remove(this.instancedMesh);
  }

  getMesh(): THREE.InstancedMesh | null {
    return this.instancedMesh;
  }

  forceMatrixUpdate(): void {
    if (this.instancedMesh) this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  forcePlaneTypeUpdate(): void {
    if (this.instancedMesh?.geometry.attributes.planeType) {
      this.instancedMesh.geometry.attributes.planeType.needsUpdate = true;
    }
  }
}
