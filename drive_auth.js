import fs from "fs";
import { google } from "googleapis";

export const CREDENTIALS_PATH = "./credentials.json";
export const TOKEN_PATH = "./token.json";

export async function authorize() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0],
  );
  oAuth2Client.on("tokens", (tokens) => {
    if (tokens.refresh_token) {
      fs.writeFileSync(
        TOKEN_PATH,
        JSON.stringify({
          ...tokens,
          ...credentials.installed,
        }),
      );
    }
  });

  // Token already exists → reuse it
  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    return oAuth2Client;
  }
  throw new Error(
    "No Google Drive token found. Please run the auth.js script.",
  );
}
