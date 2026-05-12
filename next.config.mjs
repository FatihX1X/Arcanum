/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      // MetaMask SDK React Native dependency (browser-only)
      '@react-native-async-storage/async-storage': false,
      // WalletConnect optional logger (not needed in browser)
      'pino-pretty': false,
    };
    return config;
  },
};

export default nextConfig;
