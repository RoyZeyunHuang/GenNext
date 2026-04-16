/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, canvas: false };
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "photos.zillowstatic.com" },
      { protocol: "https", hostname: "img.streeteasy.com" },
      { protocol: "https", hostname: "s3.amazonaws.com" },
    ],
  },
};

export default nextConfig;
