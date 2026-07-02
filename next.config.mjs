/** @type {import('next').NextConfig} */
const nextConfig = {
  // No project ESLint config ships in this repo; don't block builds on it.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
