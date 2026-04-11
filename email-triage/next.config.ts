import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright uses child_process.spawn and native Node APIs that break when bundled by Turbopack
  serverExternalPackages: ['playwright', 'twilio'],
};

export default nextConfig;
