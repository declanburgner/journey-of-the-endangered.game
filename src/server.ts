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
app.use("/sprites", express.static(path.join(__dirname, "../sprites")));
app.use("/sprites-the-real-deal", express.static(path.join(__dirname, "../sprites the real deal")));

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
  health: number;
  equippedTool: ToolId | null;
  inventorySlots: Array<ToolId | null>;
  selectedSlot: number;
  lastAttackAt: number;
  xp: number;
  gold: number;
  groupId: string | null;
};

type ToolId =
  | "sword"
  | "mace"
  | "pickaxe"
  | "diamond-mace"
  | "diamond-pickaxe"
  | "diamond-sword";

type ToolStats = {
  id: ToolId;
  name: string;
  damage: number;
  cooldownMs: number;
};

type InventoryState = {
  selectedSlot: number;
  slots: Array<(ToolStats & { slot: number }) | null>;
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

type ChestState = {
  id: string;
  sectionKey: string;
  x: number;
  y: number;
  isOpened: boolean;
  respawnAtMs: number | null;
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
const KILL_XP_REWARD = 25;
const KILL_GOLD_REWARD = 10;
const ENEMY_RESPAWN_MS = 10000;
const BOSS_ATTACK_RANGE = 25;
const BOSS_KILL_XP_REWARD = 200;
const BOSS_KILL_GOLD_REWARD = 120;
const BOSS_TRIGGER_RANGE = 8;
const BOSS_MOVE_PER_TICK = 5;
const CHEST_OPEN_RANGE = 14;
const CHEST_RESPAWN_MS = 30000;
const INVENTORY_SLOT_COUNT = 10;
const TOOL_EXCHANGE_GOLD = 5;

const TOOL_CONFIG: Record<ToolId, ToolStats> = {
  sword: { id: "sword", name: "Sword", damage: 5, cooldownMs: 1000 },
  mace: { id: "mace", name: "Mace", damage: 7, cooldownMs: 700 },
  pickaxe: { id: "pickaxe", name: "Pickaxe", damage: 6, cooldownMs: 500 },
  "diamond-mace": { id: "diamond-mace", name: "Diamond Mace", damage: 9, cooldownMs: 600 },
  "diamond-pickaxe": {
    id: "diamond-pickaxe",
    name: "Diamond Pickaxe",
    damage: 8,
    cooldownMs: 400
  },
  "diamond-sword": {
    id: "diamond-sword",
    name: "Diamond Sword",
    damage: 10,
    cooldownMs: 700
  }
};

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
const chests = new Map<string, ChestState>();
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
  let chestCounter = 1;

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

      // Sprint 5: add a subset of chest spawns across the world.
      if ((Math.abs(gx) + Math.abs(gy)) % 4 === 0) {
        const chestId = `chest-${chestCounter}`;
        chestCounter += 1;
        chests.set(chestId, {
          id: chestId,
          sectionKey: key,
          x: clamp(center.x + (Math.random() - 0.5) * (SECTION_SIZE * 0.5), -WORLD_LIMIT, WORLD_LIMIT),
          y: clamp(center.y + (Math.random() - 0.5) * (SECTION_SIZE * 0.5), -WORLD_LIMIT, WORLD_LIMIT),
          isOpened: false,
          respawnAtMs: null
        });
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

  const created: PlayerState = {
    username,
    x: 0,
    y: 0,
    health: 50,
    equippedTool: "sword",
    inventorySlots: ["sword", null, null, null, null, null, null, null, null, null],
    selectedSlot: 0,
    lastAttackAt: 0,
    xp: 0,
    gold: 0,
    groupId: null
  };
  players.set(username, created);
  return created;
}

function toInventoryState(player: PlayerState): InventoryState {
  return {
    selectedSlot: player.selectedSlot,
    slots: player.inventorySlots.map((toolId, index) =>
      toolId ? { ...TOOL_CONFIG[toolId], slot: index } : null
    )
  };
}

function setSelectedSlot(player: PlayerState, slot: number): void {
  player.selectedSlot = clamp(Math.floor(slot), 0, INVENTORY_SLOT_COUNT - 1);
  player.equippedTool = player.inventorySlots[player.selectedSlot];
}

function addToolToInventory(player: PlayerState, toolId: ToolId): number {
  const existingIndex = player.inventorySlots.findIndex((slotTool) => slotTool === toolId);
  if (existingIndex >= 0) {
    setSelectedSlot(player, existingIndex);
    return existingIndex;
  }

  const emptyIndex = player.inventorySlots.findIndex((slotTool) => slotTool === null);
  if (emptyIndex < 0) {
    return -1;
  }

  player.inventorySlots[emptyIndex] = toolId;
  setSelectedSlot(player, emptyIndex);
  return emptyIndex;
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

function getVisibleChests(activeSectionKeys: string[]): ChestState[] {
  const activeSet = new Set(activeSectionKeys);
  const visible: ChestState[] = [];

  for (const chest of chests.values()) {
    if (chest.isOpened) {
      continue;
    }
    if (!activeSet.has(chest.sectionKey)) {
      continue;
    }
    visible.push(chest);
  }

  return visible;
}

function rollChestTool(): ToolId {
  const roll = Math.random();

  if (roll < 0.25) {
    return Math.random() < 0.5 ? "mace" : "pickaxe";
  }

  if (roll < 0.45) {
    return Math.random() < 0.5 ? "diamond-mace" : "diamond-pickaxe";
  }

  if (roll < 0.55) {
    return "diamond-sword";
  }

  return "sword";
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
  chests: ChestState[];
  inventory: InventoryState;
  group: GroupState | null;
} {
  const player = getOrCreatePlayer(username);
  const activeSections = getPlayerActiveSectionKeys(player);
  return {
    player,
    activeSections,
    enemies: getVisibleEnemies(activeSections),
    bosses: getVisibleBosses(activeSections),
    chests: getVisibleChests(activeSections),
    inventory: toInventoryState(player),
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

function tickActiveBosses(): void {
  const activeSections = getGlobalActiveSectionKeys();
  if (activeSections.size === 0) {
    return;
  }

  for (const boss of bosses.values()) {
    if (!boss.isAlive) {
      continue;
    }
    if (!activeSections.has(boss.sectionKey)) {
      continue;
    }

    boss.x = clamp(
      boss.x + (Math.random() - 0.5) * (BOSS_MOVE_PER_TICK * 2),
      -WORLD_LIMIT,
      WORLD_LIMIT
    );
    boss.y = clamp(
      boss.y + (Math.random() - 0.5) * (BOSS_MOVE_PER_TICK * 2),
      -WORLD_LIMIT,
      WORLD_LIMIT
    );
    boss.sectionKey = getSectionKeyForPosition(boss.x, boss.y);
  }
}

function tickChestRespawns(): void {
  const now = Date.now();
  for (const chest of chests.values()) {
    if (!chest.isOpened || chest.respawnAtMs === null) {
      continue;
    }
    if (now >= chest.respawnAtMs) {
      chest.isOpened = false;
      chest.respawnAtMs = null;
    }
  }
}

setInterval(() => {
  tickActiveEnemies();
  tickActiveBosses();
  tickChestRespawns();
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

app.post("/api/inventory/select", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const slot = Number(req.body?.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot >= INVENTORY_SLOT_COUNT) {
    res.status(400).json({ error: `slot must be an integer from 0 to ${INVENTORY_SLOT_COUNT - 1}` });
    return;
  }

  const player = getOrCreatePlayer(username);
  setSelectedSlot(player, slot);
  res.json({ message: `Selected slot ${slot}`, ...buildWorldState(username) });
});

app.post("/api/inventory/exchange", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const player = getOrCreatePlayer(username);
  const selectedTool = player.inventorySlots[player.selectedSlot];
  if (!selectedTool) {
    res.status(400).json({ error: "Selected slot is empty" });
    return;
  }

  player.inventorySlots[player.selectedSlot] = null;
  player.equippedTool = null;

  const fallbackSlot = player.inventorySlots.findIndex((slotTool) => slotTool !== null);
  if (fallbackSlot >= 0) {
    setSelectedSlot(player, fallbackSlot);
  }

  player.gold += TOOL_EXCHANGE_GOLD;

  res.json({
    message: `Exchanged ${TOOL_CONFIG[selectedTool].name} for ${TOOL_EXCHANGE_GOLD} gold`,
    exchangedTool: TOOL_CONFIG[selectedTool],
    goldAdded: TOOL_EXCHANGE_GOLD,
    ...buildWorldState(username)
  });
});

app.post("/api/chests/open", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const chestId = String(req.body?.chestId ?? "");
  if (!chestId) {
    res.status(400).json({ error: "chestId is required" });
    return;
  }

  const chest = chests.get(chestId);
  if (!chest) {
    res.status(404).json({ error: "Chest not found" });
    return;
  }

  if (chest.isOpened) {
    res.status(400).json({ error: "Chest is empty right now. Wait for respawn." });
    return;
  }

  const player = getOrCreatePlayer(username);
  const chestDistance = distance({ x: player.x, y: player.y }, { x: chest.x, y: chest.y });
  if (chestDistance > CHEST_OPEN_RANGE) {
    res.status(400).json({
      error: `Move closer to open chest. Required range is ${CHEST_OPEN_RANGE} feet.`
    });
    return;
  }

  const toolId = rollChestTool();
  const assignedSlot = addToolToInventory(player, toolId);
  if (assignedSlot < 0) {
    res.status(400).json({ error: "Inventory is full. Exchange or use a slot first." });
    return;
  }

  chest.isOpened = true;
  chest.respawnAtMs = Date.now() + CHEST_RESPAWN_MS;

  res.json({
    message: `Chest opened. You got ${TOOL_CONFIG[toolId].name}.`,
    tool: TOOL_CONFIG[toolId],
    slot: assignedSlot,
    ...buildWorldState(username)
  });
});

app.post("/api/combat/attack", requireAuth, (req: AuthRequest, res: Response) => {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const player = getOrCreatePlayer(username);
  if (!player.equippedTool) {
    res.status(400).json({ error: "No equipped tool. Select a slot with a tool." });
    return;
  }
  const weapon = TOOL_CONFIG[player.equippedTool];
  const now = Date.now();
  const readyAt = player.lastAttackAt + weapon.cooldownMs;
  if (now < readyAt) {
    res.status(429).json({
      error: `Weapon cooldown active for ${Math.ceil((readyAt - now) / 100) / 10}s.`
    });
    return;
  }
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

  enemy.health = Math.max(0, enemy.health - weapon.damage);
  player.lastAttackAt = now;
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
      weapon: weapon.name,
      damage: weapon.damage,
      cooldownMs: weapon.cooldownMs,
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
  if (!player.equippedTool) {
    res.status(400).json({ error: "No equipped tool. Select a slot with a tool." });
    return;
  }
  const weapon = TOOL_CONFIG[player.equippedTool];
  const now = Date.now();
  const readyAt = player.lastAttackAt + weapon.cooldownMs;
  if (now < readyAt) {
    res.status(429).json({
      error: `Weapon cooldown active for ${Math.ceil((readyAt - now) / 100) / 10}s.`
    });
    return;
  }
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

  boss.health = Math.max(0, boss.health - weapon.damage);
  player.lastAttackAt = now;
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
      weapon: weapon.name,
      damage: weapon.damage,
      cooldownMs: weapon.cooldownMs,
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

  if (boss.isAlive) {
    res.status(400).json({ error: `${boss.name} is already alive` });
    return;
  }

  const triggerDistance = distance(
    { x: player.x, y: player.y },
    { x: boss.triggerX, y: boss.triggerY }
  );
  if (triggerDistance > BOSS_TRIGGER_RANGE) {
    res.status(400).json({
      error: `You must stand on the hidden button (within ${BOSS_TRIGGER_RANGE} feet).`
    });
    return;
  }

  respawnBoss(boss.id);
  res.json({ message: `${boss.name} manually respawned`, boss });
});

app.listen(PORT, () => {
  console.log(`Sprint 5 server running at http://localhost:${PORT}`);
  console.log("Health check: GET /api/health");
  console.log("Join world: POST /api/world/join");
  console.log("Boss combat: POST /api/combat/attack-boss");
  console.log("Chest open: POST /api/chests/open");
  console.log("Inventory: POST /api/inventory/select | POST /api/inventory/exchange");
  console.log("Groups: POST /api/group/create");
  console.log("News feed: GET /api/news | Admin post: POST /api/news");
  console.log("Report events: POST /api/reports");
});
