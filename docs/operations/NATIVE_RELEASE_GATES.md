# Native release gates

The Capacitor configuration is a starting point, not evidence that an iOS or
Android build is release-ready. Do not advertise App Store or Play Store
availability until every gate below is complete.

- Generate and commit the reviewed `ios/` and `android/` projects.
- Use bundle/application ID `com.crownmemedia.app` and production signing owned
  by CrownMe Media.
- Remove remote-development server URLs from release builds.
- Provide privacy manifests, permission purpose strings, data-safety forms,
  export-compliance answers, account-deletion links, and reviewer credentials.
- Configure Universal Links/App Links and publish `apple-app-site-association`
  and `/.well-known/assetlinks.json` using final signing identifiers.
- Configure APNs/FCM and test opt-in, denial, token rotation, logout, and deletion.
- Test camera, microphone, gallery, HEIC, 30-second video, interrupted upload,
  background/foreground, deep links, purchases, restore purchases, and refunds
  on physical low/mid/high-tier devices.
- Pass VoiceOver/TalkBack, dynamic text, contrast, reduced motion, keyboard, and
  screen-orientation checks.
- Run BrowserStack or equivalent device coverage only after credentials and an
  actual project configuration are supplied.
- Complete TestFlight/internal-track rollout, crash-free-session target, staged
  release, rollback, and store-review support procedures.
