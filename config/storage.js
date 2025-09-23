require("dotenv").config();
const { Storage } = require("@google-cloud/storage");
const fs = require("fs");
const path = require("path");

// Read encoded credentials from file
const encodedKeyPath = path.join(__dirname, "encoded-key.txt");
const encodedCredentials = fs.readFileSync(encodedKeyPath, "utf8").trim();

// Create storage instance with credentials
const storage = new Storage({
  projectId: "chapterchat",
  credentials: JSON.parse(Buffer.from(encodedCredentials, "base64").toString()),
});

const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME);

module.exports = { bucket };
