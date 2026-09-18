# ─────────────────────────────────────────────────────────────────────────────
# R8 keep rules for Evulto.
#
# WHY THESE EXIST: this app was shipping with minifyEnabled FALSE — the release
# APK carried 6,348 plaintext `com/revenuecat/purchases` strings and no mapping
# file was ever produced. Turning R8 on is the fix, but R8 removes and renames
# anything it cannot see referenced, and this stack is unusually reflection-
# heavy: JSI/native modules, frame processors, and several SDKs that resolve
# classes by name at runtime. Those failures appear only at RUNTIME, and a
# rebuild here costs about two hours, so these rules are deliberately generous.
#
# The obfuscation value is not lost by keeping library names: app code under
# com.madsales.atleato is still renamed, and dead code is still stripped. What
# is kept is the set of names something looks up as a string.
#
# NOTE: android/ is gitignored, so this file is NOT tracked. It exists only on
# the build machine — see the audit note about the native build being
# unreproducible.
# ─────────────────────────────────────────────────────────────────────────────

# ── React Native core: DoNotStrip + JNI entry points ──
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep @com.facebook.proguard.annotations.DoNotStrip class * { *; }
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
-keepclasseswithmembernames class * { native <methods>; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.react.uimanager.** { *; }

# ── Reanimated + worklets (JSI, resolved by name from the JS side) ──
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }
-keep class com.swmansion.rnscreens.** { *; }

# ── Nitro modules + VisionCamera frame processors (margelo) ──
-keep class com.margelo.** { *; }
-keep class com.mrousavy.camera.** { *; }

# ── notifee: full-screen intents and the foreground service are looked up by
#    class name from the manifest and from its own scheduler ──
-keep class app.notifee.** { *; }

# ── RevenueCat: entitlement models are deserialised reflectively ──
-keep class com.revenuecat.purchases.** { *; }

# ── Branch deep links ──
-keep class io.branch.** { *; }

# ── LiveKit / WebRTC (the ElevenLabs voice call path) ──
-keep class org.webrtc.** { *; }
-keep class io.livekit.** { *; }
-keep class livekit.** { *; }

# ── Sentry ──
-keep class io.sentry.** { *; }

# ── Health Connect ──
-keep class androidx.health.** { *; }

# ── TFLite (form coach) ──
-keep class org.tensorflow.** { *; }

# ── Networking used by several SDKs above ──
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**

# ── Reflection + generics need these attributes; SourceFile/LineNumberTable
#    keep stack traces readable once a mapping file is uploaded ──
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
-keepattributes SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile

# ── Expo modules + Kotlin reflection ────────────────────────────────────────
# Added after Google AND Facebook sign-in both began failing on the first
# R8 build, before the browser even opened — i.e. inside signInWithProvider,
# which is expo-linking + expo-web-browser + the supabase storage adapter.
#
# expo-modules-core resolves module definitions through a Kotlin DSL that leans
# on kotlin.Metadata and reflective member lookup. R8 strips that metadata by
# default, and the symptom is a module whose methods simply are not found at
# runtime — no crash, just a rejected promise, which is exactly what we saw.
-keep class expo.modules.** { *; }
-keep class expo.core.** { *; }
-keepclassmembers class * { @expo.modules.core.interfaces.ExpoProp *; }
-keepclassmembers class * { @expo.modules.core.interfaces.ExpoMethod *; }

# Kotlin metadata + reflection, which the Expo DSL depends on.
-keep class kotlin.Metadata { *; }
-keep class kotlin.reflect.** { *; }
-keep class kotlin.jvm.internal.** { *; }
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keepattributes AnnotationDefault
-dontwarn kotlin.**

# Custom Tabs, which expo-web-browser uses to open the OAuth session.
-keep class androidx.browser.customtabs.** { *; }
