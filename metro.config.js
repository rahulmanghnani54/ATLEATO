const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .tflite model files as assets
config.resolver.assetExts.push('tflite');

const stub = path.resolve(__dirname, 'stubs/mediapipe-stub.js');

// @tensorflow-models/pose-detection bundles every backend (BlazePose, PoseNet,
// MediaPipe) even though we only use MoveNet on the CPU backend.
// Stub out every browser/GPU/native package that isn't available in RN.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,

  // MediaPipe — BlazePose only
  '@mediapipe/pose': stub,
  '@mediapipe/selfie_segmentation': stub,
  '@mediapipe/hands': stub,
  '@mediapipe/face_mesh': stub,
  '@mediapipe/face_detection': stub,
  '@mediapipe/holistic': stub,

  // TF backends not available in React Native
  '@tensorflow/tfjs-backend-webgpu': stub,
  '@tensorflow/tfjs-backend-webgl': stub,
  '@tensorflow/tfjs-backend-wasm': stub,

  // TFLite — not used, not installed
  '@tensorflow/tfjs-tflite': stub,

  // Browser-only canvas API used in some TF packages
  'canvas': stub,

  // Node.js built-ins that some TF packages reference but RN doesn't need
  'worker_threads': stub,
  'perf_hooks': stub,
};

// ── Web-only: stub out native-only modules so `expo start --web` can boot ──
// These packages have no web implementation and crash the web bundle at
// import time. The stub returns a universal no-op Proxy (see the file).
// Android/iOS bundles are untouched (platform check below).
const nativeWebStub = path.resolve(__dirname, 'stubs/native-web-stub.js');
const WEB_NATIVE_STUBS = [
  '@notifee/react-native',
  'react-native-maps',
  'react-native-vision-camera',
  'react-native-fast-tflite',
  'react-native-callkeep',
  'vision-camera-resize-plugin',
  'react-native-worklets-core',
];
const prevResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    WEB_NATIVE_STUBS.some((m) => moduleName === m || moduleName.startsWith(m + '/'))
  ) {
    return { type: 'sourceFile', filePath: nativeWebStub };
  }
  if (prevResolveRequest) return prevResolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
