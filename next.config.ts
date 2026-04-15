import type { NextConfig } from "next";

// Load Node.js 25+ Web Storage compatibility fix
require('./node-compat.cjs');

const nextConfig: NextConfig = {
  devIndicators: false,
};

export default nextConfig;
