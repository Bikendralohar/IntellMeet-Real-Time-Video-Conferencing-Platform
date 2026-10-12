const crypto = require("crypto");
global.crypto = crypto;

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");

const connectDB = require("./src/config/db");
const authRoutes = require("./src/routes/authRoutes");
const meetingRoutes = require("./src/routes/meetingRoutes");
const socketHandler = require("./src/socket/socketHandler");

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// Allowed frontend origins (keep deployed Vercel URL; allow local Vite for development)
const allowedOrigins = [
  "https://intellmeet-ai-chat-git-main-bikendras-projects-b5ab54a1.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
};

// Socket.io
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(cors(corsOptions));

app.use(helmet());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/meetings", meetingRoutes);

// Test route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "IntellMeet Backend is Running 🚀",
  });
});

// Socket handler
socketHandler(io);

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});