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

type Vec2 = { x: number; y: number };

type PlayerState = {
  username: string;
  x: number;
  y: number;
  xp: number;
  gold: number;
};

type Section = {
  key: string;
  center: Vec2;
  enemyIds: string[];
};

type EnemyState = {
  id: string;
  sectionKey: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  isAlive: boolean;
};

const PORT = Number(process.env.PORT ?? 3000);
const MASTER_PASSCODE = process.env.MASTER_PASSCODE ?? "family-server-123";
const JWT_SECRET = process.env.JWT_SECRET ?? "change-this-secret";

const WORLD_LIMIT = 1000;
const SECTION_SIZE = 200;
const SECTION_ACTIVATION_DISTANCE = 300;
const MIN_PLAYERS = 1;
const MAX_PLAYERS = 25;
const MAX_MOVE_PER_REQUEST = 60;
const ATTACK_RANGE = 20;
const ATTACK_DAMAGE = 25;
const KILL_XP_REWARD = 25;
const KILL_GOLD_REWARD = 10;
const ENEMY_RESPAWN_MS = 10000;

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

const players = new Map<string, PlayerState>();
const sections = new Map<string, Section>();
const enemies = new Map<string, EnemyState>();

function toSectionKey(gridX: number, gridY: number): string {
  return `${gridX}:${gridY}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function createWorld(): void {
  const minGrid = Math.floor(-WORLD_LIMIT / SECTION_SIZE);
  const maxGrid = Math.floor(WORLD_LIMIT / SECTION_SIZE);
  let enemyCounter = 1;

  for (let gx = minGrid; gx <= maxGrid; gx += 1) {
    for (let gy = minGrid; gy <= maxGrid; gy += 1) {
      const key = toSectionKey(gx, gy);
      const center = {
        x: gx * SECTION_SIZE + SECTION_SIZE / 2,
        y: gy * SECTION_SIZE + SECTION_SIZE / 2
      };
      const section: Section = { key, center, enemyIds: [] };
      sections.set(key, section);

      // Two starter enemies per section for Sprint 2 testing.
      for (let i = 0; i < 2; i += 1) {
        const enemyId = `enemy-${enemyCounter}`;
        enemyCounter += 1;
        const offsetX = (Math.random() - 0.5) * (SECTION_SIZE * 0.6);
        const offsetY = (Math.random() - 0.5) * (SECTION_SIZE * 0.6);

        const enemy: EnemyState = {
          id: enemyId,
          sectionKey: key,
          x: clamp(center.x + offsetX, -WORLD_LIMIT, WORLD_LIMIT),
          y: clamp(center.y + offsetY, -WORLD_LIMIT, WORLD_LIMIT),
          health: 100,
          maxHealth: 100,
          isAlive: true
        };
        enemies.set(enemy.id, enemy);
        section.enemyIds.push(enemy.id);
      }
    }
  }
}

createWorld();

function getOrCreatePlayer(username: string): PlayerState {
  const existing = players.get(username);
  if (existing) {
    return existing;
  }

  const created: PlayerState = { username, x: 0, y: 0, xp: 0, gold: 0 };
  players.set(username, created);
  return created;
}

function getPlayerActiveSectionKeys(player: PlayerState): string[] {
  const active: string[] = [];
  for (const section of sections.values()) {
    if (distance({ x: player.x, y: player.y }, section.center) <= SECTION_ACTIVATION_DISTANCE) {
      active.push(section.key);
    }
  }
  return active;
}

function getGlobalActiveSectionKeys(): Set<string> {
  const keys = new Set<string>();
  for (const player of players.values()) {
    const activeForPlayer = getPlayerActiveSectionKeys(player);
    activeForPlayer.forEach((key) => keys.add(key));
  }
  return keys;
}

function getVisibleEnemies(activeSectionKeys: string[]): EnemyState[] {
  const activeSet = new Set(activeSectionKeys);
  const visible: EnemyState[] = [];

  for (const enemy of enemies.values()) {
    if (!enemy.isAlive) {
      continue;
    }
    if (!activeSet.has(enemy.sectionKey)) {
      continue;
    }
    visible.push(enemy);
  }

  return visible;
}

function buildWorldState(username: string): {
  player: PlayerState;
  activeSections: string[];
  enemies: EnemyState[];
} {
  const player = getOrCreatePlayer(username);
  const activeSections = getPlayerActiveSectionKeys(player);
  return {
    player,
    activeSections,
    enemies: getVisibleEnemies(activeSections)
  };
}

function respawnEnemy(enemyId: string): void {
  const enemy = enemies.get(enemyId);
  if (!enemy) {
    return;
  }
  const section = sections.get(enemy.sectionKey);
  if (!section) {
    return;
  }

  const offsetX = (Math.random() - 0.5) * (SECTION_SIZE * 0.6);
  const offsetY = (Math.random() - 0.5) * (SECTION_SIZE * 0.6);
  enemy.x = clamp(section.center.x + offsetX, -WORLD_LIMIT, WORLD_LIMIT);
  enemy.y = clamp(section.center.y + offsetY, -WORLD_LIMIT, WORLD_LIMIT);
  enemy.health = enemy.maxHealth;
  enemy.isAlive = true;
}

function tickActiveEnemies(): void {
  const activeSections = getGlobalActiveSectionKeys();
  if (activeSections.size === 0) {
    return;
  }

  for (const enemy of enemies.values()) {
    if (!enemy.isAlive) {
      continue;
    }
    if (!activeSections.has(enemy.sectionKey)) {
      continue;
    }

    // Sprint 2 movement: enemies drift a little only in active sections.
    enemy.x = clamp(enemy.x + (Math.random() - 0.5) * 8, -WORLD_LIMIT, WORLD_LIMIT);
    enemy.y = clamp(enemy.y + (Math.random() - 0.5) * 8, -WORLD_LIMIT, WORLD_LIMIT);
  }
}

setInterval(() => {
  tickActiveEnemies();
}, 1000);

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

app.post("/api/world/join", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const isNewJoin = !players.has(username);
  if (isNewJoin && players.size >= MAX_PLAYERS) {
    res.status(403).json({
      error: `World is full. Supports ${MIN_PLAYERS}-${MAX_PLAYERS} players.`
    });
    return;
  }

  const player = getOrCreatePlayer(username);
  const requestedX = Number(req.body?.x);
  const requestedY = Number(req.body?.y);
  if (Number.isFinite(requestedX) && Number.isFinite(requestedY)) {
    player.x = clamp(requestedX, -WORLD_LIMIT, WORLD_LIMIT);
    player.y = clamp(requestedY, -WORLD_LIMIT, WORLD_LIMIT);
  }

  const state = buildWorldState(username);
  res.json({
    message: "Joined world",
    limits: {
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      currentPlayers: players.size
    },
    ...state
  });
});

app.get("/api/world/state", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json(buildWorldState(username));
});

app.post("/api/world/move", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const player = getOrCreatePlayer(username);
  const nextX = Number(req.body?.x);
  const nextY = Number(req.body?.y);

  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
    res.status(400).json({ error: "x and y must be numbers" });
    return;
  }

  const moveDistance = distance({ x: player.x, y: player.y }, { x: nextX, y: nextY });
  if (moveDistance > MAX_MOVE_PER_REQUEST) {
    res.status(400).json({
      error: `Move too large. Max allowed per request is ${MAX_MOVE_PER_REQUEST} feet.`
    });
    return;
  }

  player.x = clamp(nextX, -WORLD_LIMIT, WORLD_LIMIT);
  player.y = clamp(nextY, -WORLD_LIMIT, WORLD_LIMIT);
  res.json({ message: "Move accepted", ...buildWorldState(username) });
});

app.post("/api/combat/attack", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const player = getOrCreatePlayer(username);
  const enemyId = String(req.body?.enemyId ?? "");
  if (!enemyId) {
    res.status(400).json({ error: "enemyId is required" });
    return;
  }

  const enemy = enemies.get(enemyId);
  if (!enemy || !enemy.isAlive) {
    res.status(404).json({ error: "Enemy not found or already defeated" });
    return;
  }

  const range = distance({ x: player.x, y: player.y }, { x: enemy.x, y: enemy.y });
  if (range > ATTACK_RANGE) {
    res.status(400).json({
      error: `Enemy is out of range. Move closer than ${ATTACK_RANGE} feet.`
    });
    return;
  }

  enemy.health = Math.max(0, enemy.health - ATTACK_DAMAGE);
  let defeated = false;
  if (enemy.health === 0) {
    defeated = true;
    enemy.isAlive = false;
    player.xp += KILL_XP_REWARD;
    player.gold += KILL_GOLD_REWARD;

    setTimeout(() => {
      respawnEnemy(enemy.id);
    }, ENEMY_RESPAWN_MS);
  }

  res.json({
    message: defeated ? "Enemy defeated" : "Hit landed",
    combat: {
      enemyId: enemy.id,
      enemyHealth: enemy.health,
      damage: ATTACK_DAMAGE,
      defeated,
      rewards: defeated ? { xp: KILL_XP_REWARD, gold: KILL_GOLD_REWARD } : null
    },
    ...buildWorldState(username)
  });
});

app.listen(PORT, () => {
  console.log(`Sprint 2 server running at http://localhost:${PORT}`);
  console.log("Health check: GET /api/health");
  console.log("Join world: POST /api/world/join");
});
