# Sklep katalogowy z konfiguratorem frontów

Case study of a multilingual flooring and furniture-front catalogue with parallel order and quote flows.

## Problem

Sklep dla dystrybutora materiałów obsługuje podłogi, chemię oraz fronty na wymiar. Różne zasady cen i dostępności wymagają rozróżnienia produktu do zamówienia od pozycji do indywidualnej wyceny.

## Jak działa projekt

1. Skrypty agregują dane producentów i warianty, generują kategorie oraz podstrony w PL, EN i DE. Konfigurator zachowuje dekor, konstrukcję, wymiary i potrzebne informacje o wykończeniu.
2. Koszyk mieszany rozdziela pozycje z potwierdzoną ceną od zapytań. Brak kosztu transportu kieruje sprawę do wyceny.
3. Niewielkie API PHP przelicza wartości po stronie serwera i nadaje identyfikator po zapisie. Testowy checkout pokazuje przebieg bez pobierania płatności.
4. Walidatory porównują warianty, media i podstrony. Testy obejmują m.in. ceny, oba typy koszyka, wersje językowe i obsługę mobilną.

## Technologie

Node.js, JavaScript, HTML, CSS i PHP.

## Co można sprawdzić

Opis wersji testowej. Zakres publiczny obejmuje architekturę katalogu i checkoutu bez danych handlowych ani materiałów producentów.

[Wróć do spisu studiów przypadków](README.md).
