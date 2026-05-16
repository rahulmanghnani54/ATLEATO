const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

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

module.exports = config;
