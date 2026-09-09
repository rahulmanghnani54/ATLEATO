#!/usr/bin/env bash
# Configuration-phase only: parses every .gradle file, configures :app, and
# exercises the bundleRelease upload guard WITHOUT building anything.
# Catches Groovy syntax errors (which break EVERY task) in ~1 min, not 2h.
set -u
export JAVA_HOME=/home/rahul_coder/jdk17
export ANDROID_HOME=/home/rahul_coder/android-sdk
export PATH=/home/rahul_coder/node20/bin:$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/usr/bin:/bin
export GRADLE_USER_HOME=/mnt/d/dev/.gradle
PROJ=/mnt/d/Dev/fitai-pro-app
LOG=$PROJ/android/build/gradle-config-check.log
mkdir -p "$PROJ/android/build"
: > "$LOG"
cd "$PROJ/android" || exit 1
bash ./gradlew bundleRelease --dry-run --no-daemon \
  -PEVULTO_UPLOAD_STORE_FILE=/mnt/d/Dev/keystores/evulto-upload.jks >> "$LOG" 2>&1
echo "EXIT=$?" >> "$LOG"
