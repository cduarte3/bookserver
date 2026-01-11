const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    minlength: 3,
    maxlength: 20,
  },
  password: {
    type: String,
  },
  googleId: {
    type: String,
    // Only for Google OAuth users
  },
  created: {
    type: Date,
    default: Date.now,
  },
  lastUpdated: {
    type: Date,
  },
});

module.exports = mongoose.model("User", userSchema);
