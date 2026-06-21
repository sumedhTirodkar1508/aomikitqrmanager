import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Application-level limit is 10 MB for Excel, 5 MB for images/CSV. Set
      // the framework limit to 12 MB to account for multipart/form-data encoding
      // overhead (base64 + boundary bytes). The action guards run before upload.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
