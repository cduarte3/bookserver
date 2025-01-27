const express = require("express");
const router = express.Router();
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const { bucket } = require("../config/storage");

// get the info of a user by ID
router.get("/:userid", async (req, res) => {
  const userId = req.params.userid;

  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    // Get user profile
    const profileFile = bucket.file(`${userId}/profile.json`);
    const [exists] = await profileFile.exists();

    if (!exists) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get user profile data
    const [profileContent] = await profileFile.download();
    const userData = JSON.parse(profileContent.toString());

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
    const [files] = await bucket.getFiles();
    const existingUser = files.some((file) => {
      const content = JSON.parse(file.metadata);
      return content.email === email || content.username === username;
    });

    if (existingUser) {
      res.status(409).json({ message: "Email or Username already exists" });
    } else {
      res.status(200).json({ message: "" });
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
    const [exists] = await bucket.file(`${userid}/profile.json`).exists();
    if (!exists) {
      return res.status(404).json({ message: "User not found" });
    }

    const bookId = uuidv4();
    const bookData = {
      id: bookId,
      author,
      title,
      review,
      rating,
      cover,
      genre,
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
    const profileFile = bucket.file(`${userid}/profile.json`);
    const [exists] = await profileFile.exists();

    if (!exists) {
      return res.status(404).json({ message: "User not found" });
    }

    const [content] = await profileFile.download();
    const userData = JSON.parse(content.toString());

    if (email) userData.email = email;
    if (username) userData.username = username;
    if (password) {
      userData.password = await bcrypt.hash(password, 10);
    }

    await profileFile.save(JSON.stringify(userData));
    res.status(200).json({ message: "User updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
