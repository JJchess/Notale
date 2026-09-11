import type {NextConfig} from 'next';
const config:NextConfig={
  distDir:process.env.NEXT_DIST_DIR??'.next',
  poweredByHeader:false,
  webpack(config){
    config.resolve.extensionAlias={...config.resolve.extensionAlias,'.js':['.ts','.tsx','.js']};
    return config;
  },
};
export default config;
