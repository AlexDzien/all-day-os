# Grey House — katalog mieszkań i porównywarka lokali

Property catalogue with apartment filters, floor plans and a privacy-conscious contact flow.

## Problem

Kupujący potrzebują sprawdzić metraż, stan i układ kilku mieszkań w jednej inwestycji. Projekt łączy opis inwestycji z interaktywną ofertą, rzutami i widokiem porównania.

## Jak działa projekt

1. Dane 18 lokali przygotowano ze sprawdzonych źródeł. Brakujące wartości pozostają puste.
2. Przeglądarka filtruje mieszkania i zapisuje listę porównania na czas sesji. Widoki lokali korzystają z przygotowanych rzutów.
3. Mapa ładuje się po kliknięciu. Wariant kontaktu z backendem PHP sprawdza sesję, źródło żądania i limit prób, a możliwość wysyłki zależy od konfiguracji transportu.
4. Build przygotowuje podstrony, canonical, dane strukturalne i sitemapę. Wersja próbna ma odrębne ustawienia indeksowania.

## Technologie

HTML, CSS, JavaScript, Node.js do generowania oraz opcjonalnie PHP.

## Co można sprawdzić

Publikacja opisuje architekturę i decyzje z udokumentowanego projektu.

[Wróć do spisu studiów przypadków](README.md).
