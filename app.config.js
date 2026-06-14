// Dynamic Expo config — read at build time so we can inject secrets
// (like the Google Maps Android API key) from EAS environment variables
// instead of committing them to git.
//
// app.json is the static base; this file extends it with values that
// depend on the build environment.
const base = require('./app.json');

module.exports = ({ config }) => {
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  const expo = { ...base.expo };

  // Inject the Maps SDK for Android key into android.config.googleMaps.apiKey
  // so MapView (react-native-maps) can render real tiles. Without this the
  // territory screen falls back to the "Map view needs setup" placeholder.
  if (mapsKey) {
    expo.android = {
      ...expo.android,
      config: {
        ...(expo.android?.config ?? {}),
        googleMaps: { apiKey: mapsKey },
      },
    };
  }

  return { ...config, ...expo };
};
