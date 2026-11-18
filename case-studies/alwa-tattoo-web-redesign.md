# ALWA Tattoo — redesign serwisu studia

Portfolio and booking website redesign with accessible galleries and static deployment.

## Problem

Studio potrzebowało przejrzystej prezentacji stylów, zdjęć realizacji, informacji o wizycie i odnośnika do rezerwacji. Projekt porządkuje treści w dziewięciu podstronach i osobnym portfolio.

## Jak działa projekt

1. Usługi mają własne strony i metadane. Landing, zdjęcia studia i galerie tworzą wspólną nawigację do rezerwacji Booksy.
2. Galeria obsługuje powiększanie klawiaturą. Lokalnie osadzone fonty zapewniają polskie znaki, a animacje respektują preferencję ograniczonego ruchu.
3. Eksport statyczny zawiera warianty obrazów, sitemapę, robots, dane strukturalne i manifest plików.
4. Skrypt po publikacji porównuje publiczne zasoby z manifestem, sprawdza typy plików, przekierowania, canonical oraz 404.

## Technologie

React, TypeScript, Node.js, HTML generowany statycznie i Hostinger.

## Co można sprawdzić

Publiczny rezultat projektu jest dostępny na [stronie studia](https://alwatattoo.pl/). Repozytorium przedstawia realizację i sposób jej kontroli.

[Wróć do spisu studiów przypadków](README.md).
