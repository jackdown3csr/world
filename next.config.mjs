/** @type {import('next').NextConfig} */
const nextConfig = {
  // three.js is ESM — Next handles it, but keep this for safety
  transpilePackages: ["three"],
};

export default nextConfig;
