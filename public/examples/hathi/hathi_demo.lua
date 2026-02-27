-- Hathi Demo: Steuere den Elefanten durch die Welt!
-- Tile-Codes: g=Gras, w=Wasser, t=Baum, r=Fels, b=Bananen,
--   c=Kiste, F=Flagge, s=Kürbis, o=Tomate, H=Hathi-Start

hathi.loadLevel({
  "ggggggg",
  "gtgbgrg",
  "ggggggg",
  "gwHgwFg",
  "ggggggg",
  "grgggsg",
  "ggggggg",
})

print("Hathi startet!")

-- Vorwärts gehen
hathi.forward()
hathi.forward()
print("Position: Zeile=" .. hathi.getRow() .. " Spalte=" .. hathi.getCol())

-- Rechts abbiegen (Süd)
hathi.turnRight()
hathi.forward()
hathi.forward()

-- Links abbiegen (Ost)
hathi.turnLeft()
hathi.forward()

-- Item aufsammeln
local item = hathi.pick()
if item then
  print("Aufgesammelt: " .. item)
end

-- Weiter zur Flagge
hathi.turnLeft()
hathi.turnLeft()
hathi.forward()
hathi.forward()
hathi.forward()
hathi.forward()
hathi.turnLeft()
hathi.forward()
hathi.forward()

print("Hathi ist angekommen! 🐘")
print("Richtung: " .. hathi.getDir() .. " (0=N 1=O 2=S 3=W)")
