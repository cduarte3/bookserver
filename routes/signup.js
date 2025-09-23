const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const { bucket } = require("../config/storage");
const jwt = require("jsonwebtoken");

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
    const [files] = await bucket.getFiles();
    const profileFiles = files.filter((file) =>
      file.name.endsWith("/profile.json")
    );

    for (const file of profileFiles) {
      try {
        const [content] = await file.download();
        const profile = JSON.parse(content.toString());
        if (
          profile.email.toLowerCase() === email.toLowerCase() ||
          profile.username.toLowerCase() === username.toLowerCase()
        ) {
          return res.status(409).json({
            message: "Email or Username already in use",
          });
        }
      } catch (parseError) {
        // Skip files that can't be parsed
        continue;
      }
    }

    // Create new user ID and hashed Password
    const userId = uuidv4();
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

    // Return userId and token for navigation
    const token = jwt.sign({ id: userId }, process.env.SESSION_KEY, {
      expiresIn: "1h",
    });

    // Return status 201 for creation(s)
    res.status(201).json({ id: userId, token: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error during signup",
    });
  }
});

module.exports = router;
