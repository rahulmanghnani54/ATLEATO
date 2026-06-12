/**
 * Universal web stub for native-only modules (notifee, react-native-maps,
 * vision-camera, callkeep, fast-tflite, worklets-core).
 *
 * Used by metro.config.js resolveRequest when platform === 'web' so the
 * Expo web preview can boot without native modules. Every property access
 * returns a callable that:
 *   - works as a React component (returns null → renders nothing)
 *   - works as an async fn (returns a resolved value of null)
 *   - works for nested access (notifee.android.foo, MapView.Marker, etc.)
 *
 * NOT for production web — only so the rest of the app is testable in a
 * browser. Native screens render empty where these components appear.
 */

function makeStub(name) {
  // The callable: usable as component, function, or constructor.
  const fn = function StubComponent() { return null; };
  fn.displayName = `WebStub(${name})`;

  return new Proxy(fn, {
    get(target, prop) {
      // Honor real function internals so React/Metro introspection works
      if (prop === '$$typeof' || prop === 'prototype' || prop === 'name' ||
          prop === 'displayName' || prop === 'length' || prop === 'call' ||
          prop === 'apply' || prop === 'bind') {
        return target[prop];
      }
      // Promise-detection guards: never look thenable
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
      if (prop === '__esModule') return true;
      if (prop === 'default') return makeStub(`${name}.default`);
      if (typeof prop === 'symbol') return target[prop];
      // Any other property: another stub (nested access keeps working)
      return makeStub(`${name}.${String(prop)}`);
    },
    apply() { return null; },
    construct() { return {}; },
  });
}

module.exports = makeStub('native-web-stub');
