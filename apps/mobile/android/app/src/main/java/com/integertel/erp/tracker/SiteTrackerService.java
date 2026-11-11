package com.integertel.erp.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.integertel.erp.MainActivity;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Foreground service that runs while a field engineer is checked in. It shows a permanent notification
 * ("Checked in · sharing your location") and asks Android for one location reading per interval —
 * GPS is off in between, so the battery cost stays small. Readings go to {@link PointStore}; the web app
 * uploads them. Started on Check in, stopped on Check out (or when the visit is closed).
 */
public class SiteTrackerService extends Service {
    private static final String TAG = "SiteTracker";
    private static final String CHANNEL_ID = "site_tracker";
    private static final int NOTIFICATION_ID = 4711;

    private static volatile boolean running = false;

    private FusedLocationProviderClient client;
    private LocationCallback callback;
    private String activeVisitId;
    private int activeInterval;

    static boolean isRunning() {
        return running;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        client = LocationServices.getFusedLocationProviderClient(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String visitId = TrackerState.visitId(this);
        if (visitId == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            Notification n = buildNotification(TrackerState.title(this), TrackerState.text(this));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
        } catch (Exception e) {
            // Android refuses a location service started from the background (e.g. a restart after the app
            // was killed). The web app starts it again the next time it is opened.
            Log.w(TAG, "Could not start in the foreground", e);
            stopSelf();
            return START_NOT_STICKY;
        }

        int interval = TrackerState.intervalSeconds(this);
        if (!visitId.equals(activeVisitId) || interval != activeInterval) {
            requestUpdates(visitId, interval);
        }
        running = true;
        return START_STICKY;
    }

    private void requestUpdates(String visitId, int intervalSeconds) {
        removeUpdates();
        activeVisitId = visitId;
        activeInterval = intervalSeconds;
        long ms = intervalSeconds * 1000L;
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, ms)
            .setMinUpdateIntervalMillis(ms)
            .setWaitForAccurateLocation(false)
            .build();
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                for (Location l : result.getLocations()) record(visitId, l);
            }
        };
        try {
            client.requestLocationUpdates(request, callback, Looper.getMainLooper());
        } catch (SecurityException e) {
            Log.w(TAG, "Location permission missing", e);
            stopSelf();
        }
    }

    private void record(String visitId, Location l) {
        JSObject p = toPoint(visitId, l);
        PointStore.add(this, p);
        SiteTrackerPlugin.emit(p);
    }

    static JSObject toPoint(String visitId, Location l) {
        JSObject p = new JSObject();
        if (visitId != null) p.put("visitId", visitId);
        p.put("lat", l.getLatitude());
        p.put("lng", l.getLongitude());
        if (l.hasAccuracy()) p.put("accuracy", Math.round(l.getAccuracy()));
        p.put("recordedAt", iso(l.getTime()));
        return p;
    }

    static String iso(long millis) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(millis));
    }

    private void removeUpdates() {
        if (callback != null) client.removeLocationUpdates(callback);
        callback = null;
    }

    private Notification buildNotification(String title, String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Location while checked in", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while you're checked in to a site and your location is being shared.");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, piFlags);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pi)
            .build();
    }

    @Override
    public void onDestroy() {
        removeUpdates();
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
