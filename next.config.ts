import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow knowledge-base document uploads (PDF/DOCX) through server actions.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
