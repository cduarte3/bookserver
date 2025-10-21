require("dotenv").config();

const express = require("express");
const cors = require("cors");
const app = express();
const {
  router: loginRoute,
  isAuthenticated,
  isAuthorized,
} = require("./routes/login");
const { bucket } = require("./config/storage");

// Initialize GCS connection
async function initializeStorage() {
  try {
    const [exists] = await bucket.exists();
    console.log("Connected to Google Cloud Storage");
    return true;
  } catch (err) {
    console.error("Failed to connect to Google Cloud Storage:", err);
    return false;
  }
}

// Initialize server
async function startServer() {
  const storageConnected = await initializeStorage();
  if (!storageConnected) {
    process.exit(1);
  }

  const envAllowedOrigins = process.env.ALLOWED_ORIGINS || "";

  let allowedOrigins = ["http://localhost:3000"];

  if (envAllowedOrigins) {
    const configuredOrigins = envAllowedOrigins.split(",").map((s) => s.trim());
    allowedOrigins = allowedOrigins.concat(configuredOrigins);
  }

  const corsOptions = {
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
    exposedHeaders: ["Authorization"],
    optionsSuccessStatus: 200,
  };

  // Apply CORS before other middleware
  app.use(cors(corsOptions));

  // Handle preflight requests
  app.options("*", cors(corsOptions));
  app.use(express.json());

  // Add error handling middleware
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: "Internal Server Error" });
  });

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  function authCheck(req, res, next) {
    const PUBLIC_PATHS = ["/", "/health", "/login", "/signup"];
    const READ_ONLY_PATHS = ["/users"];
    const path = req.path;
    const method = req.method;

    if (PUBLIC_PATHS.includes(path)) {
      return next();
    }

    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (method === "GET" && path.startsWith("/users/")) {
      return next();
    }

    if (
      req.params.userid &&
      (method === "POST" || method === "PUT" || method === "DELETE")
    ) {
      if (!isAuthorized(req)) {
        return res.status(403).json({
          message: "Forbidden: You can only modify your own resources",
        });
      }
    }

    next();
  }

  app.use(authCheck);
  app.use("/users", require("./routes/users"));
  app.use("/login", loginRoute);
  app.use("/signup", require("./routes/signup"));

  const port = process.env.PORT || 8080;
  const server = app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM signal received. Closing server.");
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
