package com.madsales.atleato

import android.content.ComponentName
import android.content.pm.PackageManager
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/**
 * AppIcon — switches the launcher icon to the active coach's color by flipping
 * which MainActivity* activity-alias is enabled (see AndroidManifest.xml).
 *
 * DONT_KILL_APP keeps the app alive during the flip; launchers refresh the icon
 * within seconds. State persists across reboots and app updates.
 *
 * JS: NativeModules.AppIcon.setIcon('Default'|'Arnold'|'Nippard'|'CtFletcher'|'DrMike')
 */
class AppIconModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppIcon"

  private val aliases = listOf("Default", "Arnold", "Nippard", "CtFletcher", "DrMike")

  @ReactMethod
  fun setIcon(name: String, promise: Promise) {
    try {
      if (!aliases.contains(name)) {
        promise.reject("bad_alias", "Unknown icon alias: $name")
        return
      }
      val pm = reactApplicationContext.packageManager
      val pkg = reactApplicationContext.packageName
      // ENABLE the target FIRST so there is never an instant with zero enabled
      // launcher aliases — otherwise Android can drop the app from the launcher
      // and the icon simply won't repaint.
      val target = ComponentName(pkg, "$pkg.MainActivity$name")
      pm.setComponentEnabledSetting(
        target, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP,
      )
      // THEN disable every other alias.
      for (alias in aliases) {
        if (alias == name) continue
        val component = ComponentName(pkg, "$pkg.MainActivity$alias")
        pm.setComponentEnabledSetting(
          component, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP,
        )
      }
      promise.resolve(name)
    } catch (e: Exception) {
      promise.reject("icon_error", e.message, e)
    }
  }

  @ReactMethod
  fun getIcon(promise: Promise) {
    try {
      val pm = reactApplicationContext.packageManager
      val pkg = reactApplicationContext.packageName
      for (alias in aliases) {
        val component = ComponentName(pkg, "$pkg.MainActivity$alias")
        val state = pm.getComponentEnabledSetting(component)
        val enabled = state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
          (alias == "Default" && state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT)
        if (enabled) { promise.resolve(alias); return }
      }
      promise.resolve("Default")
    } catch (e: Exception) {
      promise.reject("icon_error", e.message, e)
    }
  }
}

class AppIconPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(AppIconModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
