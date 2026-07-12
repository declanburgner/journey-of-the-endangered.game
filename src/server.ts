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

type UserRole = "admin" | "player";

type Vec2 = { x: number; y: number };

type PlayerState = {
  username: string;
  x: number;
  y: number;
  xp: number;
  gold: number;
  groupId: string | null;
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

type BossState = {
  id: string;
  name: string;
  structureName: string;
  sectionKey: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  isAlive: boolean;
  respawnMs: number;
  triggerX: number;
  triggerY: number;
};

type GroupState = {
  id: string;
  leader: string;
  members: string[];
};

type NewsPost = {
  id: string;
  title: string;
  body: string;
  author: string;
  timestamp: number;
};

type ReportEvent = {
  id: string;
  reporter: string;
  reportedUser: string;
  reason: string;
  source: "bug" | "player";
  timestamp: number;
};

const PORT = Number(process.env.PORT ?? 3000);
const MASTER_PASSCODE = process.env.MASTER_PASSCODE ?? "family-server-123";
const JWT_SECRET = process.env.JWT_SECRET ?? "change-this-secret";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? (process.env.TEST_USER_1_NAME ?? "alice");

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
const BOSS_ATTACK_DAMAGE = 30;
const BOSS_ATTACK_RANGE = 25;
const BOSS_KILL_XP_REWARD = 200;
const BOSS_KILL_GOLD_REWARD = 120;
const BOSS_TRIGGER_RANGE = 100;

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
const bosses = new Map<string, BossState>();
const groups = new Map<string, GroupState>();
const newsPosts: NewsPost[] = [
  {
    id: "news-1",
    title: "Sprint 4 Online",
    body: "News and bug reporting are now active.",
    author: "system",
    timestamp: Date.now()
  }
];
const reportEvents: ReportEvent[] = [];
let groupCounter = 1;
let newsCounter = 2;
let reportCounter = 1;

function getUserRole(username: string): UserRole {
  return username === ADMIN_USERNAME ? "admin" : "player";
}

function toSectionKey(gridX: number, gridY: number): string {
  return `${gridX}:${gridY}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getSectionKeyForPosition(x: number, y: number): string {
  const gridX = Math.floor(x / SECTION_SIZE);
  const gridY = Math.floor(y / SECTION_SIZE);
  return toSectionKey(gridX, gridY);
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

function createBosses(): void {
  const seedBosses = [
    {
      id: "boss-hydra",
      name: "Hydra",
      structureName: "Hydra Lake",
      x: 360,
      y: 340,
      maxHealth: 800,
      respawnMs: 45000,
      triggerX: 420,
      triggerY: 300
    },
    {
      id: "boss-cyclops",
      name: "Cave Cyclops",
      structureName: "Cyclops Cave",
      x: -430,
      y: -320,
      maxHealth: 950,
      respawnMs: 60000,
      triggerX: -500,
      triggerY: -260
    }
  ];

  for (const boss of seedBosses) {
    const sectionKey = getSectionKeyForPosition(boss.x, boss.y);
    if (!sections.has(sectionKey)) {
      continue;
    }

    bosses.set(boss.id, {
      id: boss.id,
      name: boss.name,
      structureName: boss.structureName,
      sectionKey,
      x: boss.x,
      y: boss.y,
      health: boss.maxHealth,
      maxHealth: boss.maxHealth,
      isAlive: true,
      respawnMs: boss.respawnMs,
      triggerX: boss.triggerX,
      triggerY: boss.triggerY
    });
  }
}

createBosses();

function getOrCreatePlayer(username: string): PlayerState {
  const existing = players.get(username);
  if (existing) {
    return existing;
  }

  const created: PlayerState = { username, x: 0, y: 0, xp: 0, gold: 0, groupId: null };
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

function getVisibleBosses(activeSectionKeys: string[]): BossState[] {
  const activeSet = new Set(activeSectionKeys);
  const visible: BossState[] = [];

  for (const boss of bosses.values()) {
    if (!boss.isAlive) {
      continue;
    }
    if (!activeSet.has(boss.sectionKey)) {
      continue;
    }
    visible.push(boss);
  }

  return visible;
}

function getGroupForPlayer(username: string): GroupState | null {
  for (const group of groups.values()) {
    if (group.members.includes(username)) {
      return group;
    }
  }
  return null;
}

function removePlayerFromGroup(username: string): void {
  const group = getGroupForPlayer(username);
  if (!group) {
    return;
  }

  group.members = group.members.filter((member) => member !== username);
  const player = players.get(username);
  if (player) {
    player.groupId = null;
  }

  if (group.members.length === 0) {
    groups.delete(group.id);
    return;
  }

  if (!group.members.includes(group.leader)) {
    group.leader = group.members[0];
  }
}

function buildWorldState(username: string): {
  player: PlayerState;
  activeSections: string[];
  enemies: EnemyState[];
  bosses: BossState[];
  group: GroupState | null;
} {
  const player = getOrCreatePlayer(username);
  const activeSections = getPlayerActiveSectionKeys(player);
  return {
    player,
    activeSections,
    enemies: getVisibleEnemies(activeSections),
    bosses: getVisibleBosses(activeSections),
    group: getGroupForPlayer(username)
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

function respawnBoss(bossId: string): void {
  const boss = bosses.get(bossId);
  if (!boss) {
    return;
  }

  boss.health = boss.maxHealth;
  boss.isAlive = true;
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

type AuthRequest = Request & { user?: { username: string; role: UserRole } };

function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { username: string; role?: UserRole };
    req.user = {
      username: decoded.username,
      role: decoded.role ?? getUserRole(decoded.username)
    };
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

  const role = getUserRole(user.username);
  const token = jwt.sign({ username: user.username, role }, JWT_SECRET, { expiresIn: "2h" });
  res.json({ token, username: user.username, role, message: "Login successful" });
});

app.get("/api/main", requireAuth, (req: AuthRequest, res: Response) => {
  res.json({
    message: `Welcome ${req.user?.username}. You reached the main page.`,
    role: req.user?.role,
    actions: ["Start Game", "News", "Report Bug"]
  });
});

app.get("/api/news", requireAuth, (req: AuthRequest, res: Response) => {
  const feed = [
    ...newsPosts.map((post) => ({
      type: "news",
      id: post.id,
      title: post.title,
      body: post.body,
      author: post.author,
      timestamp: post.timestamp
    })),
    ...reportEvents.map((report) => ({
      type: "report",
      id: report.id,
      reporter: report.reporter,
      reportedUser: report.reportedUser,
      reason: report.reason,
      source: report.source,
      timestamp: report.timestamp
    }))
  ].sort((a, b) => b.timestamp - a.timestamp);

  res.json({
    isAdmin: req.user?.role === "admin",
    adminUser: ADMIN_USERNAME,
    feed
  });
});

app.post("/api/news", requireAuth, (req: AuthRequest, res: Response) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Only admin can publish news" });
    return;
  }

  const title = String(req.body?.title ?? "").trim();
  const body = String(req.body?.body ?? "").trim();
  if (!title || !body) {
    res.status(400).json({ error: "title and body are required" });
    return;
  }

  const post: NewsPost = {
    id: `news-${newsCounter}`,
    title,
    body,
    author: req.user.username,
    timestamp: Date.now()
  };
  newsCounter += 1;
  newsPosts.push(post);
  res.json({ message: "News published", post });
});

app.post("/api/reports", requireAuth, (req: AuthRequest, res: Response) => {
  const reporter = req.user?.username;
  if (!reporter) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const reason = String(req.body?.reason ?? "").trim();
  const reportedUserRaw = String(req.body?.reportedUser ?? "").trim();
  const sourceRaw = String(req.body?.source ?? "bug").trim().toLowerCase();
  const source: "bug" | "player" = sourceRaw === "player" ? "player" : "bug";
  const reportedUser = reportedUserRaw || (source === "player" ? "unknown-player" : "server-bug");

  if (!reason) {
    res.status(400).json({ error: "reason is required" });
    return;
  }

  const report: ReportEvent = {
    id: `report-${reportCounter}`,
    reporter,
    reportedUser,
    reason,
    source,
    timestamp: Date.now()
  };
  reportCounter += 1;
  reportEvents.push(report);

  res.json({ message: "Report submitted", report });
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

app.post("/api/group/create", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  getOrCreatePlayer(username);
  removePlayerFromGroup(username);

  const groupId = `group-${groupCounter}`;
  groupCounter += 1;
  const group: GroupState = {
    id: groupId,
    leader: username,
    members: [username]
  };

  groups.set(groupId, group);
  const player = getOrCreatePlayer(username);
  player.groupId = groupId;

  res.json({ message: "Group created", group });
});

app.post("/api/group/join", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const groupId = String(req.body?.groupId ?? "");
  if (!groupId) {
    res.status(400).json({ error: "groupId is required" });
    return;
  }

  const group = groups.get(groupId);
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }

  removePlayerFromGroup(username);
  if (!group.members.includes(username)) {
    group.members.push(username);
  }

  const player = getOrCreatePlayer(username);
  player.groupId = group.id;
  res.json({ message: "Joined group", group });
});

app.post("/api/group/leave", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  removePlayerFromGroup(username);
  res.json({ message: "Left group", group: null });
});

app.get("/api/group/state", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json({ group: getGroupForPlayer(username) });
});

app.get("/api/world/bosses", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const state = buildWorldState(username);
  res.json({ bosses: state.bosses });
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

app.post("/api/combat/attack-boss", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const player = getOrCreatePlayer(username);
  const bossId = String(req.body?.bossId ?? "");
  if (!bossId) {
    res.status(400).json({ error: "bossId is required" });
    return;
  }

  const boss = bosses.get(bossId);
  if (!boss || !boss.isAlive) {
    res.status(404).json({ error: "Boss not found or already defeated" });
    return;
  }

  const range = distance({ x: player.x, y: player.y }, { x: boss.x, y: boss.y });
  if (range > BOSS_ATTACK_RANGE) {
    res.status(400).json({
      error: `Boss is out of range. Move closer than ${BOSS_ATTACK_RANGE} feet.`
    });
    return;
  }

  boss.health = Math.max(0, boss.health - BOSS_ATTACK_DAMAGE);
  let defeated = false;
  if (boss.health === 0) {
    defeated = true;
    boss.isAlive = false;
    player.xp += BOSS_KILL_XP_REWARD;
    player.gold += BOSS_KILL_GOLD_REWARD;

    setTimeout(() => {
      respawnBoss(boss.id);
    }, boss.respawnMs);
  }

  res.json({
    message: defeated ? `${boss.name} defeated` : "Boss hit landed",
    combat: {
      bossId: boss.id,
      bossName: boss.name,
      bossHealth: boss.health,
      damage: BOSS_ATTACK_DAMAGE,
      defeated,
      rewards: defeated ? { xp: BOSS_KILL_XP_REWARD, gold: BOSS_KILL_GOLD_REWARD } : null,
      autoRespawnMs: boss.respawnMs
    },
    ...buildWorldState(username)
  });
});

app.post("/api/bosses/hidden-respawn", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const player = getOrCreatePlayer(username);
  const bossId = String(req.body?.bossId ?? "");
  if (!bossId) {
    res.status(400).json({ error: "bossId is required" });
    return;
  }

  const boss = bosses.get(bossId);
  if (!boss) {
    res.status(404).json({ error: "Boss not found" });
    return;
  }

  const triggerDistance = distance(
    { x: player.x, y: player.y },
    { x: boss.triggerX, y: boss.triggerY }
  );
  if (triggerDistance > BOSS_TRIGGER_RANGE) {
    res.status(400).json({
      error: `You are too far from the hidden trigger. Move within ${BOSS_TRIGGER_RANGE} feet.`
    });
    return;
  }

  respawnBoss(boss.id);
  res.json({ message: `${boss.name} manually respawned`, boss });
});

app.listen(PORT, () => {
  console.log(`Sprint 4 server running at http://localhost:${PORT}`);
  console.log("Health check: GET /api/health");
  console.log("Join world: POST /api/world/join");
  console.log("Boss combat: POST /api/combat/attack-boss");
  console.log("Groups: POST /api/group/create");
  console.log("News feed: GET /api/news | Admin post: POST /api/news");
  console.log("Report events: POST /api/reports");
});
