# Lua Lektion 05 (Teil b): Tabellen als Objekte



<!-- mtoc-start -->

  * [Tabelle als Objekte](#tabelle-als-objekte)
  * [Exkurs: Schreibweisen von Funktionsdefinitionen](#exkurs-schreibweisen-von-funktionsdefinitionen)
  * [Anwendung der Funktionen in der Tabelle `dialog`](#anwendung-der-funktionen-in-der-tabelle-dialog)
  * [Aufgabe 4](#aufgabe-4)
  * [Aufgabe 5](#aufgabe-5)
  * [Aufgabe 6](#aufgabe-6)
* [Tabellen als Objekte (objektorientiert in Lua)](#tabellen-als-objekte-objektorientiert-in-lua)
  * [Ein einfacher Punktezähler](#ein-einfacher-punktezaehler)
  * [Der Haken an der ersten Version des Punktezählers](#der-haken-an-der-ersten-version-des-punktezaehlers)
  * [Aufgabe 7](#aufgabe-7)
  * [Aufgabe 8](#aufgabe-8)
  * [Aufgabe 9](#aufgabe-9)
  * [Es geht noch besser: Eine Fabrik für Punktezähler](#es-geht-noch-besser-eine-fabrik-fuer-punktezaehler)
* [Was wir hier ausgelassen haben & Schlusswort](#was-wir-hier-ausgelassen-haben--schlusswort)
  * [Verschachtelte Tabellen](#verschachtelte-tabellen)
  * [Metatabellen](#metatabellen)
  * [Quellen zum Weiterlernen](#quellen-zum-weiterlernen)
    * [Technische Bücher](#technische-buecher)

<!-- mtoc-end -->

## Tabelle als Objekte

In den bisherigen Beispielen dieser Lektion haben wir lediglich Strings in
Tabellen gespeichert. Es lassen sich aber grundsätzlich Werte **jeden Typs** in
einer Tabelle speichern: Zahlen, Booleans, andere Tabellen und auch Funktionen.

Tabellen, die Funktionen enthalten, sind in den vorherigen Lektionen bereits
häufiger vorgekommen:

- `io.read()`
- `math.random()`
- `table.remove()`
- `table.insert()`

`io`, `math` und `table` sind sogenannte **Libraries** (Bibliotheken), welche
Funktionen zu jeweils einem bestimmten Aufgabengebiet versammeln und
bereitstellen.

Das folgende Beispiel zeigt, wie ihr selbst Funktionen in eine Tabelle
„verpacken“ könnt:

```lua
dialog = {

  begruessung = function()
    print("Hallo, wie gehts?")
  end,

  abschied = function()
    print("Tschüss, mach's gut!")
  end

}
```


---

## Exkurs: Schreibweisen von Funktionsdefinitionen

Die Schreibweise der Funktionsdefinition innerhalb der Tabelle bedarf der
Erläuterung. Üblicherweise definieren wir in Lua Funktionen auf folgende Weise:

```lua
function gruss()
  print("guten tag!")
end
```

Tatsächlich ist dies Kurzschreibweise für:

```lua
gruss = function()
  print("guten tag!")
end
```

Der Ausdruck rechts vom `=` liefert eine Funktion, die der Variablen `gruss`
zugewiesen wird.

Wenn ihr eine Funktion **innerhalb einer Tabelle** definieren wollt,
funktioniert nur die letztgenannte Schreibweise.

---

## Anwendung der Funktionen in der Tabelle `dialog`

Die Benutzung der Funktionen aus der Tabelle `dialog` sieht aus wie folgt –
ganz genau so wie bei `io.read()` oder `math.random()`:

```text
$ dialog.begruessung()
Hallo, wie geht's?
$ dialog.abschied()
Tschüss, mach's gut!
```

Man könnte die Funktion auch so aufrufen – unnötig kompliziert, aber inhaltlich
korrekt:

```lua
dialog["begruessung"]()
```

Weil genau das im Hintergrund passiert:

> „Nimm das, was unter dem Schlüssel `begruessung` in der Tabelle `dialog`
> gespeichert ist und rufe es als Funktion auf.“

---

## Aufgabe 4

Füge der Tabelle `dialog` eine weitere Funktion `smalltalk()` hinzu, die bei
Aufruf eine Gesprächsfloskel wie „Schönes Wetter heute.“ ausgibt. Teste das
Programm in der Konsole.

<details>
<summary>▽ Lösung</summary>

```lua
dialog = {

  begruessung = function()
    print("Hallo, wie gehts?")
  end,

  smalltalk = function()
    print("Schönes Wetter heute!")
  end,

  abschied = function()
    print("Tschüss, mach's gut!")
  end

}
```
</details>


---

## Aufgabe 5

Gestalte die Dialog-Funktionen etwas persönlicher: Bei `dialog.begruessung()`
soll ein Name als Argument übergeben und in den Gruß eingebaut werden:

```text
$ dialog.begruessung("Maria")
Hallo Maria, wie geht's?
$ dialog.abschied("Maria")
Tschüss Maria, mach's gut!
```

<details>
<summary>▽ Lösung</summary>

```lua
dialog = {

  begruessung = function(name)
    print("Hallo " .. name .. ", wie gehts?")
  end,

  smalltalk = function()
    print("Schönes Wetter heute!")
  end,

  abschied = function(name)
    print("Tschüss " .. name .. ", mach's gut!")
  end

}
```

</details>


---

## Aufgabe 6

`math` ist eine Tabelle, die Funktionen enthält – wir haben sie bereits in
Lektion 2 verwendet, um mit `math.random()` Zufallszahlen zu erzeugen. Kannst
Du die Namen aller Funktionen ausgeben, die in `math` enthalten sind?

<details>
<summary>▽ Lösung</summary>

```lua
for name in pairs(math) do
  print(name)
end
```

Anmerkung: Wir benötigen hier von jedem Eintrag in der Tabelle `math` nur den
jeweils ersten Rückgabewert von `pairs()`.

</details>


---

# Tabellen als Objekte (objektorientiert in Lua)

In der Informatik steht der Begriff **Objekt** für eine Zusammenfassung von
zusammengehörigen Eigenschaften und Funktionen. In vielen Situationen ist es
sinnvoll, die Aufgaben innerhalb eines Programms auf solche Objekte zu
verteilen. Objekte können etwa Raumschiffe oder feindliche Aliens in einem
Computerspiel sein. Oder, weniger spektakulär: Kundenkonten oder Produkte in
einem Online-Shop.

In diesem letzten Abschnitt geben wir einen Überblick, wie in Lua
„objektorientiert“ programmiert wird. Das Thema ist anspruchsvoll; wenn bei der
ersten Auseinandersetzung nicht alles sofort klar ist, ist das völlig normal
und sollte nicht entmutigen.

---

## Ein einfacher Punktezähler

Stellen wir uns vor, wir wollen für ein Computerspiel einen ganz einfachen
Punktezähler programmieren, der lediglich zwei Eigenschaften hat:

- Den Namen des Spielers
- Die Anzahl der Punkte

Zudem soll es zwei Funktionen geben:

- Die Punktzahl um 1 erhöhen
- Den aktuellen Punktestand in schöner Form angeben

Das lässt sich in Lua leicht mit einer Tabelle umsetzen:

```lua
p = {

  name = "Sigrid",

  punkte = 0,

  punkten = function()
    p.punkte = p.punkte + 1
  end,

  drucken = function()
    print("Punktestand " .. p.name .. ": " .. p.punkte)
  end

}
```

Erklärung:

- Eigenschaft `name`
- Eigenschaft `punkte`, initialisiert mit `0`
- Funktion `punkten()`: `p.punkte` verweist auf den in der Tabelle gespeicherten Punktestand
- Funktion `drucken()`: `p.name` verweist auf den in der Tabelle gespeicherten Namen

⚠️ Die einzelnen Elemente in einer Tabelle sind immer durch Kommas getrennt.
Vergessene Kommas sind eine sehr häufige Fehlerquelle, auch unter Profis.

Eine Anwendung auf der Konsole sieht dann so aus. Jeder Aufruf der Funktion
`punkten()` erhöht den Punktestand um 1:

```text
$ p.drucken()
Punktestand Sigrid: 0
$ p.punkten()
$ p.drucken()
Punktestand Sigrid: 1
$ p.punkten()
$ p.drucken()
Punktestand Sigrid: 2
```

---

## Der Haken an der ersten Version des Punktezählers

Schaut euch den Code des Punktezählers noch einmal genau an: Die in der Tabelle
`p` enthaltenen Funktionen `punkten()` und `drucken()` enthalten Verweise auf
`p`, also auf die Tabelle selbst. Andernfalls könnten diese Funktionen die
Eigenschaften von `p` (also `name` und `punkte`) nicht abfragen und verändern:

```lua
punkten = function()
  p.punkte = p.punkte + 1
end
```

Solange das Spiel nur von einer einzigen Person gespielt wird, ist das kein
Problem. Was aber, wenn es mehrere Spieler geben sollte? Dann müsstet ihr für
jeden Spieler den kompletten Code kopieren, und an allen Stellen, wo `p` steht
(es sind 5!), `p2` einsetzen.

Das geht besser: Wir machen die Funktionen unabhängig von einer bestimmten
Tabelle (Spieler). Dazu bekommen die Funktionen ein Argument, das auf den
jeweiligen Punktezähler selbst verweist. Üblich ist dafür der Name `self`.

```lua
function punkten(self)
  self.punkte = self.punkte + 1
end

function drucken(self)
  print("Punktestand " .. self.name .. ": " .. self.punkte)
end
```

Jetzt ist es im zweiten Schritt möglich, beliebig viele Punktezähler zu
erzeugen und ihnen diese allgemeine Form der beiden Funktionen hinzuzufügen:

```lua
p1 = {
  name = "Sigrid",
  punkte = 0,
  punkten = punkten,
  drucken = drucken,
}

p2 = {
  name = "Theodor",
  punkte = 0,
  punkten = punkten,
  drucken = drucken
}
```

Die Anwendung dieses modifizierten Punktezählers auf der Konsole könnte so
aussehen:

```text
$ p1.drucken(p1)
Punktestand Sigrid: 0
```

Dass wir nun aber `p1` zweimal hinschreiben müssen, ist sehr unschön. Dafür hat
Lua eine verkürzte Schreibweise: Wenn wir statt eines Punktes einen Doppelpunkt
schreiben, wird die Tabelle selbst automatisch als erstes Argument eingesetzt:

```text
$ p1:drucken()
Punktestand Sigrid: 0
```

---

## Aufgabe 7

Teste die beiden Punktezähler `p1` und `p2` auf der Konsole mit der
vorgestellten Schreibweise. Überzeuge Dich davon, dass die beiden Zähler
unabhängig voneinander sind.

---

## Aufgabe 8

Füge den Punktezählern eine Funktion `zuruecksetzen()` hinzu, welche den
Punktestand auf `0` setzt. Teste die Funktion auf der Konsole.

<details>
<summary>▽ Lösung</summary>

```lua
function punkten(self)
  self.punkte = self.punkte + 1
end

function zuruecksetzen(self)
  self.punkte = 0
end

function drucken(self)
  print("Punktestand " .. self.name .. ": " .. self.punkte)
end

p1 = {
  name = "Sigrid",
  punkte = 0,
  punkten = punkten,
  zuruecksetzen = zuruecksetzen,
  drucken = drucken,
}

p2 = {
  name = "Theodor",
  punkte = 0,
  punkten = punkten,
  zuruecksetzen = zuruecksetzen,
  drucken = drucken
}
```

</details>

---

## Aufgabe 9

Füge dem Punktezähler eine weitere Funktion `bonus()` hinzu, welche ein Argument
`betrag` erwartet und den Punktestand um den Betrag erhöht. Teste die Funktion
auf der Konsole.

<details>
<summary>▽ Lösung</summary>

```lua
function punkten(self)
  self.punkte = self.punkte + 1
end

function zuruecksetzen(self)
  self.punkte = 0
end

function bonus(self, betrag)
  self.punkte = self.punkte + betrag
end

function drucken(self)
  print("Punktestand " .. self.name .. ": " .. self.punkte)
end

p1 = {
  name = "Sigrid",
  punkte = 0,
  punkten = punkten,
  zuruecksetzen = zuruecksetzen,
  betrag = betrag,
  drucken = drucken,
}

p2 = {
  name = "Theodor",
  punkte = 0,
  punkten = punkten,
  zuruecksetzen = zuruecksetzen,
  betrag = betrag,
  drucken = drucken
}
```

</details>

---

## Es geht noch besser: Eine Fabrik für Punktezähler

Die zuletzt gezeigte Variante ist zwar schon ein gewaltiger Fortschritt im
Vergleich zum ersten Versuch. Trotzdem müssen wir immer noch für jeden neuen
Zähler jede Menge Code schreiben.

Zum Schluss zeigen wir eine Variante, die noch knapper ist. Hier definieren wir
eine Funktion `erzeuge_zaehler()`, die jeweils einen kompletten Zähler
zurückliefert. Eine Funktion, die Objekte produziert, nennt man übrigens auch
**Fabrik** (englisch: *Factory*).

```lua
function punkten(self)
  self.punkte = self.punkte + 1
end

function drucken(self)
  print("Punktestand " .. self.name .. ": " .. self.punkte)
end

function erzeuge_zaehler(name)

  return {
    name = name,
    punkte = 0,
    punkten = punkten,
    drucken = drucken,
  }

end

p1 = erzeuge_zaehler("Sigrid")
p2 = erzeuge_zaehler("Theodor")
```

Erklärung:

- Zeilen 1–7 definieren wie gehabt die beiden Funktionen `punkten()` und `drucken()`.
- Zeilen 9–18 definieren die Factory-Funktion.
- Der Name unterscheidet neue Zähler (per Argument).
- Der Rückgabewert ist ein komplettes Zähler-Objekt.
- Für neue Zähler genügt jetzt ein einzeiliger Befehl.

---

# Was wir hier ausgelassen haben & Schlusswort

In den ersten vier Lektionen ist es (hoffentlich!) gelungen, einen Großteil der
wichtigsten Infos zu dem jeweiligen Thema vorzustellen. Trotz des im Vergleich
zu den vorherigen Lektionen doppelten Umfangs konnten wir das zum Thema
Tabellen nicht leisten.

Tabellen sind der mit Abstand wichtigste und leistungsfähigste Datentyp der
Programmiersprache Lua. Gerade das letzte Beispiel hat hoffentlich deutlich
gemacht, wie flexibel und vielgestaltig Tabellen einsetzbar sind. Wir konnten
hier tatsächlich nur an der Oberfläche kratzen. Es lohnt sich, hier auf eigene
Faust weiter zu lernen und zu experimentieren. Im Folgenden liefern wir dazu
ein paar Stichworte und Hinweise.

---

## Verschachtelte Tabellen

Tabellen können Tabellen enthalten. Das kann zum Beispiel so aussehen:

```lua
schrank = {
    schachtel = {"murmel", "postkarte", "puppe"},
    koffer = {"hose", "jacke", "schuhe"}
  }
}
```

Eine witzige und lehrreiche Übung hierzu wäre, nach dem Vorbild unseres Zählers
einen Behälter zu programmieren, mit einer inneren Tabelle für den Inhalt und
drei Funktionen `hineintun()`, `herausholen()` und `inhalt_drucken()`, hier als
Skizze:

```lua
behaelter = {
    inhalt = {"murmel", "postkarte", "puppe"},
    hineintun = ...,
    herausholen = ...,
    inhalt_drucken = ...
  }
}
```

---

## Metatabellen

Das umfangreichste hier ausgelassene Thema betrifft die sogenannten
**Metatabellen**. Jede Tabelle `T` lässt sich mit einer Metatabelle `M`
verknüpfen. Die in `M` gespeicherten Funktionen können modifizieren, wie sich
`T` in bestimmten Situationen verhält, etwa:

- Wenn ein Schlüssel abgefragt wird, unter dem nichts eingetragen ist
- Wenn unter einem Schlüssel erstmals etwas eingetragen wird
- Wenn die Tabelle wie eine Funktion aufgerufen wird, also `T()`
- Wenn eine Tabelle mit einer anderen Tabelle oder einem Wert addiert, multipliziert etc. wird
- Sogar das Verhalten von `pairs()` und `ipairs()` lässt sich mittels der Metatabellen modifizieren.

Auf diese Weise lassen sich sehr nützliche und merkwürdige Verhaltensweisen
programmieren. Etwa eine Tabelle, die sich von außen so verhält, als ob sie
unendlich viele Einträge hat; tatsächlich aber den jeweiligen Inhalt nur
berechnet und für spätere Verwendung speichert, wenn er abgefragt wird.

Oder es lässt sich mittels Tabellen ein Zahlentyp definieren, der normalerweise
genau rechnet, nur bei `7 * 7` kommt „feiner Sand“ heraus.

Kurz und gut: Die Programmierung per Metatabellen ist höchst faszinierend und
in der Familie von tausenden Programmiersprachen ungewöhnlich. Es macht den
Reiz von Lua aus, dass sich mittels geschickter Anordnung von Tabellen
buchstäblich jedes Verhalten erreichen lässt, das überhaupt von einem
Computerprogramm erwartet werden kann. Der Phantasie sind hier keine Grenzen
gesetzt.

Eine (leider nur in englischer Sprache) vorliegende Auflistung aller
Metatabellen-Schlüssel findet ihr [hier](http://lua-users.org/wiki/MetatableEvents).

---

## Quellen zum Weiterlernen


[Let’s code Lua! - Dein Einstieg in die Spieleprogrammierung](https://www.rheinwerk-verlag.de/lets-code-lua-dein-einstieg-in-die-spielprogrammierung/)

Entdecke die vielfältigen Möglichkeiten von Lua! In diesem Buch lernst du
spielerisch das Programmieren und erschaffst dabei deine eigenen Games, ganz
ohne Vorkenntnisse. Die Programmiersprache Lua ist ideal für Einsteiger, da sie
leicht zu lernen ist und schnelle Erfolgserlebnisse bringt.Tauche ein in die
spannende Fantasywelt des jungen Zauberers Marvin und programmiere Schritt für
Schritt unterhaltsame Minispiele. Von interaktiven Geschichten über »Feuer,
Wasser, Eis« bis zu einem 2D-Actionspiel in der »Cave of Doom«. So eignest du
dir die Grundlagen der Programmierung an – wie Variablen, Arrays und Schleifen.
Maxime Wegesin bringt dir in diesem Buch alles bei, was du brauchst, um coole
Games zu programmieren!

Schnelle Lernerfolge mit der einfachen Programmiersprache Lua
Spiel für Spiel: Programmierbasics lernen durch Minigames
Zeig, was du gelernt hast, in der »Cave of Doom«!


### Technische Bücher

- [*Programming in Lua*, First Edition (englisch)](https://www.lua.org/pil/contents.html)
- [Lua 5.1 Referenzhandbuch (deutsch)](https://www.lua.org/manual/5.1/de/)

Beide Bücher sind etwas technisch geschrieben und richten sich eher an Personen
mit Informatik-Kenntnissen. Aber wenn ihr diesen Kurs gemeistert habt, solltet
ihr auch mit den Büchern zurechtkommen.
