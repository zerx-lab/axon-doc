/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",
  // Include bcryptjs in standalone output for password verification
  serverExternalPackages: ["bcryptjs"],
};

export default nextConfig;
