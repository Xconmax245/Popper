/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow cross-origin requests from ar5iv and arXiv for paper fetching
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
        ],
      },
    ];
  },
  // Increase the body size limit for paper ingestion
  experimental: {
    // pdf-parse must stay external — it lazy-loads native/optional deps and
    // reads a bundled test PDF from its own package dir if bundled, which
    // breaks under Next's server bundler.
    serverComponentsExternalPackages: ['d3-force', 'pdf-parse'],
  },
};

export default nextConfig;
