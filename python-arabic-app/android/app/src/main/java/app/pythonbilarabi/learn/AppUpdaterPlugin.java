package app.pythonbilarabi.learn;

import android.content.Context;
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

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Downloads an update APK inside the app and opens Android's installer directly
 * (no browser, no GitHub page). Used by the "update available" dialog.
 *
 * JS: Capacitor.Plugins.AppUpdater
 *   download({ url })          -> { path, size }   (emits "progress" { loaded, total })
 *   canInstall()               -> { value }        (Android 8+: "install unknown apps" allowed for this app?)
 *   openInstallSettings()      -> opens that setting for OmniCode
 *   install()                  -> opens the system installer for the downloaded APK
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "OmniCode-update.apk");
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("invalid url");
            return;
        }
        new Thread(() -> {
            HttpURLConnection conn = null;
            File out = apkFile();
            File tmp = new File(out.getPath() + ".part");
            try {
                String current = url;
                // follow redirects (GitHub release files redirect to their file server)
                for (int i = 0; i < 6; i++) {
                    conn = (HttpURLConnection) new URL(current).openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.setRequestProperty("User-Agent", "OmniCode-Android");
                    int code = conn.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (loc == null || !loc.startsWith("https://")) throw new Exception("bad redirect");
                        current = loc;
                        continue;
                    }
                    if (code != 200) throw new Exception("HTTP " + code);
                    break;
                }
                long total = conn.getContentLengthLong();
                long loaded = 0;
                long lastEmit = 0;
                try (InputStream in = conn.getInputStream(); OutputStream os = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        os.write(buf, 0, n);
                        loaded += n;
                        long now = System.currentTimeMillis();
                        if (now - lastEmit > 150) {
                            lastEmit = now;
                            JSObject p = new JSObject();
                            p.put("loaded", loaded);
                            p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                }
                if (total > 0 && loaded != total) throw new Exception("incomplete download");
                if (out.exists()) out.delete();
                if (!tmp.renameTo(out)) throw new Exception("could not save file");
                JSObject ret = new JSObject();
                ret.put("path", out.getAbsolutePath());
                ret.put("size", loaded);
                call.resolve(ret);
            } catch (Exception e) {
                tmp.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : "download failed");
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean ok = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject ret = new JSObject();
        ret.put("value", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File f = apkFile();
        if (!f.exists()) {
            call.reject("no downloaded update");
            return;
        }
        Context ctx = getContext();
        Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        call.resolve();
    }
}
