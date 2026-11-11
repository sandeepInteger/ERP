package com.integertel.erp.tracker;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

import java.lang.ref.WeakReference;

/**
 * Bridge between the web app (apps/web/src/lib/tracker.ts) and the native location service.
 *   getCurrentPosition  one accurate reading (check in / check out)
 *   start / stop        location sharing while checked in (foreground service)
 *   drain               readings buffered on the phone, for upload
 *   status              whether sharing is running, and for which visit
 * Emits "location" each time the service takes a reading while the app is alive.
 */
@CapacitorPlugin(
    name = "SiteTracker",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class SiteTrackerPlugin extends Plugin {
    private static final String BLOCKED = "Location is blocked for Integer ERP. Allow location in your phone's settings, then try again.";
    private static WeakReference<SiteTrackerPlugin> instance = new WeakReference<>(null);

    @Override
    public void load() {
        instance = new WeakReference<>(this);
    }

    @Override
    protected void handleOnDestroy() {
        instance.clear();
    }

    /** Called by the service for each reading; reaches the web app only while it is running. */
    static void emit(JSObject point) {
        SiteTrackerPlugin p = instance.get();
        if (p != null) p.notifyListeners("location", point);
    }

    private boolean locationGranted() {
        return getPermissionState("location") == PermissionState.GRANTED;
    }

    // ─── One reading ────────────────────────────────────────────────────────

    @PluginMethod
    public void getCurrentPosition(PluginCall call) {
        if (!locationGranted()) {
            requestPermissionForAlias("location", call, "positionPermissionCallback");
            return;
        }
        readPosition(call);
    }

    @PermissionCallback
    private void positionPermissionCallback(PluginCall call) {
        if (locationGranted()) readPosition(call);
        else call.reject(BLOCKED, "PERMISSION_DENIED");
    }

    private void readPosition(PluginCall call) {
        int timeoutMs = call.getInt("timeoutMs", 20000);
        CancellationTokenSource cts = new CancellationTokenSource();
        new Handler(Looper.getMainLooper()).postDelayed(cts::cancel, timeoutMs + 1000L);
        CurrentLocationRequest request = new CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setMaxUpdateAgeMillis(30_000)
            .setDurationMillis(timeoutMs)
            .build();
        try {
            LocationServices.getFusedLocationProviderClient(getContext())
                .getCurrentLocation(request, cts.getToken())
                .addOnSuccessListener((loc) -> {
                    if (loc == null) {
                        call.reject("Couldn't get your location. Check that location (GPS) is turned on, then try again.", "UNAVAILABLE");
                        return;
                    }
                    JSObject p = SiteTrackerService.toPoint(null, loc);
                    call.resolve(p);
                })
                .addOnFailureListener((e) -> call.reject("Couldn't get your location. Check that location (GPS) is turned on.", "UNAVAILABLE"));
        } catch (SecurityException e) {
            call.reject(BLOCKED, "PERMISSION_DENIED");
        }
    }

    // ─── Sharing while checked in ───────────────────────────────────────────

    @PluginMethod
    public void start(PluginCall call) {
        if (call.getString("visitId") == null) {
            call.reject("visitId is required");
            return;
        }
        if (!locationGranted()) {
            requestPermissionForAlias("location", call, "startLocationCallback");
            return;
        }
        askNotificationsThenStart(call);
    }

    @PermissionCallback
    private void startLocationCallback(PluginCall call) {
        if (locationGranted()) askNotificationsThenStart(call);
        else call.reject(BLOCKED, "PERMISSION_DENIED");
    }

    private void askNotificationsThenStart(PluginCall call) {
        // Android 13+: the "sharing your location" notification needs permission. Sharing works without it.
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "startNotificationsCallback");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void startNotificationsCallback(PluginCall call) {
        startService(call);
    }

    private void startService(PluginCall call) {
        Context ctx = getContext();
        int interval = Math.max(30, call.getInt("intervalSeconds", 600));
        TrackerState.save(ctx, call.getString("visitId"), interval,
            call.getString("title", "Checked in · Integer ERP"),
            call.getString("text", "Sharing your location until you check out."));
        try {
            ContextCompat.startForegroundService(ctx, new Intent(ctx, SiteTrackerService.class));
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't start location sharing: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        TrackerState.clear(ctx);
        ctx.stopService(new Intent(ctx, SiteTrackerService.class));
        call.resolve();
    }

    @PluginMethod
    public void drain(PluginCall call) {
        JSObject r = new JSObject();
        r.put("points", PointStore.drain(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("running", SiteTrackerService.isRunning());
        String visitId = TrackerState.visitId(getContext());
        r.put("visitId", visitId == null ? JSObject.NULL : visitId);
        call.resolve(r);
    }
}
