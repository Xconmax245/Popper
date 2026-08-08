import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white flex flex-col items-center justify-center font-['Inter',sans-serif]">
      <h2 className="text-3xl font-bold mb-4">404 - Not Found</h2>
      <p className="text-[#8B949E] mb-6">Could not find the requested run or page.</p>
      <Link href="/" className="px-4 py-2 bg-[#21262D] rounded hover:bg-[#30363D] transition-colors">
        Return Home
      </Link>
    </div>
  );
}
