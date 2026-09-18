#!/usr/bin/env bash
# RELEASE AAB build for a Play Console upload (Android App Bundle).
#
# Sibling of build-evulto-js.sh, which produces an APK for adb sideloading.
# Play requires an upload-key-signed .aab, so this runs :app:bundleRelease
# (not assembleRelease) and signs with the EVULTO_UPLOAD_* config in build.gradle.
#
# Must run under WSL2 Linux, never native Windows (Windows AGP drops
# react-native-screens' anim/ resources -> ScreenStack crash). Launch DETACHED
# from PowerShell so the PowerShell tool's 10-min cap can't kill a 20-50 min
# build, and so it survives the launching shell tearing down:
#
#   wsl -d Ubuntu -- bash -c "setsid nohup bash /mnt/d/Dev/fitai-pro-app/scripts/build-evulto-aab.sh >/dev/null 2>&1 < /dev/null & disown"
#
# Then poll build-evulto.log for AAB_EXIT= / '--- aab ---'.
set -u

export JAVA_HOME=/home/rahul_coder/jdk17
export ANDROID_HOME=/home/rahul_coder/android-sdk
export PATH=/home/rahul_coder/node20/bin:$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/usr/bin:/bin
export EXPO_PUBLIC_ENABLE_HEALTH=1
export GRADLE_USER_HOME=/mnt/d/dev/.gradle
export NODE_OPTIONS=--max-old-space-size=6144

PROJ=/mnt/d/Dev/fitai-pro-app
LOG=$PROJ/build-evulto.log
AABDIR=$PROJ/android/app/build/outputs/bundle/release

: > "$LOG"
echo "node=$(node --version 2>&1)" >> "$LOG"
echo "java=$("$JAVA_HOME/bin/java" -version 2>&1 | head -1)" >> "$LOG"

# Fresh JS bundle + wipe the incremental packager state (a killed build can
# leave it lying about the artifact it wrote last time; seen 2026-09-16).
rm -rf "$PROJ/android/app/build/generated/assets/createBundleReleaseJsAndAssets" \
       "$PROJ/android/app/build/generated/res/createBundleReleaseJsAndAssets" \
       "$PROJ/android/app/build/intermediates/incremental/packageRelease" \
       "$AABDIR" >> "$LOG" 2>&1

cd "$PROJ/android" || { echo "CD_FAILED" >> "$LOG"; exit 1; }

# arm64 only: gradle.properties now defaults to all four ABIs for store builds
# (EAS), and the four-way C++ compile does not fit in WSL's memory. A local
# bundle is for inspection, not upload — the EAS artifact is what ships.
bash ./gradlew bundleRelease --no-daemon \
  -PreactNativeArchitectures=arm64-v8a \
  -PEVULTO_UPLOAD_STORE_FILE=/mnt/d/Dev/keystores/evulto-upload.jks >> "$LOG" 2>&1
echo "AAB_EXIT=$?" >> "$LOG"

# Exit code alone has printed 0 over a BUILD FAILED before — grep the log too.
echo "--- verdict ---" >> "$LOG"
grep -E "BUILD SUCCESSFUL|BUILD FAILED" "$LOG" | tail -3 >> "$LOG"
echo "--- aab ---" >> "$LOG"
ls -la "$AABDIR" >> "$LOG" 2>&1
