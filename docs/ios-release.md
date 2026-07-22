# iOS build and TestFlight release

LittleTask uses EAS Build because the repository is developed from Windows and the app requires
native Contacts, Calendar, SecureStore, and SQLite modules. All committed EAS profiles target the
production API at `https://manbaout.com/api/v1`; no model credential is included in the app.

## One-time project setup

Run these commands from `apps/mobile` while authenticated to the Expo account that will own the
project:

```powershell
corepack pnpm dlx eas-cli login
corepack pnpm dlx eas-cli init
```

`eas init` writes the real EAS project ID into the Expo config. Commit that generated identifier,
but never commit Apple credentials, provisioning profiles, API keys, or downloaded signing files.
The Apple Developer team must own the `com.manbaout.littletask` bundle identifier.

The app version is committed in `app.json`; EAS owns and increments the iOS build number remotely.
Before every store release, update the user-facing version intentionally and commit it.

## Build profiles

- `development`: registered physical devices, Expo development client, cloud API.
- `development-simulator`: unsigned iOS Simulator development client.
- `preview`: internally distributed release-mode build for acceptance.
- `production`: App Store/TestFlight build with an automatically incremented build number.

Build a physical-device development client:

```powershell
corepack pnpm dlx eas-cli device:create
corepack pnpm dlx eas-cli build --platform ios --profile development
```

Build the TestFlight artifact only after the public API and privacy policy are live:

```powershell
corepack pnpm dlx eas-cli build --platform ios --profile production
corepack pnpm dlx eas-cli submit --platform ios --profile production --latest
```

The submit command asks for the real App Store Connect application when it has not yet been linked.
Do not invent or commit an `ascAppId` before that application exists.

## Release gates

Use a disposable contact, a dedicated test calendar, and a synthetic screenshot. Verify:

1. Photo access is requested only after the user opens the picker.
2. Contact and calendar access are requested only during explicit device verification.
3. Editing a card invalidates its prior confirmation revision.
4. Canceling the final confirmation produces no native mutation.
5. Create contact, update contact, and create event each mutate exactly once after confirmation.
6. Permission denial, offline reporting, app termination, retry, and uncertain execution recover
   without duplicating a native record.
7. The privacy screen can delete server history, the anonymous account, and the local execution
   ledger independently.

Record the EAS build URL, Git SHA, app version/build number, device/iOS version, and the result of
each gate in a private release note. Never attach a real chat screenshot or contact export.

## App Store metadata

Before submission, provide the real privacy policy URL, support URL, data collection answers,
review notes, and screenshots in App Store Connect. The committed privacy manifest declares the
selected screenshot, optional user content, extracted contact fields, and product interactions as
linked app-functionality data with tracking disabled. Reconcile it against the deployed retention
behavior and App Privacy form for every release.
