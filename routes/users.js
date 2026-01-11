const express = require("express");
const router = express.Router();
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const { bucket } = require("../config/storage");
const User = require("../models/User");

// get the info of a user by ID
router.get("/:userid", async (req, res) => {
  const userId = req.params.userid;

  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    // Check for GCS user id
    const profileFile = bucket.file(`${userId}/.placeholder`);
    const [exists] = await profileFile.exists();
    // Check for MongoDB user credentials
    const user = await User.findOne({ id: userId });

    if (!user || !exists) {
      return res
        .status(404)
        .json({ message: "User or user profile not found" });
    }

    // Get user profile data
    const userData = user.toObject();

    // Get all books from user's directory
    const [files] = await bucket.getFiles({ prefix: `${userId}/books/` });
    const books = await Promise.all(
      files.map(async (file) => {
        const [content] = await file.download();
        return JSON.parse(content.toString());
      })
    );

    // Combine profile and books
    const userWithBooks = {
      ...userData,
      books: books,
    };

    // Remove sensitive data
    const { password, ...userResponse } = userWithBooks;
    res.status(200).json(userResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// check if username or email exists in the system
router.get("/:email/:username", async (req, res) => {
  const { email, username } = req.params;

  try {
    const emailLower = email.toLowerCase();
    const usernameLower = username.toLowerCase();

    // New, faster user search
    const emailFound = await User.findOne({ email: emailLower });
    const usernameFound = await User.findOne({ username: usernameLower });

    if (emailFound || usernameFound) {
      return res
        .status(409)
        .json({ message: "Email or Username already exists" });
    } else {
      return res.status(200).json({ message: "" });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// post a review for a book by user ID
router.post("/:userid", async (req, res) => {
  const { userid } = req.params;
  const { author, title, review, rating, cover, genre } = req.body;

  try {
    // Verify user exists
    const [exists] = await bucket.file(`${userid}/.placeholder`).exists();
    if (!exists) {
      return res.status(404).json({ message: "User not found" });
    }

    const bookId = uuidv4();
    const currentDate = new Date().toISOString();

    const bookData = {
      id: bookId,
      author,
      title,
      review,
      rating,
      cover,
      genre,
      dateAdded: currentDate,
      lastUpdated: currentDate,
    };

    // Save book data
    await bucket
      .file(`${userid}/books/${bookId}.json`)
      .save(JSON.stringify(bookData));

    res.status(200).json({
      message: "Book added to shelf!",
      bookId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// update/edit a book's information
router.post(
  "/:userid/book/:bookId/edit",
  upload.single("cover"),
  async (req, res) => {
    const { userid, bookId } = req.params;
    const { author, title, review, rating, cover, genre } = req.body;

    try {
      // Create bookFile reference
      const bookFile = bucket.file(`${userid}/books/${bookId}.json`);
      const [exists] = await bookFile.exists();

      if (!exists) {
        return res.status(404).json({ message: "Book not found" });
      }

      // Download existing book data
      const [content] = await bookFile.download();
      const bookData = JSON.parse(content.toString());

      // Update book data
      const updatedBook = {
        ...bookData,
        author: author || bookData.author,
        title: title || bookData.title,
        review: review || bookData.review,
        rating: rating || bookData.rating,
        cover: cover || bookData.cover,
        genre: genre || bookData.genre,
        lastUpdated: new Date().toISOString(),
      };

      // Save updated book data
      await bookFile.save(JSON.stringify(updatedBook));

      res.status(200).json({
        message: "Book updated successfully",
        book: updatedBook,
      });
    } catch (err) {
      console.error("Book update error:", err);
      res.status(500).json({
        message: "Failed to update book",
        error: err.message,
      });
    }
  }
);

// get book information
router.get("/:userid/book/:bookId", async (req, res) => {
  const { userid, bookId } = req.params;

  try {
    const bookFile = bucket.file(`${userid}/books/${bookId}.json`);
    const [exists] = await bookFile.exists();

    if (!exists) {
      return res.status(404).json({ message: "Book not found" });
    }

    const [content] = await bookFile.download();
    const bookData = JSON.parse(content.toString());

    res.status(200).json(bookData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// delete a book by user ID and book ID
router.delete("/:userid/book/:bookId", async (req, res) => {
  const { userid, bookId } = req.params;

  try {
    const bookFile = bucket.file(`${userid}/books/${bookId}.json`);
    const [exists] = await bookFile.exists();

    if (!exists) {
      return res.status(404).json({ message: "Book not found" });
    }

    await bookFile.delete();
    res.status(200).json({ message: "Book deleted from shelf!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// update the changes to the user profile
router.post("/:userid/update", async (req, res) => {
  const { userid } = req.params;
  const { email, username, password } = req.body;

  try {
    const user = await User.findOne({ id: userid });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if username is being changed and if it's already taken
    if (username && username.toLowerCase() !== user.username.toLowerCase()) {
      // Validate username length
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({
          message: "Username must be between 3 and 20 characters",
        });
      }

      // New, faster username check
      const usernameFound = await User.findOne({
        username: username.toLowerCase(),
      });

      if (usernameFound) {
        return res.status(409).json({
          message: "Username already in use",
        });
      }
      // Set username value
      user.username = username;
    }

    if (email && user.googleId) {
      return res.status(401).json({
        message: "Cannot change email for Google OAuth users",
      });
    }

    // Check if email is being changed and if it's already taken
    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      // New, faster email check
      const emailFound = await User.findOne({ email: email.toLowerCase() });

      if (emailFound) {
        return res.status(408).json({
          message: "Email already in use",
        });
      }
      // Set email value
      user.email = email;
    }

    // Update user data
    if (password) {
      if (password.length < 6) {
        return res.status(407).json({
          message: "Password must be at least 6 characters",
        });
      }
      user.password = await bcrypt.hash(password, 10);
    }
    user.lastUpdated = new Date();

    await user.save();
    res.status(200).json({ message: "User updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
