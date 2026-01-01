import fs from "fs";
import readline from "readline";
import { google } from "googleapis";
import { TOKEN_PATH, CREDENTIALS_PATH } from "./drive_auth.js";

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

function main() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0],
  );
  if (fs.existsSync(TOKEN_PATH)) {
    console.log("Token already exists");
    return;
  }

  // First-time auth
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("Authorize this app by visiting:\n", authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("\nPaste the code here: ", async (code) => {
    try {
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);

      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      console.log("Token saved to", TOKEN_PATH);
    } catch (err) {
      throw err;
    } finally {
      rl.close();
    }
  });
}
if (import.meta.main) {
  main();
}
