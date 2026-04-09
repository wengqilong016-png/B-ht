package com.bahati.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "ApkUpdate")
public class ApkUpdatePlugin extends Plugin {
  private final ExecutorService executor = Executors.newSingleThreadExecutor();

  @PluginMethod
  public void openUnknownSourcesSettings(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      try {
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
      } catch (Exception e) {
        call.reject("Failed to open unknown sources settings", e);
      }
      return;
    }
    call.resolve();
  }

  @PluginMethod
  public void downloadAndInstall(PluginCall call) {
    final String urlString = call.getString("url");
    if (urlString == null || urlString.trim().isEmpty()) {
      call.reject("Missing url");
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      boolean allowed = getContext().getPackageManager().canRequestPackageInstalls();
      if (!allowed) {
        call.reject("Install permission not granted. Enable \"Install unknown apps\" for this app and try again.", "INSTALL_PERMISSION_REQUIRED");
        return;
      }
    }

    // Keep the call alive while we download.
    call.setKeepAlive(true);
    getBridge().saveCall(call);

    executor.execute(() -> {
      File outFile = null;
      try {
        outFile = new File(getContext().getCacheDir(), "bahati-update.apk");
        downloadToFile(urlString, outFile);

        File finalOutFile = outFile;
        getBridge().executeOnMainThread(() -> {
          try {
            promptInstall(finalOutFile);
            call.resolve(new JSObject().put("started", true));
          } catch (Exception e) {
            call.reject("Failed to start installer", e);
          } finally {
            call.setKeepAlive(false);
            call.release(getBridge());
          }
        });
      } catch (Exception e) {
        // Best-effort cleanup.
        if (outFile != null) {
          try { //noinspection ResultOfMethodCallIgnored
            outFile.delete();
          } catch (Exception ignored) {}
        }
        getBridge().executeOnMainThread(() -> {
          try {
            call.reject("Failed to download update", e);
          } finally {
            call.setKeepAlive(false);
            call.release(getBridge());
          }
        });
      }
    });
  }

  private void downloadToFile(String urlString, File outFile) throws Exception {
    HttpURLConnection connection = null;
    try {
      URL url = new URL(urlString);
      connection = (HttpURLConnection) url.openConnection();
      connection.setConnectTimeout(10000);
      connection.setReadTimeout(30000);
      connection.setInstanceFollowRedirects(true);
      connection.connect();

      int code = connection.getResponseCode();
      if (code < 200 || code >= 300) {
        throw new Exception("HTTP " + code);
      }

      try (InputStream in = new BufferedInputStream(connection.getInputStream());
           FileOutputStream out = new FileOutputStream(outFile, false)) {
        byte[] buffer = new byte[32 * 1024];
        int read;
        while ((read = in.read(buffer)) != -1) {
          out.write(buffer, 0, read);
        }
        out.flush();
      }

      if (!outFile.exists() || outFile.length() <= 0) {
        throw new Exception("Downloaded APK is empty");
      }
    } finally {
      if (connection != null) {
        connection.disconnect();
      }
    }
  }

  private void promptInstall(File apkFile) {
    Uri apkUri = FileProvider.getUriForFile(
      getContext(),
      getContext().getPackageName() + ".fileprovider",
      apkFile
    );

    Intent intent = new Intent(Intent.ACTION_VIEW);
    intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    getContext().startActivity(intent);
  }
}
