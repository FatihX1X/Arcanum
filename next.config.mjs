/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    'pino',
    'pino-pretty',
    'pino-worker',
    'thread-stream',
    'encoding',
    'lokijs',
  ],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
      'thread-stream': false,
      encoding: false,
      lokijs: false,
      bufferutil: false,
      'utf-8-validate': false,
    };
    const extras = ['pino-pretty', 'lokijs', 'encoding', 'thread-stream'];
    if (Array.isArray(config.externals)) {
      config.externals.push(...extras);
    } else if (config.externals) {
      config.externals = [config.externals, ...extras];
    } else {
      config.externals = extras;
    }
    return config;
  },
};

export default nextConfig;
