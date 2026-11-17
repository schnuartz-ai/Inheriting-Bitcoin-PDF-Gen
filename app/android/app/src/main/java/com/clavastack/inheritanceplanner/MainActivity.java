package com.clavastack.inheritanceplanner;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plans contain details about the user's Bitcoin setup. FLAG_SECURE blocks screenshots, screen recording and
        // the preview in the recent apps list. Debug builds stay capturable so screenshots for the stores can be made.
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (!debuggable) {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        }
        super.onCreate(savedInstanceState);
    }
}
