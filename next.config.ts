import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Application-level limit is 5 MB. Set the framework limit to 6 MB to
      // account for multipart/form-data encoding overhead (base64 + boundary
      // bytes). The 5 MB guard in the action runs before storage upload.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
