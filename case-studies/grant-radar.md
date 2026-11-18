# GrantRadar — monitoring projektów dofinansowanych

Dashboard for finding and qualifying Polish AI and digital projects from funding records.

## Problem

GrantRadar zbiera dane o projektach grantowych, żeby zespół mógł rozpoznać firmy i projekty powiązane z AI lub cyfryzacją oraz wrócić do oficjalnego źródła.

## Jak działa projekt

1. Panel może uruchomić skan CORDIS/EURIO przez SPARQL. Skaner krajowy ma osobny import wyników w formacie JSON.
2. Dane projektu i firmy trafiają do wspólnego modelu oraz zachowują źródło i atrybuty użyte do punktacji.
3. Baza umożliwia filtrowanie po etapie, progu punktacji i tekście. Użytkownik otwiera kartę projektu oraz eksportuje wybrane wyniki.
4. Widok skanów pokazuje przebiegi i konfigurację źródeł. Wyniki służą do researchu i oceny przez operatora.

## Technologie

React, TypeScript, Vinext, API HTTP, Node.js, Cloudflare D1 i Drizzle.

## Zakres weryfikacji

Model danych przechowuje osobno wykryte projekty i przebiegi skanowania. Wpis zawiera m.in. źródło, identyfikator projektu, pozycję w procesie, punktację i stan weryfikacji kontaktu.

[Wróć do spisu studiów przypadków](README.md).
