package com.clavastack.nativeprint;

import android.content.Intent;
import android.provider.CalendarContract;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Oeffnet die Kalender-App mit einem vorausgefuellten Termin (keine Berechtigung noetig).
 * Der Nutzer speichert den Termin selbst. Unterstuetzt Wiederholung per RRULE (z. B. FREQ=YEARLY).
 */
@CapacitorPlugin(name = "NativeCalendar")
public class NativeCalendarPlugin extends Plugin {

    @PluginMethod
    public void addEvent(final PluginCall call) {
        try {
            long start = call.getData().optLong("start", 0);
            long end = call.getData().optLong("end", 0);
            if (start <= 0) {
                call.reject("start missing");
                return;
            }
            if (end <= start) {
                end = start + 45L * 60L * 1000L;
            }
            Intent intent = new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI);
            intent.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start);
            intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end);
            intent.putExtra(CalendarContract.Events.TITLE, call.getString("title", ""));
            intent.putExtra(CalendarContract.Events.DESCRIPTION, call.getString("notes", ""));
            intent.putExtra(CalendarContract.Events.AVAILABILITY, CalendarContract.Events.AVAILABILITY_FREE);
            String rrule = call.getString("rrule", "");
            if (rrule != null && !rrule.isEmpty()) {
                intent.putExtra(CalendarContract.Events.RRULE, rrule);
            }
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception ex) {
            call.reject(ex.getMessage() != null ? ex.getMessage() : "calendar unavailable");
        }
    }
}
