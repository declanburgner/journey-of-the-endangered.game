# TypeScript Multiplayer Server Requirements

## 1. Project Overview
- Build a first-person multiplayer game server using TypeScript.
- Support small-group to medium sessions suitable for family and trusted friends.
- Support both solo and group play.
- Support both PvE (players vs enemies) and PvP (players vs players).

## 1.1 Sprint Summary (Quick View)
- Sprint 1 does: Setup project, run local server, and add login + master passcode flow.
- Sprint 2 does: Build section loading (300 feet), enemies, combat, and XP/gold rewards.
- Sprint 3 does: Add Hydra/Cyclops bosses, respawn logic, and in-map group joining.
- Sprint 4 does: Build main page, Start Game button, bug reports, and News page/admin news posts.
- Sprint 5 does: Add admin tools (kick/ban), rate limits, logs, and device input testing.

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

## 13. Simple Sprint Plan
- Sprint 1: Project Setup and Server Start
  - Set up Node.js, TypeScript server project, and basic folder structure.
  - Start server locally and confirm it runs without errors.
  - Add basic account login flow with master passcode check.
  - Success check: Two test users can log in and reach the main page.

- Sprint 2: Core World and Combat Loop
  - Implement section loading using the 300 feet activation rule.
  - Add enemy entities in active sections.
  - Add combat basics with server-side validation.
  - Add XP and gold rewards from enemy kills.
  - Success check: Player can enter world, kill enemies, and gain XP/gold.

- Sprint 3: Bosses and Group Play
  - Add Hydra Lake and Cyclops Cave structures.
  - Add Hydra and Cave Cyclops boss encounters.
  - Add automatic boss respawn cooldown and hidden-button respawn.
  - Add in-map group joining.
  - Success check: Group can defeat a boss and receive rewards.

- Sprint 4: Main Page, News, and Reports
  - Add Start Game button on main page.
  - Add player bug report option from main page.
  - Add News page with admin posting.
  - Show player report time and reason in the news feed.
  - Success check: Admin can post news and players can view/report correctly.

- Sprint 5: Safety, Admin Controls, and Device Testing
  - Add admin role checks, kick, and ban/unban tools.
  - Add login/passcode rate limits.
  - Add moderation logs for bans, kicks, reports, and login failures.
  - Test touch controls (iPad/iPhone) and keyboard controls (Windows/macOS).
  - Success check: Non-admin cannot use admin actions and all target devices can connect.

## 14. Future Enhancements (Post-Launch)
- Additional bosses and boss structures.
- Advanced anti-cheat heuristics.
- Better analytics dashboards for admin logs.
- Horizontal scaling for higher concurrent player counts.
