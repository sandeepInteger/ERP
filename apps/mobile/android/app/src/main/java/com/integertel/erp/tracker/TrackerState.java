package com.integertel.erp.tracker;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * What the tracker is doing: the open visit and how often to take a reading. Stored so the service can
 * carry on if Android restarts it, and so a check-out always stops it (state cleared = stop).
 */
final class TrackerState {
    private static final String PREFS = "site_tracker_state";

    private TrackerState() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void save(Context ctx, String visitId, int intervalSeconds, String title, String text) {
        prefs(ctx).edit()
            .putString("visitId", visitId)
            .putInt("intervalSeconds", intervalSeconds)
            .putString("title", title)
            .putString("text", text)
            .apply();
    }

    static void clear(Context ctx) {
        prefs(ctx).edit().clear().apply();
    }

    static String visitId(Context ctx) {
        return prefs(ctx).getString("visitId", null);
    }

    static int intervalSeconds(Context ctx) {
        return prefs(ctx).getInt("intervalSeconds", 600);
    }

    static String title(Context ctx) {
        return prefs(ctx).getString("title", "Checked in · Integer ERP");
    }

    static String text(Context ctx) {
        return prefs(ctx).getString("text", "Sharing your location until you check out.");
    }
}
