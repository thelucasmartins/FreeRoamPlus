# Building for iOS

MapLibre is a native module, so this app cannot run in Expo Go — it needs a
**development build** (a custom Expo Dev Client), via EAS Build.

## The free-account constraint

`eas.json` in this repo defines two iOS build profiles:

- **`development-simulator`** — builds for the iOS **Simulator**. No Apple
  account needed at all. Works entirely in EAS's cloud, but the Simulator
  only runs on a Mac, so this profile doesn't get the app onto a physical
  iPhone.
- **`development`** — builds for a physical **device**. EAS Build's cloud
  service handles this by registering your iPhone's UDID and generating a
  provisioning profile through Apple's Developer Portal API — and that API
  access requires the Apple account to be enrolled in the paid **Apple
  Developer Program ($99/year)**. A free Apple ID cannot use it; EAS will
  reject the build during the credentials step.

So: **without a Mac and without paying Apple's $99/year, there is no
officially supported way to get a native development build of this app onto
a physical iPhone.** This isn't a gap in the `eas.json` config — it's a hard
limit of Apple's provisioning system that EAS Build cloud can't route around.
Three real paths forward:

### Option 1 — Get access to a Mac (even briefly)

A free Apple ID *can* sign apps for your own device — but only through
Xcode's local "Personal Team" signing, which needs macOS. If you can borrow
a Mac for 20 minutes:

```bash
npm install
eas build --platform ios --profile development --local
```

`--local` runs the build on that machine using Xcode directly instead of
EAS's cloud workers, so it uses your free Apple ID's personal-team signing
instead of the Developer Portal API. The output `.ipa` installs on your
iPhone via Xcode or [Apple Configurator](https://apps.apple.com/app/apple-configurator/id1037126344),
and needs re-signing (just re-running the command) every 7 days, since that's
a limit Apple places on free-account signatures, not something EAS controls.

### Option 2 — Enroll in the Apple Developer Program ($99/year)

The standard, fully-cloud path. Once enrolled:

```bash
npx eas-cli login
npx eas-cli init          # links this project to your Expo account, writes
                           # the projectId into app.json
npm run build:ios:dev
```

EAS will prompt to log in with your Apple ID during the first run and handles
device registration and provisioning automatically from there.

### Option 3 — iOS Simulator only (free, no device)

If you just want to see the app running without a physical iPhone:

```bash
npx eas-cli login
npx eas-cli init
npm run build:ios:sim
```

No Apple account required. Requires a Mac to actually launch the resulting
build in Simulator, though — EAS builds it in the cloud, but the Simulator
app itself is macOS-only.

## One-time setup (any option)

Before any of the above, this project needs to be linked to an Expo account
once:

```bash
npx eas-cli login
npx eas-cli init
```

`eas init` writes an `extra.eas.projectId` into [app.json](../app.json) —
that step needs to run interactively under your own Expo login, so it isn't
done in this repo yet.
