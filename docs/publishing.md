# Publishing to the Chrome Web Store

The first submission is done by hand in the Developer Dashboard. Updates are automated afterwards: pushing a `v*` tag builds the zip, creates a GitHub release and submits the new version for review.

## 1. First submission

1. **Register as a Chrome Web Store developer** at <https://chrome.google.com/webstore/devconsole>. Sign in with the Google account that will own the extension, accept the developer agreement and pay the one-time US$ 5 fee.
2. **Verify your contact email** under *Account*. Publishing is blocked until it is verified.
3. **Build the package:**
   ```sh
   npm ci
   npm run package   # creates grafana-snapshot-<version>.zip
   ```
4. **Upload it:** in the dashboard, click **New item** and upload the zip.
5. **Fill in the tabs** using the texts and images in [`store/listing.md`](../store/listing.md): *Store listing*, *Privacy* and *Distribution*.
6. **Submit for review.** A first review usually takes a few days, sometimes a couple of weeks. You will get an email when it is done.

Note the item's **extension ID**, a 32-letter string shown in the dashboard and in the item's URL. You need it for the automation.

## 2. Automated updates (Chrome Web Store API v2)

The automation uses a Google Cloud **service account**, so no user token needs refreshing.

1. **Enable the API.** In the [Google Cloud Console](https://console.cloud.google.com/), create or pick a project, open *APIs & Services > Library*, search for **Chrome Web Store API** and enable it.
2. **Create a service account** under *IAM & Admin > Service Accounts*. It needs no roles. Open it, go to *Keys > Add key > Create new key > JSON* and download the key file.
3. **Authorize it for your publisher.** In the Developer Dashboard, go to *Account* and add the service account's email address (`…@….iam.gserviceaccount.com`). Only one service account can be added per publisher.
4. **Copy your publisher ID** from *Publisher > Settings* in the Developer Dashboard.
5. **Add the repository secrets:**
   ```sh
   gh secret set CWS_PUBLISHER_ID --body "<publisher id>"
   gh secret set CWS_EXTENSION_ID --body "<extension id>"
   gh secret set CWS_SERVICE_ACCOUNT_KEY < path/to/service-account-key.json
   ```
   Then delete the downloaded key file.

## 3. Releasing a new version

```sh
npm version minor          # or patch / major: bumps package.json and creates the tag
git push --follow-tags
```

The *Release* workflow then does the rest:

1. runs the tests;
2. publishes a GitHub release with the zip;
3. uploads the zip to the Chrome Web Store and submits it for review.

Until all three secrets exist, the Chrome Web Store step is skipped.

This extension's ID is `nmeeaihakedfkcfjjdiagdhkfnjlakmf`.

To upload by hand without submitting for review:

```sh
CWS_PUBLISHER_ID=… CWS_EXTENSION_ID=… CWS_SERVICE_ACCOUNT_KEY="$(cat key.json)" \
  npm run publish:cws -- grafana-snapshot-1.1.0.zip --upload-only
```

## Store images

The screenshots and promo tile are generated from real exports of the demo dashboard:

```sh
npm run grafana:up
GRAFANA_URL=http://localhost:3000 npm run store-assets
npm run grafana:down
```

`npm run icons` re-renders the extension icons from `extension/icons/icon.svg`.

## Microsoft Edge Add-ons (optional)

The same zip works in Edge. Registration at <https://partner.microsoft.com/dashboard/microsoftedge/> is free. Create a new extension, upload the zip and reuse the texts from `store/listing.md`.
