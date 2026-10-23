package com.stokeformfitness.app;

import android.content.Intent;
import android.health.connect.HealthConnectManager;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Daily step counts from Health Connect, read-only (the "Steps" permission and nothing else). Health Connect is part
 * of Android 14 and later; on older phones the plugin reports it isn't available and the app keeps typed steps.
 */
@CapacitorPlugin(
    name = "HealthSteps",
    permissions = {@Permission(strings = {"android.permission.health.READ_STEPS"}, alias = "steps")})
public class HealthStepsPlugin extends Plugin {
  private static final int MIN_SDK = 34;

  private boolean available() {
    return Build.VERSION.SDK_INT >= MIN_SDK && HealthConnectSteps.available(getContext());
  }

  private boolean granted() {
    return getPermissionState("steps") == PermissionState.GRANTED;
  }

  private JSObject status() {
    boolean available = available();
    JSObject status = new JSObject();
    status.put("available", available);
    status.put("granted", available && granted());
    return status;
  }

  /** { available, granted }. */
  @PluginMethod
  public void status(PluginCall call) {
    call.resolve(status());
  }

  /** Asks for the Steps permission (the system's own Health Connect dialog); resolves with the new status. */
  @PluginMethod
  public void requestPermission(PluginCall call) {
    if (!available() || granted()) {
      call.resolve(status());
      return;
    }
    requestPermissionForAlias("steps", call, "permissionResult");
  }

  @PermissionCallback
  private void permissionResult(PluginCall call) {
    call.resolve(status());
  }

  /** { days: [{ date: "yyyy-MM-dd", steps }] } for the last `days` days (1 to 30; default 7), today first. */
  @PluginMethod
  public void readSteps(PluginCall call) {
    if (!available() || !granted()) {
      call.reject("not-connected");
      return;
    }
    int requested = call.getInt("days", 7);
    final int days = Math.max(1, Math.min(30, requested));
    new Thread(
            () -> {
              try {
                JSArray out = HealthConnectSteps.readDays(getContext(), days);
                JSObject result = new JSObject();
                result.put("days", out);
                call.resolve(result);
              } catch (Exception e) {
                // No details: nothing about the person's data goes into an error message.
                call.reject("read-failed");
              }
            })
        .start();
  }

  /** Opens this app's page in Health Connect's permission settings (where a refused permission can be given). */
  @PluginMethod
  public void openSettings(PluginCall call) {
    if (!available()) {
      call.reject("not-available");
      return;
    }
    try {
      Intent intent = new Intent(HealthConnectManager.ACTION_MANAGE_HEALTH_PERMISSIONS);
      intent.putExtra(Intent.EXTRA_PACKAGE_NAME, getContext().getPackageName());
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(intent);
      call.resolve();
    } catch (Exception e) {
      call.reject("cannot-open");
    }
  }
}
