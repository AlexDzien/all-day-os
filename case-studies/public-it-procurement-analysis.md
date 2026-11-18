# Analiza cen zamówień publicznych IT

Historical BZP analysis of awarded IT contracts, price ranges, and competition segments.

## Problem

Projekt pomaga oszacować rząd wielkości budżetów zamówień na software i usługi IT w Polsce. Łączy dane o rozstrzygnięciach z podziałem na segmenty i wariantem obejmującym bardziej konkurencyjne postępowania.

## Jak działa projekt

1. Zebrano ogłoszenia o wynikach z BZP dla wybranych kodów CPV między styczniem 2021 a czerwcem 2026.
2. Normalizacja łączyła rekordy z kilku kodów i ekstrahowała dostępne ceny. Segmenty rozdzielały m.in. systemy dedykowane, gotowe oprogramowanie i licencje.
3. Analiza wyliczała medianę i percentyle, oddzielnie dla pełnego zbioru oraz postępowań z przynajmniej dwiema ofertami po odfiltrowaniu typowych zamówień z wolnej ręki.
4. Raport roboczy zawierał 24 040 unikalnych ogłoszeń i 20 004 rekordy z odczytaną ceną. Podzbiór konkurencyjny obejmował 3 914 rekordów.

## Technologie

Publiczne API BZP, JavaScript, JSON, CSV i raport Excel.

## Co można sprawdzić

Liczby pochodzą z zapisanego raportu analizy. Zakres nie obejmuje całego TED i nie uzupełnia cen z dokumentów spoza BZP. Publiczne repozytorium opisuje metodę i zagregowane wyniki.

[Wróć do spisu studiów przypadków](README.md).
