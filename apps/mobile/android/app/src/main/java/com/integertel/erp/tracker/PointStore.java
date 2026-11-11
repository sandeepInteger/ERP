package com.integertel.erp.tracker;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;

/**
 * Location readings taken by {@link SiteTrackerService}, kept on the phone until the web app drains
 * and uploads them. Survives the app being closed and the phone being offline. Capped so a phone that
 * never comes back online can't fill its storage.
 */
final class PointStore {
    private static final String PREFS = "site_tracker_points";
    private static final String KEY = "points";
    private static final int MAX_POINTS = 5000;

    private PointStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized void add(Context ctx, JSObject point) {
        JSONArray all = read(ctx);
        all.put(point);
        while (all.length() > MAX_POINTS) all.remove(0);
        prefs(ctx).edit().putString(KEY, all.toString()).apply();
    }

    /** Returns every buffered reading and empties the buffer. */
    static synchronized JSArray drain(Context ctx) {
        JSONArray all = read(ctx);
        prefs(ctx).edit().remove(KEY).apply();
        JSArray out = new JSArray();
        for (int i = 0; i < all.length(); i++) out.put(all.opt(i));
        return out;
    }

    private static JSONArray read(Context ctx) {
        String raw = prefs(ctx).getString(KEY, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }
}
