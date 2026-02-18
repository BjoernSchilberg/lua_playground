# Lua – Funktionen (Lektion)

Wir haben bereits ab der ersten Lektion Funktionen verwendet:

- `print()`
- `type()`
- `io.read()`
- `tonumber()`
- `math.random()`

Du kannst Dir eine Funktion wie eine Portion Code vorstellen, die Du zum wiederholten Ausführen zusammenfasst. Genau so gut und richtig ist die Idee, eine Funktion als ein Unterprogramm zu sehen, das auf eine bestimmte Aufgabe spezialisiert ist. Anstatt an jeder Stelle, in der Du ihn brauchst, den kompletten Code hinzuschreiben, kannst Du ihn in eine Funktion verpacken und diese Funktion dann an beliebigen Stellen in Deinem Programm verwenden.

Die Verwendung einer Funktion wird oft **Funktionsaufruf** genannt. Ein Funktionsaufruf besteht im Normalfall aus dem Namen der Funktion und einem Paar runder Klammern. Zwischen den Klammern stehen oft ein oder mehrere **Argumente**. Argumente sind Werte, welche genauer beschreiben, was die Funktion machen soll.

---

## Funktionsaufruf: Name + Klammern + Argumente

```lua
print("guten tag")
```

Ausgabe:

```
guten tag
```

In diesem Fall ist der Name der Funktion `print()`. Das Argument ist der String `"guten tag"`.

Manche Funktionen können auch mehrere Argumente verarbeiten, das gilt auch für `print()`:

```lua
print("dies", "das", "jenes")
```

Ausgabe:

```
dies das jenes
```

Andere Funktionen benötigen kein Argument, zum Beispiel `io.read()`. Die runden Klammern gehören trotzdem immer zum Funktionsaufruf:

```lua
eingabe = io.read()
```

Die runden Klammern unterscheiden den Funktionsaufruf von der Funktion selbst:

```lua
type(print)    -- "function"
type(print())  -- "nil"
```

`io.read()` ist eine Funktion, die einen Wert zurückliefert.

---

## Eine Pizzeria programmieren

Stell Dir vor, Du möchtest ein Textadventure programmieren, in dem es um den Betrieb einer Pizzeria geht. Jedes Mal, wenn ein Kunde eine Pizza bestellt, soll das Programm den Arbeitsablauf der Zubereitung beschreiben. Eine erste Variante könnte so aussehen:

```lua
print("Teig ausrollen")
print("Tomatensoße hinzu")
print("geriebenen Käse hinzu")
print("backen")
```

---

## Die Pizza per Funktion zubereiten

Aus diesem Code wird eine Funktion:

```lua
function pizza_backen()
  print("Teig ausrollen")
  print("Tomatensoße hinzu")
  print("geriebenen Käse hinzu")
  print("backen")
end
```

- `function` bedeutet: hier kommt eine Funktionsdefinition.
- `pizza_backen` ist der Name der Funktion.
- Die leeren runden Klammern `()` zeigen: keine Argumente.
- Bis zum `end` steht der Code, der beim Aufruf ausgeführt wird (der **Funktionskörper**).

Wenn Du das Beispiel ausführst, passiert erst einmal nichts: Du hast nur definiert. Ein Rezept ist noch keine Pizza! Zum Verwenden:

```lua
pizza_backen()
```

---

## Aufgabe 1

Schreibe eine eigene Funktion `tee_kochen()`, welche die Zubereitungsschritte einer Tasse Tee in den drei Schritten „Wasser kochen“, „Teebeutel in Tasse hängen“ und „Wasser aufgießen“ nach dem Muster unserer Pizza-Funktion beschreibt. Führe die Funktion drei Mal aus.

**▽ Lösung (Platzhalter)**

---

## Funktionen rufen Funktionen auf

Code innerhalb einer Funktion kann wiederum andere Funktionen aufrufen (z. B. `print()`). Selbst geschriebene Funktionen können auch andere selbst geschriebene Funktionen aufrufen. Bei größeren Programmen zerlegt man Aufgaben oft in viele kleine, gut verständliche Funktionen.

---

## Aufgabe 2

Schreibe eine Funktion `teig_zubereiten()`, welche die Beschreibung der Zubereitung eines Pizza-Teiges ausgibt:

- Wasser, Mehl, Hefe, Öl und Salz in Schüssel geben
- Zutaten rühren
- Teig gehen lassen

Rufe diese Funktion innerhalb der Funktion `pizza_backen()` auf, bevor der Teig ausgerollt wird.

**▽ Lösung (Platzhalter)**

---

## Die Pizzafunktion um ein Argument erweitern

Statt für jede Sorte fast denselben Code zu schreiben, fassen wir die Unterschiede zusammen – mit einem Argument `extrabelag`:

```lua
function pizza_backen(extrabelag)
  print("Teig ausrollen")
  print("Tomatensoße hinzu")
  print(extrabelag .. " hinzu")
  print("geriebenen Käse hinzu")
  print("backen")
end
```

Aufrufe:

```lua
pizza_backen("Pilze")
pizza_backen("Spiegelei")
pizza_backen("Vanilleeis")
```

### Aufruf ohne Argument → Fehler

Wenn ihr sie ohne Argument aufruft, ist `extrabelag` gleich `nil`, und dann klappt `extrabelag .. " hinzu"` nicht:

```lua
pizza_backen()
-- attempt to concatenate local 'extrabelag' (a nil value)
```

---

## Aufgabe 3

Wie können wir den Fehler verhindern, wenn jemand eine einfache Margherita ohne Extrabelag wünscht?

Tipps: Du brauchst `if`, und `nil` wird wie `false` bewertet.

**▽ Lösung (Platzhalter)**

---

## Aufgabe 4

Schreibe eine Funktion, die **zwei** Extrabeläge auf die Pizza bringen kann. Hinweis: mehrere Argumente werden mit Kommas getrennt.

**▽ Lösung (Platzhalter)**

---

## Funktionen mit Rückgabewert

Zwei grobe Kategorien:

1. Funktionen, die etwas machen (z. B. `print()`).
2. Funktionen, die einen Wert zurückliefern (z. B. `type()`, `tonumber()`).

Beispiele:

```lua
type(10)            -- "number"
tonumber("42")      -- 42
tonumber("sieben")  -- nil
```

---

## Die Funktion `plus_sieben`

```lua
function plus_sieben(x)
  return x + 7
end
```

Beispiele:

```lua
plus_sieben(3)   -- 10
plus_sieben(7)   -- 14
plus_sieben(-5)  -- 2
```

---

## Aufgabe 5

Schreibe nach dem Muster von `plus_sieben()` folgende Funktionen und teste sie:

- `plus_drei()`
- `minus_fuenf()`
- `mal_zehn()`
- `geteilt_durch_drei()`

**▽ Lösung (Platzhalter)**

---

## Aufgabe 6

Schreibe eine Funktion, die `true` zurückliefert, wenn das Argument `x` eine Zahl ist (`type(x) == "number"`), sonst `false`. Teste die Funktion.

**▽ Lösung (Platzhalter)**

---

## Aufgabe 7

Schreibe eine Funktion `ist_dazwischen(wert, von, bis)`, die `true` zurückgibt, wenn `wert` genau zwischen `von` und `bis` ist, sonst `false`.

**▽ Lösung (Platzhalter)**

---

## Mehrere `return`s in einer Funktion: `begrenze`

```lua
function begrenze(wert, von, bis)

  if wert < von then
    return von
  end

  if wert > bis then
    return bis
  end

  return wert

end
```

Beispiele:

```lua
begrenze(5, 0, 10)    -- 5
begrenze(-3, 0, 10)   -- 0
begrenze(20, 0, 10)   -- 10
```

---

## `return` statt `break`

`break` verlässt eine Schleife, `return` verlässt eine Funktion. Beispiel:

```lua
function wuerfel_bis_sechs()

  while true do
    zahl = math.random(6)
    print(zahl)

    if zahl == 6 then
      break
    end
  end

end
```

---

## Aufgabe 8 (für Fortgeschrittene)

Schreibe eine Funktion `zahl_eingeben()`. Sie soll ungültige Eingaben (die sich nicht mit `tonumber()` in eine Zahl umwandeln lassen) abfangen und so lange nachfragen, bis eine gültige Zahl eingegeben wurde. Diese soll dann als Zahl zurückgeliefert werden.

**▽ Lösung (Platzhalter)**

---

## Ausblick: Themen, die wir ausgelassen haben

### Mehrere Rückgabewerte

```lua
function mehrere()
  return 1, 2, 3
end

a, b, c = mehrere()
```

### Rekursion (Selbstaufruf)

```lua
function selbstaufrufer()
  selbstaufrufer()
end
```

### Funktionen als Werte (und „Abkürzung“ bei Funktionsdefinitionen)

```lua
drucke = print
drucke("hallo")
```

Das hier …

```lua
function gruss()
  print("guten tag!")
end
```

… ist eigentlich …

```lua
gruss = function()
  print("guten tag!")
end
```

Funktionen können daher auch als Argumente übergeben oder als Rückgabewerte zurückgegeben werden (Funktionen zweiter Ordnung) – ein Thema für Fortgeschrittene.
