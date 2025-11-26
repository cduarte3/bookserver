const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { bucket } = require("../config/storage");
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.use(cookieParser());

router.post("/", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Missing required fields: email, password" });
  }

  try {
    // List all directories to find user by email
    const [files] = await bucket.getFiles();

    // Check each profile.json
    let userProfile = null;
    for (const file of files) {
      if (file.name.endsWith("profile.json")) {
        const [content] = await file.download();
        const profile = JSON.parse(content.toString());
        if (profile.email.toLowerCase() === email.toLowerCase()) {
          userProfile = profile;
          break;
        }
      }
    }

    if (!userProfile) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user has a password set
    if (!userProfile.password) {
      return res.status(400).json({
        message:
          "Account does not have a password set. Please log in with Google OAuth.",
      });
    }

    // Verify password
    const match = await bcrypt.compare(password, userProfile.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Generate token
    const token = jwt.sign({ id: userProfile.id }, process.env.SESSION_KEY, {
      expiresIn: "40d",
    });

    res
      .set("Authorization", `Bearer ${token}`)
      .status(200)
      .json({ id: userProfile.id, token: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

router.post("/google", async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res
      .status(400)
      .json({ message: "Missing required field: Google idToken" });
  }

  try {
    // Verify Google Token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const username = email.split("@")[0];

    // Truncate username to max 20 characters before processing
    const MAX_USERNAME_LENGTH = 20;
    if (username.length > MAX_USERNAME_LENGTH) {
      username = username.substring(0, MAX_USERNAME_LENGTH);
    }

    // List all directories to find user by email
    const [files] = await bucket.getFiles();

    // Check each profile.json
    let userProfile = null;
    const existingUsernames = new Set();

    for (const file of files) {
      if (file.name.endsWith("profile.json")) {
        const [content] = await file.download();
        const profile = JSON.parse(content.toString());

        // Keep track of usernames to avoid duplicates
        existingUsernames.add(profile.username.toLowerCase());

        if (profile.email.toLowerCase() === email.toLowerCase()) {
          userProfile = profile;
          break;
        }
      }
    }

    if (!userProfile) {
      // Make a unique username if necessary
      let uniqueUsername = username.toLowerCase();
      let counter = 1;

      while (existingUsernames.has(uniqueUsername)) {
        // Ensure uniqueUsername + counter doesn't exceed max length
        const counterStr = counter.toString();
        const baseLength = MAX_USERNAME_LENGTH - counterStr.length;
        const baseUsername = username.substring(0, baseLength);
        uniqueUsername = `${baseUsername.toLowerCase()}${counter}`;
        counter++;
      }

      // Create new user ID and hashed Password for new/missing user
      const userId = uuidv4();
      userProfile = {
        id: userId,
        email: email.toLowerCase(),
        username: uniqueUsername.toLowerCase(),
        googleId: payload.sub,
        created: new Date().toISOString(),
      };
      // Safe the new google profile to storage
      await bucket
        .file(`${userId}/profile.json`)
        .save(JSON.stringify(userProfile));
    }

    // Generate JWT auth token
    const token = jwt.sign({ id: userProfile.id }, process.env.SESSION_KEY, {
      expiresIn: "30d",
    });

    res
      .set("Authorization", `Bearer ${token}`)
      .status(200)
      .json({ id: userProfile.id, token: token });
  } catch (err) {
    console.error("Google OAuth error: ", err);
    res.status(401).json({ message: "Invalid Google Token" });
  }
});

function getToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return null;
}

function isAuthenticated(req) {
  const token = getToken(req);
  if (!token) return false;

  try {
    const decoded = jwt.verify(token, process.env.SESSION_KEY);
    req.user = decoded;
    return true;
  } catch (err) {
    return false;
  }
}

function isAuthorized(req) {
  if (!isAuthenticated(req)) return false;

  const requestedUserId = req.params.userid;
  const tokenUserId = req.user.id;

  return requestedUserId === tokenUserId;
}

module.exports = { router, isAuthenticated, isAuthorized };
