import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';

let initialized = false;

export async function initTf(): Promise<void> {
  if (initialized) return;
  await tf.setBackend('cpu');
  await tf.ready();
  initialized = true;
}

export { tf };
