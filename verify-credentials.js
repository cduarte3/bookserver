const { Storage } = require("@google-cloud/storage");
const path = require("path");

async function verifyCredentials() {
  try {
    const storage = new Storage({
      keyFilename: path.join(__dirname, "config", "service-account-key.json"),
    });

    // Test bucket access
    const bucketName = "staging.chapterchat.appspot.com";
    const [bucket] = await storage.bucket(bucketName).exists();

    if (!bucket) {
      console.error("❌ Bucket not found or no access");
      return false;
    }

    // Test file operations
    const testFile = storage.bucket(bucketName).file("test-permissions.txt");
    await testFile.save("test");
    await testFile.delete();

    console.log("✅ Service account verification successful:");
    console.log("- Bucket access: OK");
    console.log("- Write permissions: OK");
    console.log("- Delete permissions: OK");
    return true;
  } catch (error) {
    console.error("❌ Service account verification failed:", error.message);
    return false;
  }
}

verifyCredentials();
