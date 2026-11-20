package com.nakamuratwins.tcgop;

import android.content.res.AssetManager;
import android.webkit.WebResourceResponse;

import androidx.webkit.WebViewAssetLoader;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Sirve assets/www con los tipos MIME correctos. Los módulos .mjs y el núcleo del OCR
 * no cargan si el tipo no es exacto, y el AssetsPathHandler estándar no los conoce.
 */
final class WebAssetHandler implements WebViewAssetLoader.PathHandler {
    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("json", "application/json");
        MIME.put("css", "text/css");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("webp", "image/webp");
        MIME.put("jpg", "image/jpeg");
        MIME.put("ico", "image/x-icon");
        MIME.put("wasm", "application/wasm");
        MIME.put("gz", "application/octet-stream");
    }

    private final AssetManager assets;

    WebAssetHandler(AssetManager assets) { this.assets = assets; }

    /** El empaquetador de Android descomprime los .gz de assets y les quita la extensión; el OCR detecta gzip por sus bytes, así que sirve igual. */
    private InputStream open(String path) throws IOException {
        try {
            return assets.open("www/" + path);
        } catch (IOException missing) {
            if (path.endsWith(".gz")) return assets.open("www/" + path.substring(0, path.length() - 3));
            throw missing;
        }
    }

    @Override
    public WebResourceResponse handle(String path) {
        if (path == null || path.isEmpty() || path.endsWith("/")) path = (path == null ? "" : path) + "index.html";
        if (path.contains("..")) return null;
        try {
            InputStream stream = open(path);
            String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
            String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            String encoding = mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("xml") ? "utf-8" : null;
            WebResourceResponse response = new WebResourceResponse(mime, encoding, stream);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            headers.put("X-Content-Type-Options", "nosniff");
            response.setResponseHeaders(headers);
            return response;
        } catch (IOException missing) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), null);
        }
    }
}
