# TypeScript Multiplayer Server Requirements

## 1. Project Overview
- Build a first-person multiplayer game server using TypeScript.
- Support small-group to medium sessions suitable for family and trusted friends.
- Support both solo and group play.
- Support both PvE (players vs enemies) and PvP (players vs players).

## 2. Core Technology
- Server language: TypeScript.
- Game client: C# using Godot.
- Runtime: Node.js (LTS).
- Networking: WebSocket for real-time gameplay traffic.
- Server Model: Authoritative server (server validates and owns final game state).

## 3. World and Section Loading
- The world is split into sections (spatial partitions).
- A section becomes active when at least one player is within 300 feet of that section.
- Sections with no nearby players are unloaded or moved to low-cost background state.
- Neighbor sections should be pre-warmed to reduce pop-in when players cross boundaries.
- Section activation and unloading must include a short grace period to prevent rapid thrashing.

## 4. Entities and Combat
- Enemy entities exist in world sections and only fully simulate in active sections.
- Players can fight enemy entities solo or with teammates.
- Players can fight other players (PvP).
- Players earn gold and XP from defeating enemy entities.
- Players earn additional gold and XP rewards from defeating bosses.
- Include at least one tradable item at launch: Gold Bars.
- Players can spend gold to upgrade tools.
- Players can join a group while on the map.
- Server must validate combat events (damage, cooldowns, range, and hit legality).
- Entity updates should prioritize nearby/engaged entities and lower update frequency for distant entities.

## 5. Boss Encounters
- Boss structures available from launch:
  - Hydra Lake
  - Cyclops Cave
- Initial launch bosses:
  - Hydra
  - Cave Cyclops
- Boss encounter logic should run in isolated encounter contexts so one boss fight does not degrade global server performance.
- Boss state, phase transitions, and rewards must be server-authoritative.
- Bosses must respawn automatically after a configurable cooldown period.
- Bosses can also be respawned manually by interacting with a hidden button/trigger.

## 6. Input and Device Support
- Input methods required:
  - Touch controls for mobile/tablet.
  - Keyboard controls for desktop/laptop.
- Supported client device families:
  - iPad
  - iPhone
  - Windows devices
  - macOS devices
- Input abstraction layer must map touch and keyboard actions into the same server command schema.

## 7. Authentication and Access Control
- Require a master server passcode for private server entry.
- Require account login with username and password.
- Store passwords using secure hashing (Argon2id preferred, bcrypt acceptable fallback).
- Include login/session timeout behavior.
- Include role-based permissions with admin and player roles.
- The main page must only open after both the correct master passcode and valid account login credentials are entered.

## 8. Main Page and News
- After successful authentication, users are routed to a main page.
- The main page must include a Start Game button.
- The main page must include a bug report option for players.
- The main page must include access to a News page.
- The News page allows admin users to create and publish news posts (for example, upcoming server updates).
- The News feed must show report events, including when a player was reported and the reason for the report.
- Non-admin users can view news posts but cannot create or edit them.

## 9. Safety, Moderation, and Admin Tools
- Admin can kick players from active sessions.
- Admin can ban/unban players by username/account.
- Include player report system that records reporter, reported user, reason, and timestamp.
- Keep moderation logs for bans, kicks, reports, and login failures.
- Add rate limits on passcode and login attempts to reduce brute-force abuse.

## 10. Security and Validation
- Use HTTPS/WSS for encrypted traffic.
- Never trust client-reported game outcomes.
- Validate movement, combat, item usage, and state transitions on the server.
- Reject impossible or out-of-bounds actions.

## 11. Performance Targets
- Fixed simulation tick target: 20-30 Hz.
- State snapshot/update target: 10-20 Hz (with client interpolation).
- Section-based interest management must minimize updates sent to non-nearby players.
- Server should remain stable with many active entities by limiting simulation to active sections.

## 12. Launch Scope
- Launch with:
  - Section-based world loading at 300 feet.
  - PvE and PvP combat.
  - XP progression.
  - Tradable Gold Bars item.
  - Gold-based tool upgrades.
  - In-map group joining.
  - Two boss encounters (Hydra, Cave Cyclops).
  - Touch + keyboard input support.
  - Post-login main page with Start Game and News access.
  - Main-page bug reporting.
  - Admin-managed news posting.
  - News feed visibility into player report time and reason.
  - Basic auth, moderation, and admin tooling.

## 13. Future Enhancements (Post-Launch)
- Additional bosses and boss structures.
- Advanced anti-cheat heuristics.
- Better analytics dashboards for admin logs.
- Horizontal scaling for higher concurrent player counts.
