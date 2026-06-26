/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const pkg = require('./package.json');

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  reactStrictMode: true,
  // Standalone output is for Docker/production; in dev it can interact oddly with chunk serving.
  ...(isProd ? { output: 'standalone' } : {}),
  experimental: {
    proxyTimeout: 300000, // 5 min for streaming (MJPEG, SSE)
  },
  // Turbopack migration: silences conflict error and handles the 'multiple lockfiles' warning.
  // We explicitly set root to '.' (frontend directory) to avoid picking up root-level lockfiles.
  turbopack: {
    root: '.',
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images.pexels.com', pathname: '/**' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
