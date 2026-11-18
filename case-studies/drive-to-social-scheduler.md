# Drive → Meta — harmonogram publikacji dla salonu

Photo publishing workflow for a barbershop using Google Drive inventory and Meta scheduling.

## Problem

Salon przechowuje zdjęcia fryzur w Google Drive i chce regularnie pokazywać nowe realizacje. Proces musi odróżnić zdjęcia dotychczas nieużywane od prac opublikowanych wcześniej i uwzględnić różne mechanizmy Facebooka i Instagrama.

## Jak działa projekt

1. Inwentaryzacja porównuje rekordy Drive i bezpośredni odczyt folderu. Przy braku kompletnego odczytu proces odnotowuje ten stan.
2. Materiał przechodzi kontrolę historii, wybór w kolejności i opis dopasowany do zdjęcia. Publikacja odsyła do rezerwacji wizyty.
3. Proces planuje Facebook z wyprzedzeniem, zapisuje termin Instagrama lokalnie i uruchamia tylko właściwą pozycję kolejki.
4. Zapisany wynik jest uzgadniany z API przed rozważeniem ponownej próby. Wyjątki w kalendarzu zastępują standardowy termin i nie tworzą podwójnej publikacji.

## Technologie

Python, Google Drive, Meta Graph API, rejestr stanu i czas Europe/Warsaw.

## Zakres weryfikacji

Logikę wyboru wolnych terminów sprawdzono offline na fikcyjnym kalendarzu, w tym w wariancie z wyjątkiem i limitem kolejki.

[Wróć do spisu studiów przypadków](README.md).
