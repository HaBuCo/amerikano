# App Review response — Guideline 5.1.1(iv)

Hello App Review,

Thank you for identifying the confusing order of the advertising consent prompts. We have changed the iOS flow so that the Google UMP privacy disclosure and consent form, when required for the user's region, is presented before the App Tracking Transparency (ATT) request.

If the user declines personalised advertising in the UMP form, the app does not request ATT permission or initialize Google Mobile Ads. If the user chooses “Ask App Not to Track” in ATT, the app does not initialize Google Mobile Ads or request ads. On subsequent launches with ATT denied, it does not present the UMP advertising consent form again. Changing consent from the in-app privacy options closes any visible banner and discards preloaded interstitial ads while the new choice is evaluated. The game remains available without advertising permission.

The UMP form is shown only where Google indicates a regional disclosure is required. In other regions, the app proceeds directly to ATT. Reviewers can compare the flows on a fresh installation using a device/network in the EEA and one outside the EEA. Consent can be revisited in the app under Settings → Legal & Privacy → Manage advertising preferences when regional privacy options are required and ATT is allowed. iOS tracking permission can be reviewed in iOS Settings. The iOS app display name is set to “Amerikano”.

Please review the updated build. Thank you.
