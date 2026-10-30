package com.college.studenttracker;

import android.Manifest;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {

    private static final int LOCATION_PERMISSION_REQUEST_CODE = 1001;
    private static final String PREFS_NAME = "StudentTrackerPrefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String DEFAULT_URL = "https://hasty-reactive-sandlot.ngrok-free.dev/tracker";

    private LinearLayout startLayout;
    private RelativeLayout webViewContainer;
    private LinearLayout errorLayout;
    private WebView webView;
    private ProgressBar progressBar;
    private TextView txtCurrentUrl;
    private TextView txtErrorDetail;

    private SharedPreferences preferences;
    private String currentServerUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        preferences = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        currentServerUrl = preferences.getString(KEY_SERVER_URL, DEFAULT_URL);

        initViews();
        setupWebView();
        updateUrlDisplay();
    }

    private void initViews() {
        startLayout = findViewById(R.id.startLayout);
        webViewContainer = findViewById(R.id.webViewContainer);
        errorLayout = findViewById(R.id.errorLayout);
        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        txtCurrentUrl = findViewById(R.id.txtCurrentUrl);
        txtErrorDetail = findViewById(R.id.txtErrorDetail);

        Button btnStartTracking = findViewById(R.id.btnStartTracking);
        ImageView btnSettings = findViewById(R.id.btnSettings);
        Button btnRetry = findViewById(R.id.btnRetry);
        Button btnChangeUrl = findViewById(R.id.btnChangeUrl);
        Button btnBackToHome = findViewById(R.id.btnBackToHome);

        btnStartTracking.setOnClickListener(v -> checkPermissionAndLaunch());
        btnSettings.setOnClickListener(v -> showUrlConfigDialog());

        btnRetry.setOnClickListener(v -> {
            errorLayout.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            webView.loadUrl(currentServerUrl);
        });

        btnChangeUrl.setOnClickListener(v -> showUrlConfigDialog());
        btnBackToHome.setOnClickListener(v -> returnToStartScreen());
    }

    private void updateUrlDisplay() {
        if (txtCurrentUrl != null) {
            txtCurrentUrl.setText("Link: " + currentServerUrl);
        }
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setLoadsImagesAutomatically(true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
                errorLayout.setVisibility(View.GONE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler, android.net.http.SslError error) {
                handler.proceed(); // Allow tunnel SSL
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    progressBar.setVisibility(View.GONE);
                    webView.setVisibility(View.GONE);
                    errorLayout.setVisibility(View.VISIBLE);
                    txtErrorDetail.setText("Could not reach " + currentServerUrl + "\nVerify laptop and mobile are connected to the same Wi-Fi or check the tunnel URL.");
                }
            }
        });
    }

    private void checkPermissionAndLaunch() {
        if (hasLocationPermission()) {
            openTrackerWebView();
        } else {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                    },
                    LOCATION_PERMISSION_REQUEST_CODE
            );
        }
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED &&
               ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void openTrackerWebView() {
        startLayout.setVisibility(View.GONE);
        webViewContainer.setVisibility(View.VISIBLE);
        webView.setVisibility(View.VISIBLE);
        errorLayout.setVisibility(View.GONE);
        webView.loadUrl(currentServerUrl);
    }

    private void returnToStartScreen() {
        webView.stopLoading();
        webView.loadUrl("about:blank");
        webViewContainer.setVisibility(View.GONE);
        startLayout.setVisibility(View.VISIBLE);
    }

    private void showUrlConfigDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle(R.string.server_url_dialog_title);

        final EditText input = new EditText(this);
        input.setHint(R.string.server_url_hint);
        input.setText(currentServerUrl);
        input.setSelection(currentServerUrl.length());
        builder.setView(input);

        builder.setPositiveButton("Save", (dialog, which) -> {
            String newUrl = input.getText().toString().trim();
            if (!newUrl.isEmpty()) {
                if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
                    newUrl = "http://" + newUrl;
                }
                currentServerUrl = newUrl;
                preferences.edit().putString(KEY_SERVER_URL, currentServerUrl).apply();
                updateUrlDisplay();
                Toast.makeText(MainActivity.this, "Server URL updated!", Toast.LENGTH_SHORT).show();

                if (webViewContainer.getVisibility() == View.VISIBLE) {
                    webView.setVisibility(View.VISIBLE);
                    errorLayout.setVisibility(View.GONE);
                    webView.loadUrl(currentServerUrl);
                }
            }
        });

        builder.setNegativeButton("Cancel", (dialog, which) -> dialog.cancel());
        builder.show();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                openTrackerWebView();
            } else {
                Toast.makeText(this, "Location permission is required for student tracking.", Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webViewContainer.getVisibility() == View.VISIBLE) {
            if (errorLayout.getVisibility() == View.VISIBLE) {
                returnToStartScreen();
            } else if (webView.canGoBack()) {
                webView.goBack();
            } else {
                returnToStartScreen();
            }
        } else {
            super.onBackPressed();
        }
    }
}
