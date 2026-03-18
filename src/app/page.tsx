import dynamic from "next/dynamic";

const GlobeViewer = dynamic(() => import("@/components/global/GlobeViewer"), {
  ssr: false,
  loading: () => (
    <div className="w-screen h-screen bg-black flex items-center justify-center">
      <div className="text-blue-400 font-mono text-sm tracking-widest uppercase animate-pulse">
        Loading...
      </div>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="w-screen h-screen bg-black overflow-hidden">
      <GlobeViewer />
    </main>
  );
}
