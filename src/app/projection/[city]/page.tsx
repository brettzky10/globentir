
'use client'


import dynamic from "next/dynamic";

const ProjectionViewer = dynamic(
  () => import("@/components/global/ProjectionViewer"),
  {
    ssr: false,
    loading: () => (
      <div className="w-screen h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-full"
            style={{
              border: "2px solid rgba(0,229,255,0.1)",
              borderTopColor: "#00e5ff",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span
            className="text-xs tracking-[0.35em] uppercase"
            style={{ color: "rgba(0,229,255,0.5)", fontFamily: "monospace" }}
          >
            Loading Projection
          </span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    ),
  }
);

interface PageProps {
  params: { city: string };
  searchParams: { lat?: string; lng?: string; name?: string };
}

export default function ProjectionPage({ params, searchParams }: PageProps) {
  const citySlug   = decodeURIComponent(params.city);
  const lat        = searchParams.lat  ? parseFloat(searchParams.lat)  : null;
  const lng        = searchParams.lng  ? parseFloat(searchParams.lng)  : null;
  const displayName = searchParams.name
    ? decodeURIComponent(searchParams.name)
    : citySlug;

  return (
    <main className="w-screen h-screen bg-black overflow-hidden">
      <ProjectionViewer
        citySlug={citySlug}
        displayName={displayName}
        initialLat={lat}
        initialLng={lng}
      />
    </main>
  );
}