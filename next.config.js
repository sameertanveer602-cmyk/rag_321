/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimized configuration for Vercel deployment
  experimental: {
    // Only include essential external packages
    serverComponentsExternalPackages: ['sharp']
  },
  webpack: (config, { isServer, dev }) => {
    // Essential aliases
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    
    // Externalize problematic modules during server build
    if (isServer && !dev) {
      config.externals = config.externals || [];
      config.externals.push({
        'pdf-parse': 'commonjs pdf-parse',
        'mammoth': 'commonjs mammoth',
        'tesseract.js': 'commonjs tesseract.js',
        'pdf2pic': 'commonjs pdf2pic',
        'pdf-poppler': 'commonjs pdf-poppler',
        'jszip': 'commonjs jszip'
      });
    }
    
    return config;
  }
}

module.exports = nextConfig