# LayerLab — prototyp sklepu druku 3D

Static prototype for a multilingual 3D printing storefront, product catalogue and quote calculator.

## Problem

LayerLab pokazuje wspólną witrynę dla gotowych produktów drukowanych w 3D i zamówień indywidualnych. Klient może porównać katalog z orientacyjną wyceną drukowania własnego modelu.

## Jak działa projekt

1. Katalog i filtry działają w przeglądarce, a koszyk i lista ulubionych korzystają z localStorage.
2. Konfigurator oblicza orientacyjną cenę. Formularz przyjmuje lokalny plik do demonstracji walidacji i pokazuje krok zapytania o wycenę.
3. Osobne trasy PL, EN i UK zawierają tłumaczenia, canonical i hreflang. Strona obsługuje klawiaturę i preferencję ograniczonego ruchu.
4. Checkout demonstruje podsumowanie. Płatność i przekazanie pliku do realizacji pozostają poza prototypem.

## Technologie

HTML, CSS i JavaScript, bez serwera aplikacyjnego.

## Zakres weryfikacji

W lokalnym prototypie sprawdzono składnię JavaScript i odwołania do lokalnych zasobów na 30 stronach. Sklep symuluje koszyk i wycenę.

[Wróć do spisu studiów przypadków](README.md).
