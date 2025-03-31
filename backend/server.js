const express = require("express");
const dotenv = require("dotenv");
const transitRoutes = require("./routes/transitRoutes");

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 5000;

// Middleware to parse JSON requests
app.use(express.json());

// Correctly register the transit routes under "/api"
app.use("/api", transitRoutes);  // <-- Corrected

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
