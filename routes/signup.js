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

  // Check lengths of username and password
  if (password.length < 6) {
    return res.status(401).json({
      message: "Password must be at least 6 characters",
    });
  }

  if (username.length < 3 || username.length > 20) {
    return res.status(402).json({
      message: "Username must be between 3 and 20 characters",
    });
  }

  try {
    // Check for existing email or username
    const emailLower = email.toLowerCase();
    const usernameLower = username.toLowerCase();

    const emailFile = bucket.file(`emails/${emailLower}.json`);
    const [emailExists] = await emailFile.exists();
    if (emailExists) {
      return res.status(408).json({
        message: "Email already in use",
      });
    }

    const usernameFile = bucket.file(`usernames/${usernameLower}.json`);
    const [usernameExists] = await usernameFile.exists();

    if (usernameExists) {
      return res.status(406).json({
        message: "Username already in use",
      });
    }

    // Create new user ID and hashed Password
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);

    const userData = {
      id: userId,
      email: emailLower,
      username: usernameLower,
      password: hashedPassword,
      created: new Date().toISOString(),
    };

    // Save user profile and parallel creds
    await Promise.all([
      emailFile.save(JSON.stringify({ userId })),
      usernameFile.save(JSON.stringify({ userId })),
      bucket.file(`${userId}/profile.json`).save(JSON.stringify(userData)),
    ]);

    // Return userId and token for navigation
    const token = jwt.sign({ id: userId }, process.env.SESSION_KEY, {
      expiresIn: "30d",
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
