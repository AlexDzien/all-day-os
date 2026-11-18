# Farm Wars — inżynieria symulacji gospodarstwa

Godot farming game engineering case study with worker AI, vehicle tools, and network state.

## Problem

Farm Wars to gra o prowadzeniu gospodarstwa i rywalizacji sąsiadów. Mechaniki pracy pracowników, pojazdów i ograniczonego ładunku muszą pozostawiać spójny stan działek, magazynu i upraw.

## Jak działa projekt

1. Pracownik wybiera cel, podchodzi w fizyce postaci i odkłada plon w skrzynce. Brak zasobów lub miejsca kończy pracę bez tworzenia fikcyjnych produktów.
2. Traktor rozdziela przygotowanie gleby, siew, podlewanie i zbiór. Maszyna sprawdza kontakt z polem, kierunek jazdy, prędkość i miejsce w ładunku.
3. Interfejs i kamery pokazują tryb pracy pojazdu. W warstwie sieciowej stosowano aktualizacje części ładunku i synchronizację po brakujących danych.
4. Poszczególne wydania kandydujące mają oddzielne źródła i dokumentację. Koncepcja większej mapy jest odrębnym etapem projektowym.

## Technologie

Godot 4, GDScript, fizyka 3D, sceny i stan sieciowy.

## Co można sprawdzić

Studium prezentuje zmiany rozpoznane w dokumentacji RC2 i RC3. Zmiany RC3 pozostają w przeglądzie źródłowym i wymagają osobnego odbioru w silniku.

[Wróć do spisu studiów przypadków](README.md).
