package com.integertel.erp;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.integertel.erp.tracker.SiteTrackerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own plugin (background location while a field engineer is checked in) lives in this app.
        registerPlugin(SiteTrackerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
