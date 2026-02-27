local body = http_get("https://pokeapi.co/api/v2/pokemon?limit=10")

local json = require("dkjson")
local data, pos, err = json.decode(body, 1, nil)
if err then
	error(("JSON decode error: %s at %d"):format(err, pos or -1))
end

-- Ergebnisse prüfen und Namen ausgeben
if type(data) ~= "table" or type(data.results) ~= "table" then
	error("Unerwartete JSON-Struktur: 'results' fehlt oder ist kein Array.")
end

for i, entry in ipairs(data.results) do
	print(i .. ": " .. tostring(entry.name))
end
