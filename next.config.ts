import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  reactStrictMode: true,
  // Every device is picked from the home page now.
  async redirects() {
    return [{ source: "/hardware", destination: "/", permanent: false }];
  },
};

export default config;
