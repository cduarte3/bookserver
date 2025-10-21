require("dotenv").config();
const { Storage } = require("@google-cloud/storage");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

let options = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || "chapterchat",
};

const encodedKeyPath = path.join(__dirname, "encoded-key.txt");
if (process.env.GOOGLE_CLOUD_KEY_BASE64 || fs.existsSync(encodedKeyPath)) {
  console.log(
    "Using explicit credentials from file/env for Google Cloud Storage."
  );
  const encodedCredentials =
    process.env.GOOGLE_CLOUD_KEY_BASE64 ||
    fs.readFileSync(encodedKeyPath, "utf8").trim();
  options.credentials = JSON.parse(
    Buffer.from(encodedCredentials, "base64").toString()
  );
} else {
  console.log(
    "Using default application credentials (App Engine service account)."
  );
}

const storage = new Storage(options);
const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME);

module.exports = { bucket };
