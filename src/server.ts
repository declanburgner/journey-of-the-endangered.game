import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import path from "path";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

type UserRecord = {
  username: string;
  passwordHash: string;
};

const PORT = Number(process.env.PORT ?? 3000);
const MASTER_PASSCODE = process.env.MASTER_PASSCODE ?? "family-server-123";
const JWT_SECRET = process.env.JWT_SECRET ?? "change-this-secret";

const rawUsers = [
  {
    username: process.env.TEST_USER_1_NAME ?? "alice",
    password: process.env.TEST_USER_1_PASSWORD ?? "alice-pass"
  },
  {
    username: process.env.TEST_USER_2_NAME ?? "bob",
    password: process.env.TEST_USER_2_PASSWORD ?? "bob-pass"
  }
];

// Sprint 1 seed users are hashed in memory at startup.
const users: UserRecord[] = rawUsers.map((u) => ({
  username: u.username,
  passwordHash: bcrypt.hashSync(u.password, 10)
}));

type AuthRequest = Request & { user?: { username: string } };

function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
    req.user = { username: decoded.username };
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, message: "Server is running" });
});

app.post("/api/auth/login", async (req: Request, res: Response) => {
  const { masterPasscode, username, password } = req.body as {
    masterPasscode?: string;
    username?: string;
    password?: string;
  };

  if (!masterPasscode || !username || !password) {
    res.status(400).json({ error: "masterPasscode, username, and password are required" });
    return;
  }

  if (masterPasscode !== MASTER_PASSCODE) {
    res.status(401).json({ error: "Master passcode is incorrect" });
    return;
  }

  const user = users.find((u) => u.username === username);
  if (!user) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: "2h" });
  res.json({ token, username: user.username, message: "Login successful" });
});

app.get("/api/main", requireAuth, (req: AuthRequest, res: Response) => {
  res.json({
    message: `Welcome ${req.user?.username}. You reached the main page.`,
    actions: ["Start Game", "News"]
  });
});

app.listen(PORT, () => {
  console.log(`Sprint 1 server running at http://localhost:${PORT}`);
  console.log("Health check: GET /api/health");
});
