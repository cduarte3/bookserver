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

    // Find user directory containing profile.json
    const userFile = files.find((file) => file.name.endsWith("profile.json"));

    if (userFile) {
      // Download and parse profile
      const [content] = await userFile.download();
      const user = JSON.parse(content.toString());

      // Verify email matches
      if (user.email.toLowerCase() === email.toLowerCase()) {
        const match = await bcrypt.compare(password, user.password);
        if (match) {
          const token = jwt.sign({ id: user.id }, process.env.SESSION_KEY, {
            expiresIn: "1h",
          });

          res
            .set("Authorization", `Bearer ${token}`)
            .status(200)
            .json({ id: user.id, token: token });
        } else {
          res.status(401).json({ message: "Invalid password" });
        }
      } else {
        res.status(404).json({ message: "User not found" });
      }
    } else {
      res.status(404).json({ message: "User not found" });
    }
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

module.exports = { router, isAuthenticated };
