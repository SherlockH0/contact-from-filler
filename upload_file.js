import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { authorize } from "./drive_auth.js";

export async function uploadFile(file, mimeType) {
  const auth = await authorize();
  return new Promise((resolve, rejected) => {
    const drive = google.drive({
      version: "v3",
      auth,
    });
    var fileMetadata = {
      name: path.basename(file),
      parents: ["1emWB4ZygJyHc9IpJC8_wr2F9nuPqxrOJ"],
    };
    drive.files.create(
      {
        resource: fileMetadata,
        media: {
          body: fs.createReadStream(file),
          mimeType,
        },
        fields: "id",
      },
      function (err, file) {
        if (err) {
          rejected(err);
        } else {
          resolve(file.data.id);
        }
      },
    );
  });
}
