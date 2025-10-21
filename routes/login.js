const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { bucket } = require("../config/storage");

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
