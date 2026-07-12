# Sprint 2 Run Guide

## What Sprint 2 Adds
- Section activation (300 feet rule)
- Enemy entities in sections
- Basic movement validation
- Basic combat validation
- XP and gold rewards for enemy kills

## 1. Start server
- Run:
  - npm run dev

## 2. Login and get token
Use PowerShell (replace values if you changed them):

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
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/world/join" -Headers $headers -ContentType "application/json" -Body "{\"x\":0,\"y\":0}"
```

## 4. Check world state
```powershell
$state = Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/world/state" -Headers $headers
$state
```

## 5. Move player
```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/world/move" -Headers $headers -ContentType "application/json" -Body "{\"x\":20,\"y\":15}"
```

## 6. Attack first visible enemy
```powershell
$state = Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/world/state" -Headers $headers
$enemyId = $state.enemies[0].id
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/combat/attack" -Headers $headers -ContentType "application/json" -Body (@{ enemyId = $enemyId } | ConvertTo-Json)
```

## 7. Success checks
- `/api/world/state` returns active sections and visible enemies.
- Large moves are rejected (anti-teleport check).
- Enemy health goes down after attacks.
- On enemy defeat, player XP and gold increase.
