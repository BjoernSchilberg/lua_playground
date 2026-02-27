-- CSV-Parser Beispiel
-- Zeigt die Verwendung von require("csv") mit verschiedenen Optionen

local csv = require("csv")

-- Einfaches Beispiel mit Semikolon-Trenner
local text = [[Name;Alter;Stadt
Anna;28;München
Ben;35;Berlin
Clara;;Hamburg
"Dr. Weber";42;"Frankfurt; Main"
]]

print("=== Alle Zeilen (mit Header) ===")
local records = csv.parse(text, { sep = ";", header = true })
for i, rec in ipairs(records) do
  print(string.format(
    "%d: %s, Alter=%s, Stadt=%s",
    i, rec.Name, rec.Alter, rec.Stadt
  ))
end

print()

-- Ohne Header-Modus: jede Zeile als Table
print("=== Rohe Zeilen ===")
local rows = csv.parse(text, { sep = ";" })
for i, row in ipairs(rows) do
  print(string.format("Zeile %d: %s", i, table.concat(row, " | ")))
end

print()

-- Iterator-Modus
print("=== Iterator ===")
for row in csv.rows("a,b,c\n1,2,3\n4,,6\n", { sep = "," }) do
  print(table.concat(row, " | "))
end

print()

-- Leere Felder bleiben erhalten
print("=== Leere Felder ===")
local r = csv.parse("a;;c;;\n", { sep = ";" })
print("Felder: " .. #r[1])
for i, f in ipairs(r[1]) do
  print(string.format("  [%d] = '%s'", i, f))
end
