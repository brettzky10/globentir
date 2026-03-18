import { NextRequest, NextResponse } from "next/server";
import type { ADSBaircraft } from "@/app/api/adsb/route";

export interface PollSnapshot {
  fetchedAt: number;
  lat: number;
  lng: number;
  radiusNm: number;
  aircraft: AircraftPosition[];
}

export interface AircraftPosition {
  hex: string;
  callsign: string;
  lat: number;
  lng: number;
  altFt: number;       // feet
  speedKts: number;    // knots ground speed
  trackDeg: number;    // heading degrees
  vertRate: number;    // feet per minute
  type: string;        // aircraft type code
  reg: string;         // registration
  category: string;    // ADS-B category
  squawk: string;
  emergency: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat  = searchParams.get("lat");
  const lng  = searchParams.get("lng");
  const dist = searchParams.get("dist") ?? "50";

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "RAPIDAPI_KEY not configured" }, { status: 500 });
  }

  const url = `https://adsbexchange-com1.p.rapidapi.com/v2/lat/${lat}/lon/${lng}/dist/${dist}/`;

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

    const data = await res.json();
    const raw: ADSBaircraft[] = data.ac ?? [];

    // Normalise to a clean, typed snapshot
    const aircraft: AircraftPosition[] = raw
      .filter((ac) => ac.lat != null && ac.lon != null)
      .map((ac) => ({
        hex:      ac.hex ?? "",
        callsign: (ac.flight ?? ac.hex ?? "").trim(),
        lat:      ac.lat!,
        lng:      ac.lon!,
        altFt:    typeof ac.alt_baro === "number" ? ac.alt_baro : (ac.alt_geom ?? 0),
        speedKts: ac.gs ?? 0,
        trackDeg: ac.track ?? 0,
        vertRate: ac.baro_rate ?? 0,
        type:     ac.t ?? "",
        reg:      ac.r ?? "",
        category: ac.category ?? "",
        squawk:   ac.squawk ?? "",
        emergency: ac.emergency ?? "none",
      }));

    const snapshot: PollSnapshot = {
      fetchedAt: Date.now(),
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      radiusNm: parseFloat(dist),
      aircraft,
    };

    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("ADS-B poll error:", err);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
