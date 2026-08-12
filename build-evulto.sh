#!/usr/bin/env bash
# WSL release-APK build for Evulto. Invoked as: wsl -- bash /mnt/d/Dev/fitai-pro-app/build-evulto.sh
# Paths live inside the script so Git Bash / MSYS can't mangle the colon-separated PATH.
set -e
export JAVA_HOME=/home/rahul_coder/jdk17
export ANDROID_HOME=/home/rahul_coder/android-sdk
export PATH=/home/rahul_coder/node20/bin:$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/usr/bin:/bin
# NOTE: do NOT set NODE_OPTIONS max-old-space here. Letting node balloon to 4GB
# raised HOST memory pressure and Windows killed the whole WSL VM mid-Metro
# (fresh systemd boot, no Linux OOM record). The successful build used defaults.
# Also: run builds ALONE — not concurrently with agent fleets / other heavy work.

LOG=/mnt/d/Dev/fitai-pro-app/build-evulto.log
set +e   # capture gradle's exit code ourselves instead of aborting on it
{
  echo "node=$(node --version)  java=$(java -version 2>&1 | head -1)"
  cd /mnt/d/Dev/fitai-pro-app/android
  bash ./gradlew assembleRelease --no-daemon --console=plain
  echo "===BUILD_DONE exit=$? ==="
} > "$LOG" 2>&1
