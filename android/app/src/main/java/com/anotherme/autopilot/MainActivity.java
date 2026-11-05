package com.anotherme.autopilot;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AutopilotBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
