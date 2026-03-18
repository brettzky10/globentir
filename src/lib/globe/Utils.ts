import * as THREE from "three";

export function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((-lng + 180) * Math.PI) / 180;
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const rotatedX = z;
  const rotatedY = y;
  const rotatedZ = -x;
  return new THREE.Vector3(rotatedX, rotatedY, rotatedZ);
}

export function getRandomPointOnSphere(radius: number): THREE.Vector3 {
  const phi = Math.random() * Math.PI * 2;
  const theta = Math.random() * Math.PI;
  const x = radius * Math.sin(theta) * Math.cos(phi);
  const y = radius * Math.sin(theta) * Math.sin(phi);
  const z = radius * Math.cos(theta);
  return new THREE.Vector3(x, y, z);
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function createSVGTexture(svgPath: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = 256;
  canvas.height = 256;

  fetch(svgPath)
    .then((response) => response.text())
    .then((svgText) => {
      const img = new Image();
      const blob = new Blob([svgText], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        texture.needsUpdate = true;
      };
      img.src = url;
    })
    .catch(() => {
      // Draw a simple plane shape as fallback
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.moveTo(128, 20);
      ctx.lineTo(148, 80);
      ctx.lineTo(220, 100);
      ctx.lineTo(148, 120);
      ctx.lineTo(148, 180);
      ctx.lineTo(168, 200);
      ctx.lineTo(88, 200);
      ctx.lineTo(108, 180);
      ctx.lineTo(108, 120);
      ctx.lineTo(36, 100);
      ctx.lineTo(108, 80);
      ctx.closePath();
      ctx.fill();
      texture.needsUpdate = true;
    });

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  return texture;
}

export interface SunPosition {
  lat: number;
  lng: number;
}

export function getSunPosition(simulatedTimeHours: number | null = null): SunPosition {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const utcDate = new Date(utc);
  const start = new Date(utcDate.getFullYear(), 0, 1);
  const diff = utcDate.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  const declination = 23.45 * Math.sin(degreesToRadians((360 / 365.25) * (dayOfYear - 81)));

  let timeDecimal: number;
  if (simulatedTimeHours !== null) {
    timeDecimal = simulatedTimeHours;
  } else {
    const hours = utcDate.getUTCHours();
    const minutes = utcDate.getUTCMinutes();
    const seconds = utcDate.getUTCSeconds();
    timeDecimal = hours + minutes / 60 + seconds / 3600;
  }

  const longitude = (12 - timeDecimal) * 15;
  let normalizedLongitude = longitude;
  while (normalizedLongitude > 180) normalizedLongitude -= 360;
  while (normalizedLongitude < -180) normalizedLongitude += 360;

  return { lat: declination, lng: normalizedLongitude };
}

export function getSunVector3(radius = 3000, simulatedTimeHours: number | null = null): THREE.Vector3 {
  const sunPos = getSunPosition(simulatedTimeHours);
  return latLngToVector3(sunPos.lat, sunPos.lng, radius * 3);
}

export function getCurrentUtcTimeHours(): number {
  const now = new Date();
  return now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
}

export function hoursToTimeString(hours: number): string {
  const h = Math.floor(hours);
  const remainingMinutes = (hours - h) * 60;
  const m = Math.floor(remainingMinutes);
  const s = Math.floor((remainingMinutes - m) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function timeStringToHours(timeString: string): number {
  const parts = timeString.split(":").map(Number);
  return (parts[0] || 0) + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600;
}

export function animateCameraToPosition(
  camera: THREE.Camera,
  startPosition: THREE.Vector3,
  targetPosition: THREE.Vector3,
  duration = 2000,
  delay = 0
): void {
  const animateCamera = () => {
    const startTime = Date.now();
    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(startPosition, targetPosition, easeProgress);
      camera.lookAt(0, 0, 0);
      if (progress < 1) requestAnimationFrame(animate);
    }
    animate();
  };

  if (delay > 0) {
    setTimeout(animateCamera, delay);
  } else {
    animateCamera();
  }
}

export function vector3ToLatLng(position: THREE.Vector3, radius: number): { lat: number; lng: number } {
  const x = -position.z;
  const y = position.y;
  const z = position.x;
  const normalizedPosition = new THREE.Vector3(x, y, z).normalize().multiplyScalar(radius);
  const phi = Math.acos(clamp(normalizedPosition.y / radius, -1, 1));
  const theta = Math.atan2(normalizedPosition.z, normalizedPosition.x);
  const lat = 90 - (phi * 180) / Math.PI;
  const lng = ((theta * 180) / Math.PI + 180) % 360 - 180;
  return { lat, lng };
}
