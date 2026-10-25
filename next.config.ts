import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El código se revisa con `npm run typecheck`; el lint no frena la publicación en Vercel.
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};

export default nextConfig;
