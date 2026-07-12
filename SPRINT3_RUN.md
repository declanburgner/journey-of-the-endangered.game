# Sprint 3 Run Guide

## What Sprint 3 Adds
- Hydra and Cave Cyclops bosses
- Boss attack endpoint with higher rewards
- Auto boss respawn timers
- Hidden trigger manual boss respawn endpoint
- In-map group create/join/leave endpoints
- First-person 3D browser preview in game page

## 1. Start server
- Run:
  - npm run dev

## 2. Login and get token
```powershell
$loginBody = @{
  masterPasscode = "family-server-123"
  username = "alice"
  password = "alice-pass"
} | ConvertTo-Json

$login = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/login" -ContentType "application/json" -Body $loginBody
$token = $login.token
$headers = @{ Authorization = "Bearer $token" }
$token
```

## 3. Join world
```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/world/join" -Headers $headers -ContentType "application/json" -Body "{\"x\":360,\"y\":340}"
```

## 4. List visible bosses
```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/world/bosses" -Headers $headers
```

## 5. Attack Hydra boss
```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/combat/attack-boss" -Headers $headers -ContentType "application/json" -Body (@{ bossId = "boss-hydra" } | ConvertTo-Json)
```

## 6. Trigger hidden respawn
```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/bosses/hidden-respawn" -Headers $headers -ContentType "application/json" -Body (@{ bossId = "boss-hydra" } | ConvertTo-Json)
```

## 7. Group play endpoints
```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/group/create" -Headers $headers -ContentType "application/json" -Body "{}"
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/group/state" -Headers $headers
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/group/leave" -Headers $headers -ContentType "application/json" -Body "{}"
```

## 8. Open playable browser page
- Open:
  - http://localhost:3000/game.html

## 9. Success checks
- `/api/world/bosses` returns visible boss data.
- Boss takes damage through `/api/combat/attack-boss`.
- Boss respawns automatically after cooldown if defeated.
- Hidden trigger endpoint respawns boss when near trigger.
- Group create/join/leave endpoints return expected group state.
- `game.html` renders a first-person 3D scene with visible entities.
