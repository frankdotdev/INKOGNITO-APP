# Android
**Status: no native app has been built.** The web app is the product. It already installs on Android as an app (home-screen icon, full screen, offline shell, share sheet, web push, camera and microphone), and the site serves `/.well-known/assetlinks.json` when configured so it can be wrapped for Google Play.

## Why not native yet
A native app would be a second front end for about 70 screens. Nothing here can build or test an Android app: it needs the Android SDK, an emulator or devices, and Play Console. A native app that was never run would be a liability, not progress.

## Option 1 (recommended first): Trusted Web Activity
1. Deploy the web app on HTTPS; check `/manifest.webmanifest`, `/pwa-icon/192` and `/pwa-icon/512` load.
2. `npm i -g @bubblewrap/cli`, then `bubblewrap init --manifest=https://<domain>/manifest.webmanifest` and `bubblewrap build` (needs the Android SDK and a JDK; Bubblewrap offers to install them).
3. Sign the app (Play App Signing recommended) and copy the SHA-256 fingerprint(s).
4. Set `ANDROID_PACKAGE_NAME` and `ANDROID_SHA256_FINGERPRINTS` (comma separated) on the web deployment, then verify with Google's Digital Asset Links tool.
5. Upload to Google Play. It needs a privacy policy URL (your `/legal/privacy` page), a data-safety form, an age rating, and review notes explaining moderation and reporting for user-generated content.

## Option 2: native later
React Native sharing `packages/core` and the same APIs. Worth it only if the web app proves itself on phones. It would also provide device-bound key storage for E2EE (`22-e2ee-design.md`).
