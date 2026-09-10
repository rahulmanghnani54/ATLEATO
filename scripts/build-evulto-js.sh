#!/usr/bin/env bash
# Incremental RELEASE build for a JS-only change (no full clean).
#
# Must run under WSL2 Linux, never native Windows: Windows AGP drops
# react-native-screens' anim/ resources and the app crashes on first
# ScreenStack mount. Invoke from PowerShell (NOT the Bash tool, which is
# Git Bash/MSYS and mangles /mnt/... arguments):
#
#   wsl -d Ubuntu -- bash /mnt/d/Dev/fitai-pro-app/scripts/build-evulto-js.sh
#
# Signing: GRADLE_USER_HOME points at the Windows gradle home so the
# EVULTO_UPLOAD_* passwords are read from there and never appear here. Only
# the store PATH is overridden, because the stored value is a Windows path
# that gradle-on-Linux cannot resolve.
set -u

export JAVA_HOME=/home/rahul_coder/jdk17
export ANDROID_HOME=/home/rahul_coder/android-sdk
export PATH=/home/rahul_coder/node20/bin:$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/usr/bin:/bin
export EXPO_PUBLIC_ENABLE_HEALTH=1
export GRADLE_USER_HOME=/mnt/d/dev/.gradle

# Metro needs more heap than Node gives it by default. Bundling this app is
# ~4,500 modules and it died twice at 95.6% of createBundleReleaseJsAndAssets
# with NO error in the log — the signature of the bundler process being killed
# rather than failing. The box has 7.6GB free, so the ceiling was Node's own
# old-space limit, not the system.
export NODE_OPTIONS=--max-old-space-size=6144

PROJ=/mnt/d/Dev/fitai-pro-app
LOG=$PROJ/build-evulto.log
APKDIR=$PROJ/android/app/build/outputs/apk/release

: > "$LOG"
echo "node=$(node --version 2>&1)" >> "$LOG"
echo "java=$("$JAVA_HOME/bin/java" -version 2>&1 | head -1)" >> "$LOG"

# Force a fresh JS bundle without the ~45min full clean. Killing a build can
# otherwise leave the bundle task UP-TO-DATE and package STALE JavaScript.
rm -rf "$PROJ/android/app/build/generated/assets/createBundleReleaseJsAndAssets" \
       "$PROJ/android/app/build/generated/res/createBundleReleaseJsAndAssets" \
       "$APKDIR" >> "$LOG" 2>&1

cd "$PROJ/android" || { echo "CD_FAILED" >> "$LOG"; exit 1; }

bash ./gradlew assembleRelease --no-daemon \
  -PEVULTO_UPLOAD_STORE_FILE=/mnt/d/Dev/keystores/evulto-upload.jks >> "$LOG" 2>&1
echo "GRADLE_EXIT=$?" >> "$LOG"

# GRADLE_EXIT alone lies (it has printed 0 over a BUILD FAILED). Grep the log.
echo "--- verdict ---" >> "$LOG"
grep -E "BUILD SUCCESSFUL|BUILD FAILED" "$LOG" | tail -3 >> "$LOG"
echo "--- apk ---" >> "$LOG"
ls -la "$APKDIR" >> "$LOG" 2>&1
