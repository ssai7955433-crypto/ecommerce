import express from "express";
import helmet from "helmet";

const app = express();

app.use(helmet());

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    message: "Backend is running",
  });
});

export default app;