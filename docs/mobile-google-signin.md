# Mobile Google sign-in (how it works)

## You do **not** need a separate Google “iOS/Android” OAuth client

This app uses **in-app browser / `WebBrowser.openAuthSessionAsync`** to open Google’s **web** consent page. The same **Web application** OAuth client as the API is used (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on the server).

Flow:

1. App calls **`GET https://api.opensocial.so/api/auth/google?mobileRedirectUri=<deep link>`**  
   `mobileRedirectUri` is something like `opensocial://auth/google` (standalone) or `exp://…/--/auth/google` (Expo Go), from `Linking.createURL("auth/google")`.

2. API returns a Google URL whose **`state`** embeds that `mobileRedirectUri` (base64 JSON).

3. User signs in; **Google redirects only to your API**:  
   **`https://api.opensocial.so/api/auth/google/callback?code=…&state=…`**

4. API validates `state`, then **HTTP 302** to the app:  
   **`opensocial://auth/google?code=…`** (or your `exp://…` URL).

5. The auth session hands that URL back to the app; the app reads `code` and calls **`POST /api/auth/google/callback`** to exchange it for tokens.

So the redirect **does** come back **into the app**, but only **after** Google hits the **API** first. Google never opens your custom scheme directly.

### Google Cloud Console checklist

- **OAuth client type:** **Web application** (not iOS / Android client types for this flow).
- **Authorized redirect URIs:** include **only** the API callback, e.g.  
  `https://api.opensocial.so/api/auth/google/callback`  
  (and your local one if you test against a local API).

### API environment (production)

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — same Web client as above.  
- `GOOGLE_REDIRECT_URI` — must exactly match that callback URL (e.g. `https://api.opensocial.so/api/auth/google/callback`).

### Mobile app environment

- Point the app at the API: **`EXPO_PUBLIC_API_BASE_URL=https://api.opensocial.so/api`** (optional if you use the default production base URL in code).
- For **local API** during dev, set either:
  - `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api` (or your LAN IP), or  
  - `EXPO_PUBLIC_USE_LOCAL_API=1` to use Expo’s dev host / emulator defaults.

No extra “Google client on the app” is required unless you later switch to the native **Google Sign-In SDK** (different integration).
