const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const { bucket } = require("../config/storage");

router.post("/", async (req, res) => {
  const { email, username, password } = req.body;

  // Validate input
  if (!email || !username || !password) {
    return res.status(400).json({
      message: "Missing required fields: email, username, password",
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      message: "Password must be at least 6 characters",
    });
  }

  try {
    // Create new user ID first
    const userId = uuidv4();

    // Check if username or email exists in any user profile
    const [files] = await bucket.getFiles({ prefix: userId });
    const existingUser = files.some((file) => {
      const profile = JSON.parse(file.metadata);
      return profile.email === email || profile.username === username;
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email or Username already in use",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userData = {
      id: userId,
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      password: hashedPassword,
      created: new Date().toISOString(),
    };

    // Save user profile in their directory
    await bucket.file(`${userId}/profile.json`).save(JSON.stringify(userData));

    // Return userId for navigation
    res.status(200).json(userId);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error during signup",
    });
  }
});

module.exports = router;
