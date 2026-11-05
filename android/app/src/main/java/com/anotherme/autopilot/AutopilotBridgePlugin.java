package com.anotherme.autopilot;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;
import java.util.Locale;
import java.util.Set;

/**
 * AutopilotBridgePlugin
 *
 * Capacitor Native Plugin exposing:
 * 1. Android OS notification listener status & RemoteInput direct reply
 * 2. Native Android TextToSpeech engine with zero-latency playback & utterance lifecycle events
 */
@CapacitorPlugin(name = "AutopilotBridge")
public class AutopilotBridgePlugin extends Plugin {

    private static final String TAG = "AutopilotBridgePlugin";
    private static AutopilotBridgePlugin activePluginInstance = null;

    private TextToSpeech tts = null;
    private boolean isTtsReady = false;

    public static void notifyInboundMessage(JSONObject json) {
        if (activePluginInstance != null) {
            try {
                JSObject jsObj = JSObject.fromJSONObject(json);
                activePluginInstance.notifyListeners("onInboundNotification", jsObj);
            } catch (Exception e) {
                // Ignore conversion errors
            }
        }
    }

    @Override
    public void load() {
        super.load();
        activePluginInstance = this;
        initNativeTTS();
    }

    private void initNativeTTS() {
        try {
            Context ctx = getContext();
            tts = new TextToSpeech(ctx, status -> {
                if (status == TextToSpeech.SUCCESS) {
                    try {
                        int langRes = tts.setLanguage(Locale.US);
                        if (langRes == TextToSpeech.LANG_MISSING_DATA || langRes == TextToSpeech.LANG_NOT_SUPPORTED) {
                            tts.setLanguage(Locale.getDefault());
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "Error setting TTS language:", e);
                    }
                    isTtsReady = true;
                    Log.i(TAG, "Native Android TextToSpeech initialized successfully.");
                } else {
                    Log.e(TAG, "Native Android TextToSpeech init failed with status: " + status);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Exception creating TextToSpeech instance", e);
        }
    }

    /**
     * Check if Native TextToSpeech is initialized and ready
     */
    @PluginMethod
    public void isTtsReady(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ready", isTtsReady);
        call.resolve(ret);
    }

    /**
     * Speak text using Native Android TextToSpeech engine
     */
    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        Double rate = call.getDouble("rate", 1.0);
        Double pitch = call.getDouble("pitch", 1.0);

        if (text == null || text.trim().isEmpty()) {
            call.reject("text is required");
            return;
        }

        if (tts == null || !isTtsReady) {
            // Attempt re-init if not ready yet
            initNativeTTS();
            call.reject("Native TextToSpeech engine is still initializing. Please retry in a moment.");
            return;
        }

        try {
            if (rate != null) tts.setSpeechRate(rate.floatValue());
            if (pitch != null) tts.setPitch(pitch.floatValue());

            String utteranceId = "utt_" + System.currentTimeMillis();

            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String id) {
                    JSObject event = new JSObject();
                    event.put("event", "start");
                    event.put("utteranceId", id);
                    notifyListeners("ttsEvent", event);
                }

                @Override
                public void onDone(String id) {
                    JSObject event = new JSObject();
                    event.put("event", "done");
                    event.put("utteranceId", id);
                    notifyListeners("ttsEvent", event);
                }

                @Override
                public void onError(String id) {
                    JSObject event = new JSObject();
                    event.put("event", "error");
                    event.put("utteranceId", id);
                    notifyListeners("ttsEvent", event);
                }
            });

            Bundle params = new Bundle();
            params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
            int res = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);

            JSObject ret = new JSObject();
            ret.put("success", res == TextToSpeech.SUCCESS);
            ret.put("utteranceId", utteranceId);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Native TTS speak failed: " + e.getLocalizedMessage());
        }
    }

    /**
     * Stop any active Native Android speech output immediately
     */
    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        try {
            if (tts != null) {
                tts.stop();
            }
            JSObject ret = new JSObject();
            ret.put("stopped", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Native TTS stop failed: " + e.getLocalizedMessage());
        }
    }

    /**
     * Check if user has explicitly granted Android Notification Access permission in system settings
     */
    @PluginMethod
    public void checkNotificationAccess(PluginCall call) {
        Context ctx = getContext();
        String packageName = ctx.getPackageName();
        Set<String> enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(ctx);
        boolean isGranted = enabledPackages.contains(packageName);

        JSObject ret = new JSObject();
        ret.put("granted", isGranted);
        ret.put("packageName", packageName);
        call.resolve(ret);
    }

    /**
     * Open Android System Settings -> Notification Access so user can enable Another Me listener
     */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Unable to open Notification Access settings: " + e.getLocalizedMessage());
        }
    }

    /**
     * Send direct reply to WhatsApp/Instagram/Gmail notification via Android RemoteInput
     */
    @PluginMethod
    public void sendDirectReply(PluginCall call) {
        String notificationKey = call.getString("notificationKey");
        String replyText = call.getString("replyText");

        if (notificationKey == null || replyText == null) {
            call.reject("notificationKey and replyText are required");
            return;
        }

        boolean success = AnotherMeNotificationService.sendReply(notificationKey, replyText);
        if (success) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("notificationKey", notificationKey);
            call.resolve(ret);
        } else {
            call.reject("Failed to dispatch direct reply. Notification may have expired or dismissed.");
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Exception e) {
                // Ignore cleanup error
            }
            tts = null;
            isTtsReady = false;
        }
        super.handleOnDestroy();
    }
}
