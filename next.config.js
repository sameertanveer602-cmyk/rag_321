/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth', 'tesseract.js']
  },
  webpack: (config, { isServer }) => {
    // Handle canvas and encoding issues
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    
    // Handle node modules that need special treatment
    if (isServer) {
      // Remove Sharp externals since we're not using it
      config.externals = config.externals || [];
    }
    
    return config;
  }
}

module.exports = nextConfig