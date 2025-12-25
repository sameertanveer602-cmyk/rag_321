/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth', 'tesseract.js']
  },
  // Optimize build process
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },
  // Skip static optimization for API routes during build
  trailingSlash: false,
  webpack: (config, { isServer }) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    
    // Prevent build-time issues with certain modules
    if (isServer) {
      config.externals.push('sharp', 'pdf-poppler');
    }
    
    return config;
  }
}

module.exports = nextConfig