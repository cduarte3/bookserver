require("dotenv").config();
const { Storage } = require("@google-cloud/storage");
const fs = require("fs");
const path = require("path");

let credentials = null;
const encodedDeploymentCredentials = process.env.GCS_CREDENTIALS_JSON_BASE64;

if (encodedDeploymentCredentials) {
  console.log("Using GCS credentials from secure environment variable.");
  const credentialsJson = Buffer.from(
    encodedDeploymentCredentials,
    "base64"
  ).toString();
  credentials = JSON.parse(credentialsJson);
} else {
  console.log("Using GCS credentials from local file (local development).");
  try {
    // Read encoded credentials from file
    const encodedKeyPath = path.join(__dirname, "encoded-key.txt");
    const encodedCredentials = fs.readFileSync(encodedKeyPath, "utf8").trim();

    credentials = JSON.parse(
      Buffer.from(encodedCredentials, "base64").toString()
    );
  } catch (err) {
    console.error(
      "ERROR: Failed to read local encoded-key.txt. Check file path and contents."
    );
    throw err;
  }
}

// Create storage instance with credentials
const storage = new Storage({
  projectId: "chapterchat",
  credentials: credentials,
});

const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME);

module.exports = { bucket };
