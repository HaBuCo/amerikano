// Kart tanıma modeli (assets/models/*.tflite) uygulamaya varlık olarak paketlenir.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflite');

module.exports = config;
