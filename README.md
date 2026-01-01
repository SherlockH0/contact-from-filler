# contact-from-filler

## Example .env

```bash
OPENAI_API_KEY=
OPENAI_URL=
HEADLESS=false
PROXY_URL=
PROXY_PASSWORD=
PROXY_USERNAME=
TWOCAPTCHA_TOKEN=
```

## Authentication Setup

Before you can upload files to Google Drive using this project, you need to
authorize the app to access your Google Drive account. This involves running
the authentication script once to generate and save an OAuth token.

### Google Cloud Project & OAuth Credentials

- Create a Google Cloud project in the [Google Cloud Console](https://console.cloud.google.com/).
- Enable the **Google Drive API** for your project.
- Create OAuth 2.0 credentials (type: "Desktop app") in the Credentials section.
- Download the credentials JSON file and save it as `credentials.json` in
  the project root.

### How to Run the Authentication Script

Run the following command in your terminal:

```bash
node auth.js
```

This script will:

- Read your OAuth client credentials from `credentials.json`.
- Generate a consent URL and print it to the console.
- Ask you to visit the URL, authorize the app, and copy the authorization code
  from the URL.
- Paste the code back into the terminal.
- Exchange the authorization code for access and refresh tokens.
- Save the tokens to `token.json` for reuse.

Once completed, the app will be authorized to upload files to your Google Drive.

