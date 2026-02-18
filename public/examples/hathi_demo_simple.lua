-- Hathi Demo: Steuere den Elefanten durch die Welt!
-- Tile-Codes: g=Gras, w=Wasser, t=Baum, r=Fels, b=Bananen,
--   c=Kiste, F=Flagge, s=Kürbis, o=Tomate, H=Hathi-Start

hathi.loadLevel({
	"ggg",
	"gHg",
	"ggg",
})

print("Hathi startet!")

-- Vorwärts gehen
hathi.forward()
for i = 1, 5 do
	hathi.forward()
	hathi.turnLeft()
	print("Hathi dreht sich!")
end

print("Hathi hat fertig!")
