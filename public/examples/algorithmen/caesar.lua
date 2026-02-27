local function caesar(text, shift)
	-- string.gsub durchläuft jedes Zeichen
	return (
		text:gsub("%a", function(c)
			-- Basiswert (ASCII) für 'A' oder 'a' ermitteln
			local base = (c:lower() == c) and string.byte("a") or string.byte("A")
			-- 1. In 0-25 Bereich bringen: (byte - base)
			-- 2. Verschieben: + shift
			-- 3. Überlauf behandeln: % 26
			-- 4. Zurück zu ASCII: + base
			return string.char((string.byte(c) - base + shift) % 26 + base)
		end)
	)
end

-- Test-Daten
local klartext = "Hallo Welt!"
local key = -3

local geheim = caesar(klartext, key)
local entschluesselt = caesar(geheim, -key) -- Entschlüsseln mit negativem Key

-- Bündige Ausgabe
local f = "%-14s %s"
print(string.format(f, "Original:", klartext))
print(string.format(f, "Verschlüsselt:", geheim))
print(string.format(f, "Entschlüsselt:", entschluesselt))
