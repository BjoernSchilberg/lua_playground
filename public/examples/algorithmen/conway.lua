-- conway.lua
-- Conway's Game of Life – angepasst für den Browser-Lua-Runner

math.randomseed(os.time())

-- ====== Konfiguration ======
local W, H   = 60, 20       -- Breite / Höhe
local DENSITY = 0.25         -- Startdichte lebender Zellen
local SLEEP_MS = 120         -- Pause zwischen Frames (ms)
local GENERATIONS = 200      -- Anzahl Generationen (nicht endlos, damit es stoppt)
local ALIVE = "#"            -- Zeichen für lebende Zelle
local DEAD  = "."            -- Zeichen für tote Zelle

-- ====== Hilfsfunktionen ======

local function new_grid()
  local g = {}
  for y = 1, H do
    g[y] = {}
    for x = 1, W do
      g[y][x] = (math.random() < DENSITY) and 1 or 0
    end
  end
  return g
end

local function wrap(v, max)
  if v < 1 then return max end
  if v > max then return 1 end
  return v
end

local function count_neighbors(g, x, y)
  local n = 0
  for dy = -1, 1 do
    for dx = -1, 1 do
      if not (dx == 0 and dy == 0) then
        n = n + g[wrap(y + dy, H)][wrap(x + dx, W)]
      end
    end
  end
  return n
end

local function step(g)
  local nextg = {}
  for y = 1, H do
    nextg[y] = {}
    for x = 1, W do
      local alive = g[y][x] == 1
      local n = count_neighbors(g, x, y)
      if alive then
        nextg[y][x] = (n == 2 or n == 3) and 1 or 0
      else
        nextg[y][x] = (n == 3) and 1 or 0
      end
    end
  end
  return nextg
end

local function render(g, gen)
  print(string.format("=== Generation %d ===", gen))
  print(string.rep("-", W))
  for y = 1, H do
    local line = {}
    for x = 1, W do
      line[#line + 1] = (g[y][x] == 1) and ALIVE or DEAD
    end
    print(table.concat(line))
  end
  print(string.rep("-", W))
  print()
end

-- ====== Main ======
local grid = new_grid()

for gen = 0, GENERATIONS - 1 do
  render(grid, gen)
  grid = step(grid)
  sleep(SLEEP_MS)
end

print("Fertig nach " .. GENERATIONS .. " Generationen.")
