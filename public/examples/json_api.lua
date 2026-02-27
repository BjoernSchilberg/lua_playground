local body = http_get(
	"https://api.open-meteo.com/v1/forecast?latitude=52.2799&longitude=8.0472&current=temperature_2m&timezone=Europe%2FBerlin"
)

local json = require("dkjson")
local obj, pos, err = json.decode(body, 1, nil)
if err then
	error(("JSON decode error: %s at %d"):format(err, pos or -1))
end

local t = obj.current and obj.current.temperature_2m
if t == nil then
	error("temperature_2m not found in JSON")
end

local unit = obj.current_units and obj.current_units.temperature_2m or ""
print("temperature_2m:", t, unit)
