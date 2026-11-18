# Serwisy inwestycji mieszkaniowych z panelem administracyjnym

Property websites with server-rendered listings, SQLite administration, and localized search.

## Problem

Właściciel inwestycji potrzebuje aktualizować lokale i zapytania, a odwiedzający szukać mieszkań na podstawie parametrów. Kilka serwisów wykorzystuje podobny podział na część publiczną i panel, dopasowany osobno do każdego katalogu.

## Jak działa projekt

1. **Działowskiego Zacisze:** serwis PHP/SQLite renderuje strony po stronie serwera, z wyszukiwaniem i narzędziami po stronie przeglądarki.
2. **H Investments:** witryna korporacyjna i nieruchomościowa z panelem oraz jednorazową aktywacją pierwszego administratora.
3. **Quattro Invest:** dane o inwestycjach, lokalach, zapytaniach i treściach w SQLite poza publicznym katalogiem. Obsługa XLSX jest ładowana w panelu na żądanie.
4. **Sternicza 57:** wielopodstronowy katalog pokazowy z wyszukiwaniem lokali i trwałym panelem zarządzania.

## Technologie

PHP, SQLite, HTML renderowany po stronie serwera, JavaScript i lokalne fonty.

## Co można sprawdzić

Każdy przypadek dotyczy odrębnego wariantu katalogu. Publiczny opis nie zawiera danych paneli ani rekordów handlowych.

[Wróć do spisu studiów przypadków](README.md).
