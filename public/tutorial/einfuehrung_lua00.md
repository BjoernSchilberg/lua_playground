# Einführung in Lua (kurz & praktisch)


<!-- mtoc-start -->

* [1) Erste Schritte: Ausgeben mit `print`](#1-erste-schritte-ausgeben-mit-print)
* [2) Kommentare](#2-kommentare)
* [3) Variablen und Datentypen](#3-variablen-und-datentypen)
* [4) Rechnen und Operatoren](#4-rechnen-und-operatoren)
* [5) Bedingungen](#5-bedingungen)
* [6) Schleifen](#6-schleifen)
  * [6.1 `for`-Schleife (Zählschleife)](#61-for-schleife-zaehlschleife)
  * [6.2 `while`-Schleife](#62-while-schleife)
  * [6.3 `repeat ... until`](#63-repeat--until)
* [7) Funktionen](#7-funktionen)
* [8) Tabellen](#8-tabellen)
  * [8.1 Als Liste (Array)](#81-als-liste-array)
  * [8.2 Als Wörterbuch (Key-Value)](#82-als-woerterbuch-key-value)
* [9) Ein kleines Mini-Projekt: Zahlen raten](#9-ein-kleines-mini-projekt-zahlen-raten)
* [10) Häufige Stolperstellen](#10-haeufige-stolperstellen)
* [11) Nützliche Standardfunktionen (kleine Auswahl)](#11-nuetzliche-standardfunktionen-kleine-auswahl)
* [12) Kleine Übungsaufgaben](#12-kleine-uebungsaufgaben)

<!-- mtoc-end -->

Lua ist eine kleine, schnelle und leicht zu erlernende
Programmiersprache. Sie wird oft für Spiele, Skripting, Embedded-Systeme
und als „Einbettungs-Sprache“ in andere Programme genutzt.

---

## 1) Erste Schritte: Ausgeben mit `print`

```lua
print("Hallo Lua!")
print(2 + 3)
```

**Merke:** Strings stehen in doppelten `"..."` oder einfachen `'...'`
Anführungszeichen.

---

## 2) Kommentare

```lua
-- Das ist ein einzeiliger Kommentar

--[[
Das ist ein
mehrzeiliger Kommentar
]]
```

---

## 3) Variablen und Datentypen

Lua ist **dynamisch typisiert**: Du schreibst keinen Typ hin, Lua merkt sich
den Typ zur Laufzeit.

```lua
local name = "Mila"   -- String
local alter = 16      -- Zahl (number)
local cool = true     -- boolean (true/false)
local nichts = nil    -- "kein Wert"

print(name, alter, cool, nichts)
```

Das Schlüsselwort **`local`** bedeutet: Diese Variable gilt nur in diesem Block /
dieser Datei (empfohlen!).

---

## 4) Rechnen und Operatoren

```lua
local a = 10
local b = 3

print(a + b)   -- 13
print(a - b)   -- 7
print(a * b)   -- 30
print(a / b)   -- 3.333...
print(a % b)   -- 1   (Rest)
print(a ^ b)   -- 1000 (Potenz)
```

Strings verketten (verbinden) mit `..`:

```lua
local vorname = "Mila"
local text = "Hallo, " .. vorname .. "!"
print(text)
```

---

## 5) Bedingungen

Schlüsselwörter: `if / elseif / else`

```lua
local punkte = 72

if punkte >= 90 then
  print("Note 1")
elseif punkte >= 75 then
  print("Note 2")
elseif punkte >= 60 then
  print("Note 3")
else
  print("Weiter üben")
end
```

Vergleichsoperatoren: `==`, `~=`, `<`, `<=`, `>`, `>=`  
Logik: `and`, `or`, `not`

---

## 6) Schleifen

### 6.1 `for`-Schleife (Zählschleife)

```lua
for i = 1, 5 do
  print("i =", i)
end
```

Mit Schrittweite:

```lua
for i = 10, 0, -2 do
  print(i)
end
```

### 6.2 `while`-Schleife

```lua
local count = 1
while count <= 3 do
  print("count =", count)
  count = count + 1
end
```

### 6.3 `repeat ... until`

⚠️ `repeat ... until` läuft mindestens einmal.

```lua
local x = 0
repeat
  x = x + 1
  print("x =", x)
until x == 3
```

---

## 7) Funktionen

```lua
local function quadrat(n)
  return n * n
end

print(quadrat(5))  -- 25
```

Mehrere Rückgabewerte sind möglich:

```lua
local function minmax(a, b)
  if a < b then
    return a, b
  else
    return b, a
  end
end

local klein, gross = minmax(9, 2)
print(klein, gross) -- 2  9
```

---

## 8) Tabellen

Tabellen sind das wichtigste Datenkonstrukt in Lua.

Tabellen sind **Arrays**, **Dictionaries** und **Objekte** in einem.

### 8.1 Als Liste (Array)

```lua
local farben = { "rot", "grün", "blau" }

print(farben[1]) -- rot (Lua zählt ab 1!)

for i = 1, #farben do
  print(i, farben[i])
end
```

Die `#` ist der Längenoperator für Listen. Dieser gibt die Länge einer Liste
zurück. Bspw.: `#farben`

### 8.2 Als Wörterbuch (Key-Value)


```lua
local person = {
  name = "Mila",
  alter = 16
}

print(person.name)      -- Mila
print(person["alter"])  -- 16
```

Iterieren:

```lua
for key, value in pairs(person) do
  print(key, value)
end
```

Für Listen nutzt man oft `ipairs`:

```lua
for i, v in ipairs(farben) do
  print(i, v)
end
```

---

## 9) Ein kleines Mini-Projekt: Zahlen raten

```lua
math.randomseed(os.time())
local geheim = math.random(1, 10)

print("Ich denke an eine Zahl von 1 bis 10.")

while true do
  io.write("Dein Tipp: ")
  local eingabe = io.read()
  local tipp = tonumber(eingabe)

  if tipp == nil then
    print("Bitte eine Zahl eingeben!")
  elseif tipp < geheim then
    print("Zu klein.")
  elseif tipp > geheim then
    print("Zu groß.")
  else
    print("Richtig! 🎉")
    break
  end
end
```

---

## 10) Häufige Stolperstellen

- Lua zählt Listen **ab 1**, nicht ab 0.
- `=` ist Zuweisung, `==` ist Vergleich.
- `nil` bedeutet „kein Wert“ (z. B. Schlüssel existiert nicht).
- Strings verketten mit `..` (nicht mit `+`).

---

## 11) Nützliche Standardfunktionen (kleine Auswahl)

```lua
print(type(123))          -- "number"
print(tonumber("42"))     -- 42
print(tostring(99))       -- "99"

print(math.floor(3.7))    -- 3
print(math.random(1, 6))  -- Würfel

local s = "Hallo"
print(#s)                  -- Länge des Strings (5)
print(string.sub(s, 2, 4)) -- "all"
```

---

## 12) Kleine Übungsaufgaben

1. Schreibe eine Funktion `istGerade(n)`, die `true` oder `false` zurückgibt.
2. Lege eine Liste mit 5 Namen an und gib sie nummeriert aus.
3. Schreibe ein Programm, das die Summe aller Zahlen von 1 bis 100 berechnet.
4. Erstelle eine Tabelle `inventar` (Wörterbuch) mit Gegenständen und Stückzahlen und gib alle Einträge aus.

---
