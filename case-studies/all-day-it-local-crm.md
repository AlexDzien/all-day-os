# All Day IT — lokalny CRM sprzedażowy

Local-first CRM for customer records, callbacks, tasks, notes, and tender research.

CRM porządkuje codzienną pracę handlowca w jednej aplikacji. Najbliższe telefony wracają na górę listy klientów, zadania mają terminy i priorytety, a notatki pozostają przy właściwej sprawie. Pulpit oblicza stan lejka i sumy sprzedaży na podstawie rekordów w bazie.

## Główne ścieżki

- Dodaj klienta, ustaw termin oddzwonienia i przypisz zadanie lub notatkę. Zmiana etapu i wartości trafia do lokalnego API.
- Zaimportuj własny plik `clients.xlsx` z arkuszem `Klienci`. Import pomija powtórzenia po adresie e-mail lub telefonie. Na pustej instalacji plik jest opcjonalny.
- Utwórz kopię bazy z panelu. Aplikacja tworzy też kopię przy starcie, jeśli dawno nie powstała aktualna.
- W module przetargów uruchom ręczne odświeżenie BZP i TED oraz zmień status sprawy.

## Architektura

Interfejs React i TypeScript komunikuje się z Express przez JSON. SQLite przechowuje klientów, zadania, notatki i dane o zamówieniach. Główny proces nasłuchuje na interfejsie loopback. Wersja portfolio startuje z pustą bazą i przyjmuje żądania wyłącznie dla lokalnych adresów oraz dozwolonych lokalnych źródeł przeglądarki.

## Zakres weryfikacji

Weryfikacja objęła budowę aplikacji, testy logiki sprzedażowej i próbę utworzenia klienta przez lokalne API z zapisem w SQLite. Instalacja demonstracyjna rozpoczyna pracę z pustą bazą.

[Wróć do spisu studiów przypadków](README.md).
