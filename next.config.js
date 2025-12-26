/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployments
  output: 'standalone',
  
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth', 'tesseract.js', 'sharp']
  },
  
  // Image optimization
  images: {
    unoptimized: true // Disable for Docker/static deployments
  },
  
  webpack: (config, { isServer }) => {
    // Handle canvas and encoding issues
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    
    // Handle node modules that need special treatment
    if (isServer) {
      config.externals.push({
        'sharp': 'commonjs sharp',
        'pdf-parse': 'commonjs pdf-parse',
        'tesseract.js': 'commonjs tesseract.js',
        'mammoth': 'commonjs mammoth',
        'pdf2pic': 'commonjs pdf2pic',
        'pdf-poppler': 'commonjs pdf-poppler'
      });
    }
    
    // Handle canvas and other native modules
    config.externals = config.externals || [];
    config.externals.push({
      canvas: 'canvas',
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil'
    });
    
    return config;
  },
  
  // Headers for CORS and security
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
}

module.exports = nextConfig