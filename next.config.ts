import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
// Replace <repository-name> with your GitHub repository name
const repoName = 'screen-wize';

const nextConfig: NextConfig = {
  output: 'export',
  // Add basePath and assetPrefix if deploying to subdirectory
  basePath: isProd ? `/${repoName}` : '',
  assetPrefix: isProd ? `/${repoName}/` : '',
  // Indicate that images should be unoptimized for `next export`
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
