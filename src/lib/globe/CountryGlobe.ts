import * as THREE from "three";
import { latLngToVector3 } from "./Utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeoFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

export interface CountryInfo {
  iso: string;
  name: string;
  feature: GeoFeature;
  centroid: { lat: number; lng: number };
}

// Country centroid lookup (computed from GeoJSON polygon centroids)
export const COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number; name: string }> = {
  "AF": { lat: 33.8564, lng: 66.0867, name: "Afghanistan" },
  "AO": { lat: -12.2916, lng: 17.5029, name: "Angola" },
  "AL": { lat: 41.1414, lng: 20.0324, name: "Albania" },
  "AE": { lat: 23.8686, lng: 54.2067, name: "United Arab Emirates" },
  "AR": { lat: -35.2202, lng: -65.1495, name: "Argentina" },
  "AM": { lat: 40.2166, lng: 45.0003, name: "Armenia" },
  "AU": { lat: -25.5608, lng: 134.3761, name: "Australia" },
  "AT": { lat: 47.6139, lng: 14.0762, name: "Austria" },
  "AZ": { lat: 40.2805, lng: 47.6806, name: "Azerbaijan" },
  "BI": { lat: -3.3774, lng: 29.9139, name: "Burundi" },
  "BE": { lat: 50.6524, lng: 4.5808, name: "Belgium" },
  "BJ": { lat: 9.6474, lng: 2.3374, name: "Benin" },
  "BF": { lat: 12.3117, lng: -1.7765, name: "Burkina Faso" },
  "BD": { lat: 23.8395, lng: 90.2679, name: "Bangladesh" },
  "BG": { lat: 42.7531, lng: 25.1951, name: "Bulgaria" },
  "BA": { lat: 44.1808, lng: 17.8169, name: "Bosnia and Herzegovina" },
  "BY": { lat: 53.5063, lng: 27.9814, name: "Belarus" },
  "BZ": { lat: 17.1971, lng: -88.7034, name: "Belize" },
  "BO": { lat: -16.729, lng: -64.6414, name: "Bolivia" },
  "BR": { lat: -10.8068, lng: -53.0543, name: "Brazil" },
  "BN": { lat: 4.6903, lng: 114.9151, name: "Brunei" },
  "BT": { lat: 27.428, lng: 90.4724, name: "Bhutan" },
  "BW": { lat: -22.0997, lng: 23.7731, name: "Botswana" },
  "CF": { lat: 6.5428, lng: 20.3743, name: "Central African Republic" },
  "CA": { lat: 57.7488, lng: -101.5698, name: "Canada" },
  "CH": { lat: 46.7917, lng: 8.1183, name: "Switzerland" },
  "CL": { lat: -37.3418, lng: -71.6709, name: "Chile" },
  "CN": { lat: 36.6094, lng: 103.8654, name: "China" },
  "CI": { lat: 7.5538, lng: -5.612, name: "Ivory Coast" },
  "CM": { lat: 5.6631, lng: 12.6116, name: "Cameroon" },
  "CD": { lat: -2.8503, lng: 23.583, name: "Dem. Rep. Congo" },
  "CG": { lat: -0.8378, lng: 15.1345, name: "Rep. Congo" },
  "CO": { lat: 3.9272, lng: -73.0777, name: "Colombia" },
  "CR": { lat: 9.9657, lng: -84.1754, name: "Costa Rica" },
  "CU": { lat: 21.6318, lng: -78.9607, name: "Cuba" },
  "CY": { lat: 34.9071, lng: 33.0396, name: "Cyprus" },
  "CZ": { lat: 49.7752, lng: 15.3346, name: "Czechia" },
  "DE": { lat: 51.1337, lng: 10.2885, name: "Germany" },
  "DJ": { lat: 11.773, lng: 42.498, name: "Djibouti" },
  "DK": { lat: 56.2196, lng: 9.3108, name: "Denmark" },
  "DO": { lat: 18.8845, lng: -70.4624, name: "Dominican Republic" },
  "DZ": { lat: 28.1855, lng: 2.598, name: "Algeria" },
  "EC": { lat: -1.4548, lng: -78.3842, name: "Ecuador" },
  "EG": { lat: 26.5066, lng: 29.8445, name: "Egypt" },
  "ER": { lat: 15.4273, lng: 38.6782, name: "Eritrea" },
  "ES": { lat: 40.3487, lng: -3.617, name: "Spain" },
  "EE": { lat: 58.6437, lng: 25.8247, name: "Estonia" },
  "ET": { lat: 8.654, lng: 39.5513, name: "Ethiopia" },
  "FI": { lat: 64.5041, lng: 26.2118, name: "Finland" },
  "FJ": { lat: -17.8309, lng: 177.9971, name: "Fiji" },
  "GA": { lat: -0.647, lng: 11.6878, name: "Gabon" },
  "GB": { lat: 53.8834, lng: -2.658, name: "United Kingdom" },
  "GE": { lat: 42.162, lng: 43.4815, name: "Georgia" },
  "GH": { lat: 7.9287, lng: -1.237, name: "Ghana" },
  "GN": { lat: 10.4483, lng: -11.0609, name: "Guinea" },
  "GM": { lat: 13.4753, lng: -15.4319, name: "Gambia" },
  "GW": { lat: 12.0227, lng: -15.1106, name: "Guinea-Bissau" },
  "GQ": { lat: 1.6459, lng: 10.366, name: "Equatorial Guinea" },
  "GR": { lat: 39.3417, lng: 22.5639, name: "Greece" },
  "GL": { lat: 74.7705, lng: -41.5002, name: "Greenland" },
  "GT": { lat: 15.6994, lng: -90.3695, name: "Guatemala" },
  "GY": { lat: 4.7902, lng: -58.9712, name: "Guyana" },
  "HN": { lat: 14.8229, lng: -86.59, name: "Honduras" },
  "HR": { lat: 45.0162, lng: 16.5662, name: "Croatia" },
  "HT": { lat: 18.9007, lng: -72.658, name: "Haiti" },
  "HU": { lat: 47.2, lng: 19.3576, name: "Hungary" },
  "ID": { lat: -0.2543, lng: 114.0227, name: "Indonesia" },
  "IN": { lat: 22.925, lng: 79.5937, name: "India" },
  "IE": { lat: 53.1806, lng: -8.0102, name: "Ireland" },
  "IR": { lat: 32.5189, lng: 54.2855, name: "Iran" },
  "IQ": { lat: 33.0368, lng: 43.7569, name: "Iraq" },
  "IS": { lat: 65.0743, lng: -18.761, name: "Iceland" },
  "IL": { lat: 31.4849, lng: 35.0039, name: "Israel" },
  "IT": { lat: 43.4725, lng: 12.2195, name: "Italy" },
  "JM": { lat: 18.1376, lng: -77.3243, name: "Jamaica" },
  "JO": { lat: 31.2455, lng: 36.7795, name: "Jordan" },
  "JP": { lat: 36.0191, lng: 136.8819, name: "Japan" },
  "KZ": { lat: 48.1917, lng: 67.2846, name: "Kazakhstan" },
  "KE": { lat: 0.596, lng: 37.7916, name: "Kenya" },
  "KG": { lat: 41.5069, lng: 74.6204, name: "Kyrgyzstan" },
  "KH": { lat: 12.6847, lng: 104.8761, name: "Cambodia" },
  "KR": { lat: 36.4276, lng: 127.8213, name: "South Korea" },
  "KW": { lat: 29.3073, lng: 47.6001, name: "Kuwait" },
  "LA": { lat: 18.445, lng: 103.7503, name: "Laos" },
  "LB": { lat: 33.9118, lng: 35.871, name: "Lebanon" },
  "LR": { lat: 6.4316, lng: -9.4108, name: "Liberia" },
  "LY": { lat: 26.9975, lng: 17.9744, name: "Libya" },
  "LK": { lat: 7.7005, lng: 80.6672, name: "Sri Lanka" },
  "LS": { lat: -29.6253, lng: 28.1701, name: "Lesotho" },
  "LT": { lat: 55.2843, lng: 23.8806, name: "Lithuania" },
  "LU": { lat: 49.7657, lng: 5.9652, name: "Luxembourg" },
  "LV": { lat: 56.8072, lng: 24.8333, name: "Latvia" },
  "MA": { lat: 29.8854, lng: -8.4205, name: "Morocco" },
  "MD": { lat: 47.2037, lng: 28.4105, name: "Moldova" },
  "MG": { lat: -19.3561, lng: 46.6912, name: "Madagascar" },
  "MX": { lat: 23.9354, lng: -102.5763, name: "Mexico" },
  "MK": { lat: 41.6059, lng: 21.6979, name: "Macedonia" },
  "ML": { lat: 17.2678, lng: -3.5433, name: "Mali" },
  "MM": { lat: 21.017, lng: 96.5058, name: "Myanmar" },
  "ME": { lat: 42.789, lng: 19.2862, name: "Montenegro" },
  "MN": { lat: 46.8237, lng: 102.9464, name: "Mongolia" },
  "MZ": { lat: -17.2304, lng: 35.4726, name: "Mozambique" },
  "MR": { lat: 20.2093, lng: -10.3264, name: "Mauritania" },
  "MW": { lat: -13.1728, lng: 34.1936, name: "Malawi" },
  "MY": { lat: 3.5481, lng: 114.6755, name: "Malaysia" },
  "NA": { lat: -22.0998, lng: 17.1562, name: "Namibia" },
  "NE": { lat: 17.3456, lng: 9.3244, name: "Niger" },
  "NG": { lat: 9.5483, lng: 7.9951, name: "Nigeria" },
  "NI": { lat: 12.8482, lng: -85.0203, name: "Nicaragua" },
  "NL": { lat: 52.2987, lng: 5.5122, name: "Netherlands" },
  "NO": { lat: 64.5365, lng: 14.2448, name: "Norway" },
  "NP": { lat: 28.2394, lng: 84.0132, name: "Nepal" },
  "NZ": { lat: -43.9858, lng: 170.513, name: "New Zealand" },
  "OM": { lat: 20.5811, lng: 56.0976, name: "Oman" },
  "PK": { lat: 29.9735, lng: 69.414, name: "Pakistan" },
  "PA": { lat: 8.53, lng: -80.1092, name: "Panama" },
  "PE": { lat: -9.1916, lng: -74.3918, name: "Peru" },
  "PH": { lat: 15.7509, lng: 121.5444, name: "Philippines" },
  "PG": { lat: -6.645, lng: 144.3312, name: "Papua New Guinea" },
  "PL": { lat: 52.1483, lng: 19.311, name: "Poland" },
  "KP": { lat: 40.143, lng: 127.165, name: "North Korea" },
  "PT": { lat: 39.634, lng: -8.0558, name: "Portugal" },
  "PY": { lat: -23.248, lng: -58.3874, name: "Paraguay" },
  "QA": { lat: 25.3219, lng: 51.1835, name: "Qatar" },
  "RO": { lat: 45.8571, lng: 24.9433, name: "Romania" },
  "RU": { lat: 61.6926, lng: 99.2165, name: "Russia" },
  "RW": { lat: -2.0135, lng: 29.919, name: "Rwanda" },
  "SA": { lat: 24.1233, lng: 44.5164, name: "Saudi Arabia" },
  "SD": { lat: 15.9906, lng: 29.8626, name: "Sudan" },
  "SS": { lat: 7.2929, lng: 30.1986, name: "South Sudan" },
  "SN": { lat: 14.3541, lng: -14.5098, name: "Senegal" },
  "SL": { lat: 8.5304, lng: -11.7953, name: "Sierra Leone" },
  "SV": { lat: 13.7261, lng: -88.8729, name: "El Salvador" },
  "SO": { lat: 4.7523, lng: 45.7267, name: "Somalia" },
  "RS": { lat: 44.233, lng: 20.8197, name: "Serbia" },
  "SR": { lat: 4.1204, lng: -55.9123, name: "Suriname" },
  "SK": { lat: 48.7267, lng: 19.5077, name: "Slovakia" },
  "SI": { lat: 46.1254, lng: 14.9382, name: "Slovenia" },
  "SE": { lat: 62.8115, lng: 16.5963, name: "Sweden" },
  "SZ": { lat: -26.4899, lng: 31.3953, name: "Swaziland" },
  "SY": { lat: 35.0126, lng: 38.5442, name: "Syria" },
  "TD": { lat: 15.3289, lng: 18.5813, name: "Chad" },
  "TG": { lat: 8.4395, lng: 0.9964, name: "Togo" },
  "TH": { lat: 15.017, lng: 101.0061, name: "Thailand" },
  "TJ": { lat: 38.5831, lng: 71.0344, name: "Tajikistan" },
  "TM": { lat: 39.0912, lng: 59.2754, name: "Turkmenistan" },
  "TT": { lat: 10.4282, lng: -61.3304, name: "Trinidad and Tobago" },
  "TN": { lat: 34.1729, lng: 9.5347, name: "Tunisia" },
  "TR": { lat: 38.9907, lng: 35.3921, name: "Turkey" },
  "TW": { lat: 23.741, lng: 120.9748, name: "Taiwan" },
  "TZ": { lat: -6.2577, lng: 34.753, name: "Tanzania" },
  "UG": { lat: 1.2955, lng: 32.3576, name: "Uganda" },
  "UA": { lat: 49.1488, lng: 31.2291, name: "Ukraine" },
  "UY": { lat: -32.7809, lng: -56.0033, name: "Uruguay" },
  "US": { lat: 39.5016, lng: -99.0602, name: "United States" },
  "UZ": { lat: 41.7486, lng: 63.2036, name: "Uzbekistan" },
  "VE": { lat: 7.1621, lng: -66.1638, name: "Venezuela" },
  "VN": { lat: 16.6579, lng: 106.2858, name: "Vietnam" },
  "YE": { lat: 15.9132, lng: 47.535, name: "Yemen" },
  "ZA": { lat: -28.9621, lng: 25.1174, name: "South Africa" },
  "ZM": { lat: -13.3951, lng: 27.7276, name: "Zambia" },
  "ZW": { lat: -18.907, lng: 29.7885, name: "Zimbabwe" },
  "FR": { lat: 46.6065, lng: 2.3391, name: "France" },
};

// ─── Earcon radius constants ──────────────────────────────────────────────────
const EARTH_RADIUS = 3000;
const BORDER_RADIUS = EARTH_RADIUS * 1.001;   // borders sit just above surface
const FILL_RADIUS   = EARTH_RADIUS * 1.0005;  // fill slightly below borders

// ─── CountryGlobe class ───────────────────────────────────────────────────────

export class CountryGlobe {
  private scene: THREE.Scene | null = null;
  private features: GeoFeature[] = [];

  // Per-country mesh groups
  private borderLines = new Map<string, THREE.LineSegments>();
  private fillMeshes  = new Map<string, THREE.Mesh>();
  private highlightFills = new Map<string, THREE.Mesh>();

  // Interaction state
  private hoveredIso: string | null = null;
  private selectedIso: string | null = null;
  private visible = true;

  // Callbacks
  private onHoverCb?: (iso: string | null, name: string | null) => void;
  private onClickCb?: (info: CountryInfo) => void;

  // Materials (shared)
  private borderMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  private hoverFillMat = new THREE.MeshBasicMaterial({
    color: 0x5da2ff,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  private selectedFillMat = new THREE.MeshBasicMaterial({
    color: 0x5da2ff,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  private selectedBorderMat = new THREE.LineBasicMaterial({
    color: 0x5da2ff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  setCallbacks(
    onHover: (iso: string | null, name: string | null) => void,
    onClick: (info: CountryInfo) => void
  ) {
    this.onHoverCb = onHover;
    this.onClickCb = onClick;
  }

  addToScene(scene: THREE.Scene) {
    this.scene = scene;
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.borderLines.forEach(m => (m.visible = v));
    this.fillMeshes.forEach(m => (m.visible = false)); // fills only show on hover/select
    this.highlightFills.forEach(m => (m.visible = v && m.userData.active));
  }

  async loadGeoJSON(url: string): Promise<void> {
    const res = await fetch(url);
    const data = await res.json();
    this.features = data.features as GeoFeature[];
    if (this.scene) this.buildMeshes();
  }

  private buildMeshes() {
    if (!this.scene) return;

    for (const feature of this.features) {
      const iso = (feature.properties.ISO_A2 as string) ?? "-99";
      if (iso === "-99") continue; // skip disputed/unmapped

      const geomType = feature.geometry.type;
      const polygons: number[][][][] =
        geomType === "MultiPolygon"
          ? (feature.geometry.coordinates as number[][][][])
          : [(feature.geometry.coordinates as number[][][])];

      // ── Border lines ────────────────────────────────────────────────────────
      const borderPositions: number[] = [];
      for (const poly of polygons) {
        for (const ring of poly) {
          for (let i = 0; i < ring.length - 1; i++) {
            const a = latLngToVector3(ring[i][1], ring[i][0], BORDER_RADIUS);
            const b = latLngToVector3(ring[i + 1][1], ring[i + 1][0], BORDER_RADIUS);
            borderPositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
          }
        }
      }
      const borderGeo = new THREE.BufferGeometry();
      borderGeo.setAttribute("position", new THREE.Float32BufferAttribute(borderPositions, 3));
      const borderLine = new THREE.LineSegments(borderGeo, this.borderMat.clone());
      borderLine.renderOrder = 1;
      borderLine.userData.iso = iso;
      this.scene.add(borderLine);
      this.borderLines.set(iso, borderLine);

      // ── Fill mesh (fan triangulation for each ring) ─────────────────────────
      const fillMesh = this.buildFillMesh(polygons, this.hoverFillMat.clone());
      fillMesh.visible = false;
      fillMesh.userData.iso = iso;
      fillMesh.userData.active = false;
      this.scene.add(fillMesh);
      this.fillMeshes.set(iso, fillMesh);
    }
  }

  private buildFillMesh(polygons: number[][][][], mat: THREE.Material): THREE.Mesh {
    const positions: number[] = [];
    const normals: number[] = [];

    for (const poly of polygons) {
      const outerRing = poly[0];
      if (outerRing.length < 3) continue;

      // Fan triangulation from ring centroid projected onto sphere
      const centroid3D = new THREE.Vector3();
      for (const coord of outerRing) {
        centroid3D.add(latLngToVector3(coord[1], coord[0], FILL_RADIUS));
      }
      centroid3D.divideScalar(outerRing.length);
      centroid3D.normalize().multiplyScalar(FILL_RADIUS);

      for (let i = 0; i < outerRing.length - 1; i++) {
        const a = latLngToVector3(outerRing[i][1], outerRing[i][0], FILL_RADIUS);
        const b = latLngToVector3(outerRing[i + 1][1], outerRing[i + 1][0], FILL_RADIUS);

        positions.push(centroid3D.x, centroid3D.y, centroid3D.z);
        positions.push(a.x, a.y, a.z);
        positions.push(b.x, b.y, b.z);

        // Face normal = outward from sphere centre
        const fn = centroid3D.clone().normalize();
        for (let k = 0; k < 3; k++) normals.push(fn.x, fn.y, fn.z);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal",   new THREE.Float32BufferAttribute(normals, 3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    return mesh;
  }

  // ─── Hover / click ──────────────────────────────────────────────────────────

  handleMouseMove(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer
  ) {
    if (!this.visible) return;
    const iso = this.raycastIso(event.clientX, event.clientY, camera, renderer);

    if (iso !== this.hoveredIso) {
      // Dehighlight previous hover (unless it's selected)
      if (this.hoveredIso && this.hoveredIso !== this.selectedIso) {
        this.setFillActive(this.hoveredIso, false);
        const bm = this.borderLines.get(this.hoveredIso);
        if (bm) (bm.material as THREE.LineBasicMaterial).opacity = 0.18;
      }
      this.hoveredIso = iso;
      // Highlight new hover
      if (iso && iso !== this.selectedIso) {
        this.setFillActive(iso, true, "hover");
        const bm = this.borderLines.get(iso);
        if (bm) (bm.material as THREE.LineBasicMaterial).opacity = 0.7;
      }
      this.onHoverCb?.(iso, iso ? (COUNTRY_CENTROIDS[iso]?.name ?? null) : null);
    }
  }

  handleClick(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer
  ) {
    if (!this.visible) return;
    const iso = this.raycastIso(event.clientX, event.clientY, camera, renderer);
    if (!iso) return;

    const centroid = COUNTRY_CENTROIDS[iso];
    if (!centroid) return;

    // Deselect previous
    if (this.selectedIso && this.selectedIso !== iso) {
      this.setFillActive(this.selectedIso, false);
      const bm = this.borderLines.get(this.selectedIso);
      if (bm) (bm.material as THREE.LineBasicMaterial).opacity = 0.18;
    }

    this.selectedIso = iso;
    this.setFillActive(iso, true, "select");

    const feature = this.features.find(
      (f) => (f.properties.ISO_A2 as string) === iso
    );
    if (feature) {
      this.onClickCb?.({ iso, name: centroid.name, feature, centroid });
    }
  }

  deselectAll() {
    if (this.selectedIso) {
      this.setFillActive(this.selectedIso, false);
      const bm = this.borderLines.get(this.selectedIso);
      if (bm) (bm.material as THREE.LineBasicMaterial).opacity = 0.18;
    }
    if (this.hoveredIso) {
      this.setFillActive(this.hoveredIso, false);
      const bm = this.borderLines.get(this.hoveredIso);
      if (bm) (bm.material as THREE.LineBasicMaterial).opacity = 0.18;
    }
    this.selectedIso = null;
    this.hoveredIso = null;
  }

  private setFillActive(iso: string, active: boolean, mode: "hover" | "select" = "hover") {
    const fill = this.fillMeshes.get(iso);
    if (!fill) return;
    fill.visible = active;
    fill.userData.active = active;
    (fill.material as THREE.MeshBasicMaterial).opacity =
      mode === "select" ? 0.45 : 0.22;
    (fill.material as THREE.MeshBasicMaterial).color.setHex(0x5da2ff);

    const bm = this.borderLines.get(iso);
    if (bm && active) {
      (bm.material as THREE.LineBasicMaterial).color.setHex(0x5da2ff);
      (bm.material as THREE.LineBasicMaterial).opacity = mode === "select" ? 0.95 : 0.7;
    } else if (bm && !active) {
      (bm.material as THREE.LineBasicMaterial).color.setHex(0xffffff);
    }
  }

  // ─── Raycasting against fill meshes ─────────────────────────────────────────

  private raycastIso(
    x: number,
    y: number,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer
  ): string | null {
    if (!this.scene) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndcX = ((x - rect.left) / rect.width)  * 2 - 1;
    const ndcY = -((y - rect.top)  / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

    // Raycast against a high-res sphere — find nearest surface point then
    // check which country fill it lands in by testing fill meshes
    const fillArray = Array.from(this.fillMeshes.values());
    // Temporarily make all fills visible for raycasting
    fillArray.forEach(m => (m.visible = true));
    const hits = raycaster.intersectObjects(fillArray);
    fillArray.forEach(m => (m.visible = m.userData.active));

    if (hits.length === 0) return null;

    // ── Only accept hits on the camera-facing hemisphere ──────────────────
    // The globe is centred at origin, so the outward surface normal at any
    // hit point is simply that point normalised.  If the camera ray and the
    // surface normal point in the same general direction the face is pointing
    // away from us (back side) → reject it.
    const camDir = raycaster.ray.direction;          // unit vec: cam → scene
    const toCam  = camera.position.clone().normalize(); // unit vec: origin → cam

    for (const hit of hits) {
      const surfaceNormal = hit.point.clone().normalize();
      // Back-face check: ray dotted with outward normal > 0 means back face
      if (surfaceNormal.dot(camDir) > 0) continue;
      // Hemisphere check: surface point must be on the camera-facing half
      if (surfaceNormal.dot(toCam) < -0.05) continue;
      return (hit.object.userData.iso as string) ?? null;
    }
    return null;
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  dispose() {
    this.borderLines.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); this.scene?.remove(m); });
    this.fillMeshes.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); this.scene?.remove(m); });
    this.borderLines.clear();
    this.fillMeshes.clear();
  }
}
