import * as THREE from "three";

export class ParticlePlanes {
  private maxCount: number;
  private earthRadius: number;
  public activeCount = 0;
  public globalScale = 1.0;
  public particleSystem: THREE.Points | null = null;
  public isParticleRenderer = true;
  private flightPositions: Float32Array;
  private flightVelocities: Float32Array;
  private flightAges: Float32Array;
  private flightLifespans: Float32Array;
  private flightColors: Float32Array;
  private flightSeeds: Float32Array;
  private clock: THREE.Clock;

  constructor(maxCount = 35000, earthRadius = 3000) {
    this.maxCount = maxCount;
    this.earthRadius = earthRadius;
    this.flightPositions = new Float32Array(maxCount * 3);
    this.flightVelocities = new Float32Array(maxCount * 3);
    this.flightAges = new Float32Array(maxCount);
    this.flightLifespans = new Float32Array(maxCount);
    this.flightColors = new Float32Array(maxCount * 3);
    this.flightSeeds = new Float32Array(maxCount * 4);
    this.clock = new THREE.Clock();
    this.createParticleSystem();
  }

  private createParticleSystem(): void {
    const geometry = new THREE.BufferGeometry();

    for (let i = 0; i < this.maxCount; i++) {
      this.flightPositions[i * 3] = 0;
      this.flightPositions[i * 3 + 1] = 0;
      this.flightPositions[i * 3 + 2] = 0;
      this.flightVelocities[i * 3] = 0;
      this.flightVelocities[i * 3 + 1] = 0;
      this.flightVelocities[i * 3 + 2] = 0;
      this.flightAges[i] = 0;
      this.flightLifespans[i] = 10 + Math.random() * 10;
      this.flightColors[i * 3] = 1.0;
      this.flightColors[i * 3 + 1] = 1.0;
      this.flightColors[i * 3 + 2] = 1.0;
      for (let j = 0; j < 4; j++) this.flightSeeds[i * 4 + j] = Math.random();
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(this.flightPositions, 3));
    geometry.setAttribute("velocity", new THREE.BufferAttribute(this.flightVelocities, 3));
    geometry.setAttribute("age", new THREE.BufferAttribute(this.flightAges, 1));
    geometry.setAttribute("lifespan", new THREE.BufferAttribute(this.flightLifespans, 1));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.flightColors, 3));
    geometry.setAttribute("seed", new THREE.BufferAttribute(this.flightSeeds, 4));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        delta: { value: 0 },
        earthRadius: { value: this.earthRadius },
        globalScale: { value: this.globalScale },
        useColorization: { value: 1.0 },
      },
      vertexShader: `
        attribute vec3 velocity;
        attribute float age;
        attribute float lifespan;
        attribute vec4 seed;
        attribute vec3 color;
        uniform float time;
        uniform float delta;
        uniform float earthRadius;
        uniform float globalScale;
        varying float vAge;
        varying float vLifespan;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vAge = age;
          vLifespan = lifespan;
          vColor = color;
          vec3 pos = position;
          float distanceFromCenter = length(pos);
          if (distanceFromCenter < 0.1) {
            gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
            gl_PointSize = 0.0;
            vAlpha = 0.0;
            return;
          }
          float lifeRatio = vAge / vLifespan;
          vAlpha = 1.0 - smoothstep(0.7, 1.0, lifeRatio);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          float distance = length(mvPosition.xyz);
          gl_PointSize = (120.0 * globalScale) / distance;
          gl_PointSize = max(gl_PointSize, 1.0 * globalScale);
          gl_PointSize = min(gl_PointSize, 50.0 * globalScale);
        }
      `,
      fragmentShader: `
        uniform float useColorization;
        varying float vAge;
        varying float vLifespan;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          if (vAlpha <= 0.0) discard;
          vec2 cxy = 2.0 * gl_PointCoord - 1.0;
          float r = dot(cxy, cxy);
          if (r > 1.0) discard;
          float alpha = 1.0 - smoothstep(0.5, 1.0, r);
          alpha *= vAlpha;
          vec3 finalColor = mix(vec3(1.0), vColor, useColorization);
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particleSystem = new THREE.Points(geometry, material);
  }

  setParticleTransform(particleId: number, position: THREE.Vector3, velocity: THREE.Vector3, color: THREE.Color | null = null): void {
    if (particleId >= this.maxCount || !this.particleSystem) return;

    this.flightPositions[particleId * 3] = position.x;
    this.flightPositions[particleId * 3 + 1] = position.y;
    this.flightPositions[particleId * 3 + 2] = position.z;
    this.flightVelocities[particleId * 3] = velocity.x;
    this.flightVelocities[particleId * 3 + 1] = velocity.y;
    this.flightVelocities[particleId * 3 + 2] = velocity.z;
    this.flightAges[particleId] = 0;

    if (color) {
      this.flightColors[particleId * 3] = color.r;
      this.flightColors[particleId * 3 + 1] = color.g;
      this.flightColors[particleId * 3 + 2] = color.b;
    }

    this.particleSystem.geometry.attributes.position.needsUpdate = true;
    this.particleSystem.geometry.attributes.velocity.needsUpdate = true;
    this.particleSystem.geometry.attributes.age.needsUpdate = true;
    this.particleSystem.geometry.attributes.color.needsUpdate = true;
  }

  hideParticle(particleId: number): void {
    if (particleId >= this.maxCount || !this.particleSystem) return;
    this.flightPositions[particleId * 3] = 0;
    this.flightPositions[particleId * 3 + 1] = 0;
    this.flightPositions[particleId * 3 + 2] = 0;
    this.particleSystem.geometry.attributes.position.needsUpdate = true;
  }

  setActiveCount(count: number): void {
    this.activeCount = Math.min(count, this.maxCount);
    for (let i = this.activeCount; i < this.maxCount; i++) this.hideParticle(i);
  }

  setGlobalScale(scale: number): void {
    this.globalScale = scale;
    if (this.particleSystem && (this.particleSystem.material as THREE.ShaderMaterial).uniforms) {
      (this.particleSystem.material as THREE.ShaderMaterial).uniforms.globalScale.value = scale;
    }
  }

  setColorization(enabled: boolean): void {
    if (this.particleSystem && (this.particleSystem.material as THREE.ShaderMaterial).uniforms) {
      (this.particleSystem.material as THREE.ShaderMaterial).uniforms.useColorization.value = enabled ? 1.0 : 0.0;
    }
  }

  update(delta: number): void {
    if (!this.particleSystem || !this.particleSystem.visible) return;
    const elapsedTime = this.clock.getElapsedTime();
    const mat = this.particleSystem.material as THREE.ShaderMaterial;
    mat.uniforms.delta.value = delta;
    mat.uniforms.time.value = elapsedTime;
    for (let i = 0; i < this.activeCount; i++) this.flightAges[i] += delta;
    this.particleSystem.geometry.attributes.age.needsUpdate = true;
  }

  addToScene(scene: THREE.Scene): void {
    if (this.particleSystem) scene.add(this.particleSystem);
  }

  removeFromScene(scene: THREE.Scene): void {
    if (this.particleSystem) scene.remove(this.particleSystem);
  }

  getMesh(): THREE.Points | null {
    return this.particleSystem;
  }

  dispose(): void {
    this.particleSystem?.geometry.dispose();
    (this.particleSystem?.material as THREE.ShaderMaterial)?.dispose();
  }
}
