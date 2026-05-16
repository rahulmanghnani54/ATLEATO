import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';
import * as jpeg from 'jpeg-js';

let initialized = false;

export async function initTf(): Promise<void> {
  if (initialized) return;
  await tf.setBackend('cpu');
  await tf.ready();
  initialized = true;
}

// Pure-JS JPEG decoder — replaces @tensorflow/tfjs-react-native's decodeJpeg.
// Input: Uint8Array of raw JPEG bytes. Output: [height, width, 3] float32 tensor.
export function decodeJpeg(bytes: Uint8Array): tf.Tensor3D {
  const { data, width, height } = jpeg.decode(bytes, { useTArray: true });
  // jpeg-js returns RGBA (4 channels); strip alpha to get RGB.
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j]     = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return tf.tensor3d(rgb, [height, width, 3], 'int32') as tf.Tensor3D;
}

export { tf };
