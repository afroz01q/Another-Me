package com.anotherme.autopilot;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * AnotherMeNotificationService
 *
 * Dedicated Android NotificationListenerService that intercepts allowed messaging notifications
 * (WhatsApp, Instagram, Gmail, Outlook) when explicitly permitted by user in Android settings.
 *
 * Provides direct notification reply execution via Android RemoteInput PendingIntents.
 */
public class AnotherMeNotificationService extends NotificationListenerService {

    private static final String TAG = "AnotherMeNotifService";

    public static final Set<String> SUPPORTED_PACKAGES = new HashSet<>(Arrays.asList(
            "com.whatsapp",                  // WhatsApp Personal
            "com.whatsapp.w4b",              // WhatsApp Business
            "com.instagram.android",         // Instagram
            "com.google.android.gm",         // Gmail
            "com.microsoft.office.outlook"   // Microsoft Outlook
    ));

    public static class ActionableReplyInfo {
        public final Context context;
        public final PendingIntent pendingIntent;
        public final RemoteInput remoteInput;
        public final String remoteInputResultKey;

        public ActionableReplyInfo(Context context, PendingIntent pendingIntent, RemoteInput remoteInput, String remoteInputResultKey) {
            this.context = context;
            this.pendingIntent = pendingIntent;
            this.remoteInput = remoteInput;
            this.remoteInputResultKey = remoteInputResultKey;
        }
    }

    public static final Map<String, ActionableReplyInfo> activeReplies = new ConcurrentHashMap<>();
    public static AnotherMeNotificationService instance = null;

    /**
     * Send a direct reply back to WhatsApp / Instagram / Gmail using Android RemoteInput
     */
    public static boolean sendReply(String notificationKey, String replyText) {
        ActionableReplyInfo replyInfo = activeReplies.get(notificationKey);
        if (replyInfo == null) {
            Log.w(TAG, "No active reply action found for key: " + notificationKey);
            return false;
        }

        try {
            Intent intent = new Intent();
            Bundle bundle = new Bundle();
            bundle.putCharSequence(replyInfo.remoteInputResultKey, replyText);
            RemoteInput.addResultsToIntent(new RemoteInput[]{replyInfo.remoteInput}, intent, bundle);

            replyInfo.pendingIntent.send(replyInfo.context, 0, intent);
            Log.i(TAG, "Successfully dispatched direct reply to " + notificationKey);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to send direct reply for " + notificationKey, e);
            return false;
        }
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        instance = this;
        Log.i(TAG, "Another Me Notification Listener Connected.");
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        instance = null;
        Log.i(TAG, "Another Me Notification Listener Disconnected.");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String packageName = sbn.getPackageName();
        if (packageName == null || !SUPPORTED_PACKAGES.contains(packageName)) return;

        Notification notification = sbn.getNotification();
        if (notification == null || notification.extras == null) return;

        Bundle extras = notification.extras;
        CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigTextCs = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);

        String title = titleCs != null ? titleCs.toString() : "";
        String text = textCs != null ? textCs.toString() : "";
        String bigText = bigTextCs != null ? bigTextCs.toString() : text;

        if (title.trim().isEmpty() && bigText.trim().isEmpty()) return;

        // Extract Direct Reply Action if available
        boolean canReply = false;
        Notification.Action[] actions = notification.actions;
        if (actions != null) {
            for (Notification.Action action : actions) {
                android.app.RemoteInput[] remoteInputs = action.getRemoteInputs();
                if (remoteInputs != null) {
                    for (android.app.RemoteInput remoteInput : remoteInputs) {
                        if (remoteInput.getAllowFreeFormInput()) {
                            PendingIntent pendingIntent = action.actionIntent;
                            if (pendingIntent != null) {
                                activeReplies.put(sbn.getKey(), new ActionableReplyInfo(
                                        this,
                                        pendingIntent,
                                        remoteInput,
                                        remoteInput.getResultKey()
                                ));
                                canReply = true;
                                break;
                            }
                        }
                    }
                }
                if (canReply) break;
            }
        }

        try {
            JSONObject json = new JSONObject();
            json.put("id", sbn.getKey());
            json.put("packageName", packageName);
            json.put("sender", title);
            json.put("content", bigText);
            json.put("timestamp", sbn.getPostTime());
            json.put("canDirectReply", canReply);

            AutopilotBridgePlugin.notifyInboundMessage(json);
        } catch (Exception e) {
            Log.e(TAG, "Error packaging notification JSON", e);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (sbn != null && sbn.getKey() != null) {
            activeReplies.remove(sbn.getKey());
        }
    }
}
