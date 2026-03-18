import { NextRequest, NextResponse } from "next/server";

export interface ADSBaircraft {
  hex: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  alt_geom?: number;
  gs?: number;       // ground speed knots
  track?: number;    // true track degrees
  baro_rate?: number;
  squawk?: string;
  emergency?: string;
  category?: string;
  nav_altitude_mcp?: number;
  nav_heading?: number;
  nic?: number;
  rc?: number;
  seen?: number;
  rssi?: number;
  t?: string;        // aircraft type
  r?: string;        // registration
  desc?: string;     // description
}

export interface ADSBResponse {
  ac: ADSBaircraft[];
  msg: string;
  now: number;
  total: number;
  ctime: number;
  ptime: number;
}

export interface ADSBSnapshot {
  fetchedAt: number;   // unix ms timestamp when fetched
  lat: number;
  lon: number;
  distNm: number;
  aircraft: ADSBaircraft[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const dist = searchParams.get("dist") ?? "100";

  if (!lat || !lon) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "RAPIDAPI_KEY not configured" }, { status: 500 });
  }

  const url = `https://adsbexchange-com1.p.rapidapi.com/v2/lat/${lat}/lon/${lon}/dist/${dist}/`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-host": "adsbexchange-com1.p.rapidapi.com",
        "x-rapidapi-key": apiKey,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `ADS-B API error ${res.status}`, detail: text },
        { status: res.status }
      );
    }

    const data: ADSBResponse = await res.json();

    // Build a snapshot with timestamp
    const snapshot: ADSBSnapshot = {
      fetchedAt: Date.now(),
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      distNm: parseFloat(dist),
      aircraft: data.ac ?? [],
    };

    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("ADS-B fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch ADS-B data" }, { status: 500 });
  }
}
