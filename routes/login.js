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
    // Find user by email
    const emailLower = email.toLowerCase();

    // Faster, updated email search
    const emailFile = bucket.file(`emails/${emailLower}.json`);
    const [emailExists] = await emailFile.exists();

    if (!emailExists) {
      return res.status(404).json({ message: "Email not found" });
    }

    // Find user profile by userId from email
    const [emailContent] = await emailFile.download();
    const { userId } = JSON.parse(emailContent.toString());

    const profileFile = bucket.file(`${userId}/profile.json`);
    const [content] = await profileFile.download();
    const userProfile = JSON.parse(content.toString());

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
      expiresIn: "30d",
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

    // Faster, updated email search
    const emailFile = bucket.file(`emails/${emailLower}.json`);
    const [emailExists] = await emailFile.exists();

    if (emailExists) {
      const [emailContent] = await emailFile.download();
      const { userId } = JSON.parse(emailContent.toString());

      const profileFile = bucket.file(`${userId}/profile.json`);
      const [content] = await profileFile.download();
      const userProfile = JSON.parse(content.toString());

      // Generate JWT auth token
      const token = jwt.sign({ id: userProfile.id }, process.env.SESSION_KEY, {
        expiresIn: "30d",
      });

      return res
        .set("Authorization", `Bearer ${token}`)
        .status(200)
        .json({ id: userProfile.id, token: token });
    }

    // New User Registration Flow
    let uniqueUsername = username.toLowerCase();
    let counter = 1;

    // New, faster username search
    let usernameFile = bucket.file(`usernames/${uniqueUsername}.json`);
    let [usernameExists] = await usernameFile.exists();

    while (usernameExists) {
      const counterStr = counter.toString();
      const baseLength = MAX_USERNAME_LENGTH - counterStr.length;
      const baseUsername = username.substring(0, baseLength);
      uniqueUsername = `${baseUsername.toLowerCase()}${counter}`;

      usernameFile = bucket.file(`usernames/${uniqueUsername}.json`);
      [usernameExists] = await usernameFile.exists();
      counter++;
    }

    // Create new user ID and hashed Password for new/missing user
    const userId = uuidv4();
    const userData = {
      id: userId,
      email: emailLower,
      username: uniqueUsername,
      googleId: payload.sub,
      created: new Date().toISOString(),
    };
    // Save the new user profile and parallel creds
    await Promise.all([
      emailFile.save(JSON.stringify({ userId })),
      usernameFile.save(JSON.stringify({ userId })),
      bucket.file(`${userId}/profile.json`).save(JSON.stringify(userData)),
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
