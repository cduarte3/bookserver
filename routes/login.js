const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { bucket } = require("../config/storage");
const User = require("../models/user");
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
    // Find user by email
    const emailLower = email.toLowerCase();
    const user = await User.findOne({ email: emailLower });

    // Faster, updated email search
    if (!user) {
      return res.status(404).json({ message: "Email not found" });
    }

    if (!user.password) {
      return res.status(400).json({
        message:
          "Account does not have a password set. Please sign in with Google OAuth.",
      });
    }

    // Verify password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Generate token
    const token = jwt.sign({ id: user.id }, process.env.SESSION_KEY, {
      expiresIn: "30d",
    });

    res
      .set("Authorization", `Bearer ${token}`)
      .status(200)
      .json({ id: user.id, token: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

router.post("/google", async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res
      .status(402)
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

    // Find user by email
    const emailLower = email.toLowerCase();
    let user = await User.findOne({ email: emailLower });

    if (user) {
      // Generate JWT auth token
      const token = jwt.sign({ id: user.id }, process.env.SESSION_KEY, {
        expiresIn: "30d",
      });

      return res
        .set("Authorization", `Bearer ${token}`)
        .status(200)
        .json({ id: user.id, token: token });
    }

    // New User Registration Flow
    let uniqueUsername = username.toLowerCase();
    let counter = 1;

    // New, faster username search with MongoDB
    while (await User.findOne({ username: uniqueUsername })) {
      const counterStr = counter.toString();
      const baseLength = MAX_USERNAME_LENGTH - counterStr.length;
      const baseUsername = username.substring(0, baseLength);
      uniqueUsername = `${baseUsername.toLowerCase()}${counter}`;
      counter++;
    }

    // Create new user ID and hashed Password for new/missing user
    const userId = uuidv4();
    user = new User({
      id: userId,
      email: emailLower,
      username: uniqueUsername,
      googleId: payload.sub,
      created: new Date(),
    });
    // Save the new user profile
    await Promise.all([
      user.save(),
      bucket.file(`${userId}/.placeholder`).save(""),
    ]);

    // Generate JWT auth token
    const token = jwt.sign({ id: userId }, process.env.SESSION_KEY, {
      expiresIn: "30d",
    });

    // Return status 201 for creation(s)
    res.status(201).json({ id: userId, token: token });
  } catch (err) {
    console.error("Google OAuth error: ", err);
    res.status(402).json({ message: "Invalid Google Token" });
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
