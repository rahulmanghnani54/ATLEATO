#!/usr/bin/env bash
# Verify an Evulto release bundle BEFORE uploading it to Play.
#
#   bash scripts/verify-aab.sh path/to/app.aab
#
# Checks, in order of how expensive the mistake is:
#   1. the JAR signature verifies AND the signer is the Play UPLOAD key
#      (SHA-256 of the signer cert == SHA-256 of evulto-upload.jks). A bundle
#      signed with the debug key looks identical in Explorer and is rejected
#      only at the upload dialog.
#   2. the merged manifest does not request READ_MEDIA_IMAGES — the Photo
#      Picker needs no permission and Play's photo/video policy flags it.
#   3. native libs are present for every ABI we ship (gradle.properties
#      reactNativeArchitectures); the first EAS bundle was arm64-only.
#   4. package / versionCode / minSdk / targetSdk, printed for the release notes.
#
# Prints AAB_OK or AAB_FAIL as the last line. Never prints a password.
#
# Environment overrides (defaults match the owner's Windows/Git Bash setup):
#   JBR_BIN     dir containing jarsigner + keytool
#   UPLOAD_JKS  path to the upload keystore
#   GRADLE_PROPS gradle.properties holding EVULTO_UPLOAD_STORE_PASSWORD
set -u
AAB="${1:?usage: verify-aab.sh <app.aab>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
JBR_BIN="${JBR_BIN:-/c/Program Files/Android/Android Studio/jbr/bin}"
UPLOAD_JKS="${UPLOAD_JKS:-/d/Dev/keystores/evulto-upload.jks}"
GRADLE_PROPS="${GRADLE_PROPS:-/d/dev/.gradle/gradle.properties}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fail=0

echo "=== file ==="
ls -la "$AAB"

echo; echo "=== 1. signature ==="
"$JBR_BIN/jarsigner" -verify -verbose:summary "$AAB" > "$WORK/js.txt" 2>&1
grep -E "jar verified|jar is unsigned|SecurityException" "$WORK/js.txt" | head -1
SIGNER_FP="$(unzip -p "$AAB" 'META-INF/*.RSA' 'META-INF/*.DSA' 'META-INF/*.EC' 2>/dev/null \
  | "$JBR_BIN/keytool" -printcert 2>/dev/null | awk '/SHA256:/{print $2; exit}')"
STOREPASS="$(grep -E '^EVULTO_UPLOAD_STORE_PASSWORD=' "$GRADLE_PROPS" | cut -d= -f2- | tr -d '\r')"
UPLOAD_FP="$("$JBR_BIN/keytool" -list -v -keystore "$UPLOAD_JKS" -storepass "$STOREPASS" -alias evulto-upload 2>/dev/null \
  | awk '/SHA256:/{print $2; exit}')"
echo "signer  SHA-256: ${SIGNER_FP:-<none>}"
echo "upload  SHA-256: ${UPLOAD_FP:-<could not read keystore>}"
if grep -q "jar verified" "$WORK/js.txt" && [ -n "$SIGNER_FP" ] && [ "$SIGNER_FP" = "$UPLOAD_FP" ]; then
  echo "SIGNATURE: OK — signed with the upload key"
else
  echo "SIGNATURE: FAIL — not verified or not the upload key"; fail=1
fi

echo; echo "=== 2. manifest ==="
node "$HERE/aab-manifest.js" "$AAB" > "$WORK/manifest.txt" || { echo "manifest decode failed"; fail=1; }
head -2 "$WORK/manifest.txt"
if grep -q 'android.permission.READ_MEDIA_IMAGES' "$WORK/manifest.txt"; then
  echo "READ_MEDIA_IMAGES: PRESENT — Play photo/video policy"; fail=1
else
  echo "READ_MEDIA_IMAGES: absent"
fi
echo "uses-permission count: $(sed -n 's/^(\([0-9]*\) total)$/\1/p' "$WORK/manifest.txt")  (full list: node scripts/aab-manifest.js)"

echo; echo "=== 3. ABIs ==="
WANT="$(sed -n 's/^reactNativeArchitectures=//p' "$HERE/../android/gradle.properties" | tr -d '\r' | tr ',' ' ')"
HAVE="$(unzip -l "$AAB" | awk '{print $4}' | grep -oE '^base/lib/[^/]+/' | sort -u | sed -E 's#base/lib/##; s#/##' | tr '\n' ' ')"
echo "expected: $WANT"
echo "in .aab : $HAVE"
for abi in $WANT; do
  case " $HAVE" in *" $abi "*) ;; *) echo "MISSING ABI: $abi"; fail=1;; esac
done

echo; echo "=== 4. identity ==="
grep -E '^<manifest>|^uses-sdk' "$WORK/manifest.txt"
grep -E '^(allowBackup|debuggable|usesCleartextTraffic)=' "$WORK/manifest.txt"

echo; echo "=== verdict ==="
[ "$fail" -eq 0 ] && echo "AAB_OK" || echo "AAB_FAIL"
exit "$fail"
