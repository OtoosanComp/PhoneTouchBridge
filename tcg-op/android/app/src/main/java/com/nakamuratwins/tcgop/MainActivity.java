package com.nakamuratwins.tcgop;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * TCG OP dentro de Android: la app web viaja en la APK (assets/www) y se sirve desde
 * https://appassets.androidplatform.net, un origen seguro propio. Así funciona sin internet
 * (inventario, OCR, catálogos descargados) y sin depender de Netlify.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/index.html";
    private static final int REQ_PICK_FILE = 41;
    private static final int REQ_CAMERA = 42;
    private static final int REQ_SAVE_FILE = 43;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraOutput;
    private String pendingSaveText;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#100E1B"));
        getWindow().setNavigationBarColor(Color.parseColor("#100E1B"));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#100E1B"));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#100E1B"));
        root.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // Android 15 dibuja de borde a borde: se deja espacio para las barras del sistema y el teclado.
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " TCGOP-Android/" + BuildConfig.VERSION_NAME);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/", new WebAssetHandler(getAssets()))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (HOST.equals(url.getHost())) return false;
                // Cualquier enlace externo se abre en el navegador, nunca dentro de la app.
                try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });
        webView.setWebChromeClient(new ChromeClient());
        webView.addJavascriptInterface(new Bridge(), "TCGAndroid");

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() { webView.onPause(); super.onPause(); }

    @Override
    protected void onResume() { super.onResume(); webView.onResume(); }

    @Override
    protected void onDestroy() {
        io.shutdown();
        webView.destroy();
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    /** Puente mínimo para JavaScript: guardar respaldos JSON con el selector de archivos del sistema. */
    final class Bridge {
        @JavascriptInterface
        public void saveTextFile(String fileName, String mimeType, String text) {
            runOnUiThread(() -> {
                pendingSaveText = text;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mimeType == null || mimeType.isEmpty() ? "application/json" : mimeType);
                intent.putExtra(Intent.EXTRA_TITLE, fileName);
                try {
                    startActivityForResult(intent, REQ_SAVE_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingSaveText = null;
                    Toast.makeText(MainActivity.this, "No hay una app para guardar archivos.", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public String appVersion() { return BuildConfig.VERSION_NAME; }
    }

    final class ChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            boolean images = false;
            for (String type : params.getAcceptTypes()) if (type != null && type.startsWith("image/")) images = true;
            if (images && params.isCaptureEnabled() && launchCamera()) return true;
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            // Los .json no siempre llegan con su tipo MIME correcto: para respaldos se aceptan todos los archivos.
            pick.setType(images ? "image/*" : "*/*");
            try {
                startActivityForResult(pick, REQ_PICK_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
            return true;
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            new AlertDialog.Builder(MainActivity.this).setTitle("TCG OP").setMessage(message)
                    .setPositiveButton("Aceptar", (d, w) -> result.confirm())
                    .setOnCancelListener(d -> result.confirm()).show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
            new AlertDialog.Builder(MainActivity.this).setTitle("TCG OP").setMessage(message)
                    .setPositiveButton("Aceptar", (d, w) -> result.confirm())
                    .setNegativeButton("Cancelar", (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel()).show();
            return true;
        }

        @Override
        public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
            EditText input = new EditText(MainActivity.this);
            input.setInputType(InputType.TYPE_CLASS_TEXT);
            if (defaultValue != null) { input.setText(defaultValue); input.setSelection(defaultValue.length()); }
            FrameLayout box = new FrameLayout(MainActivity.this);
            int pad = (int) (20 * getResources().getDisplayMetrics().density);
            box.setPadding(pad, pad / 2, pad, 0);
            box.addView(input);
            new AlertDialog.Builder(MainActivity.this).setTitle("TCG OP").setMessage(message).setView(box)
                    .setPositiveButton("Aceptar", (d, w) -> result.confirm(input.getText().toString()))
                    .setNegativeButton("Cancelar", (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel()).show();
            return true;
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage message) {
            return !BuildConfig.DEBUG || super.onConsoleMessage(message);
        }
    }

    private boolean launchCamera() {
        try {
            File dir = new File(getCacheDir(), "camera");
            if (!dir.exists() && !dir.mkdirs()) return false;
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 86_400_000L) f.delete();
            File photo = new File(dir, "carta-" + System.currentTimeMillis() + ".jpg");
            cameraOutput = FileProvider.getUriForFile(this, getPackageName() + ".files", photo);
            Intent capture = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            capture.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, cameraOutput);
            capture.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(capture, REQ_CAMERA);
            return true;
        } catch (Exception e) {
            cameraOutput = null;
            return false;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK_FILE || requestCode == REQ_CAMERA) {
            Uri[] result = null;
            if (resultCode == RESULT_OK) {
                if (requestCode == REQ_CAMERA) result = cameraOutput != null ? new Uri[]{cameraOutput} : null;
                else result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            }
            if (fileCallback != null) fileCallback.onReceiveValue(result);
            fileCallback = null;
            cameraOutput = null;
        } else if (requestCode == REQ_SAVE_FILE) {
            String text = pendingSaveText;
            pendingSaveText = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || text == null) {
                Toast.makeText(this, "Respaldo cancelado.", Toast.LENGTH_SHORT).show();
                return;
            }
            Uri target = data.getData();
            io.execute(() -> {
                boolean ok;
                try (OutputStream out = getContentResolver().openOutputStream(target, "wt")) {
                    if (out == null) throw new IllegalStateException("sin destino");
                    out.write(text.getBytes(StandardCharsets.UTF_8));
                    ok = true;
                } catch (Exception e) {
                    ok = false;
                }
                final boolean saved = ok;
                runOnUiThread(() -> {
                    Toast.makeText(this, saved ? "Respaldo guardado." : "No se pudo guardar el respaldo.", Toast.LENGTH_LONG).show();
                    webView.evaluateJavascript("window.TCGOnFileSaved&&window.TCGOnFileSaved(" + saved + ")", null);
                });
            });
        }
    }
}
