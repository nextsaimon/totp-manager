import withPWA from "next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  turbopack: {},
};

const config = withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
})(nextConfig);

config.webpack = undefined;

export default config;
