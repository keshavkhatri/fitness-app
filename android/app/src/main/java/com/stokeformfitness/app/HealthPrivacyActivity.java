package com.stokeformfitness.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * Health Connect asks every app that reads health data for a screen explaining how it uses that data. This opens
 * the privacy policy (stokeform.com/privacy) in the browser and closes itself: it is started from Health Connect's
 * permission screen ("privacy policy") and from the system's list of apps that used health permissions.
 */
public class HealthPrivacyActivity extends Activity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    try {
      startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://stokeform.com/privacy")));
    } catch (Exception ignored) {
      // No browser to show it in: nothing more to do.
    }
    finish();
  }
}
