-- _G Inspector: sortierte Übersicht über globale Namen
-- Ausgabe: name | typ | details

local function inspect_G(opts)
	opts = opts or {}
	local max = opts.max or math.huge
	local only = opts.only -- z.B. "function" oder "table" oder nil

	-- Keys sammeln
	local keys = {}
	for k, v in pairs(_G) do
		if type(k) == "string" then
			if (not only) or type(v) == only then
				keys[#keys + 1] = k
			end
		end
	end
	table.sort(keys)

	local n = 0
	for _, k in ipairs(keys) do
		n = n + 1
		if n > max then
			print(("... (%d weitere)"):format(#keys - max))
			break
		end

		local v = _G[k]
		local t = type(v)

		local details = ""
		if t == "function" then
			local info = debug.getinfo(v, "Snlu")
			-- info.what: "C" oder "Lua" oder "main"
			details = (info.what or "?")
			if info.what == "Lua" then
				details = details
					.. (" %s:%d-%d"):format(
						tostring(info.short_src),
						tonumber(info.linedefined) or -1,
						tonumber(info.lastlinedefined) or -1
					)
			end
		elseif t == "table" then
			-- Tabellen grob charakterisieren
			local cnt = 0
			for _ in pairs(v) do
				cnt = cnt + 1
				if cnt >= 20 then
					break
				end
			end
			details = ("table (≈%s keys)"):format(cnt >= 20 and "20+" or tostring(cnt))
		else
			-- primitive Werte kurz anzeigen
			details = tostring(v)
		end

		print(("%-20s | %-9s | %s"):format(k, t, details))
	end
end

-- Beispiele:
-- 1) Alles listen
inspect_G()

-- 2) Nur Funktionen
-- inspect_G({ only = "function" })

-- 3) Nur die ersten 50 Einträge
-- inspect_G({ max = 50 })
