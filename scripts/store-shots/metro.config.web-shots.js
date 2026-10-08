// Copy to the project root as metro.config.js only while capturing store screenshots, then delete it.
// The web build otherwise fails on native-only ad, purchase and tracking modules.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const stub = path.resolve(__dirname, 'scripts/store-shots/native-web-stub.js');
const nativeOnly = ['react-native-google-mobile-ads', 'react-native-purchases', 'expo-tracking-transparency'];
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && nativeOnly.includes(moduleName)) return { type: 'sourceFile', filePath: stub };
  return (resolve ?? context.resolveRequest)(context, moduleName, platform);
};
module.exports = config;
