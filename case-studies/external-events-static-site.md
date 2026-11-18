# External Events — statyczny serwis wydarzeń

Static event-brand website with a dependency-free build and post-deployment verification.

## Problem

Serwis porządkuje informacje o marce, wydarzeniach, realizacjach i współpracy. Został przygotowany jako gotowy HTML, dzięki czemu podstawowa treść działa bez uruchamiania aplikacji serwerowej.

## Jak działa projekt

1. Generator Node.js składa trzynaście dokumentów, w tym osobny widok 404, oraz metadane i sitemapę.
2. Zasoby obrazu i fontów są przygotowane do szybkiego pobrania. Wersje offline umożliwiają sprawdzenie tras przed wdrożeniem.
3. Formularz kontaktowy waliduje dane i komponuje wiadomość do wysłania przez pocztę użytkownika.
4. Procedura wdrożeniowa porównuje pliki i weryfikuje po HTTPS m.in. przekierowania, kod 404, canonical i sitemapę.

## Technologie

HTML, CSS, JavaScript, Node.js i skrypty weryfikacji HTTP.

## Co można sprawdzić

Zakres publiczny opisuje działający generator i proces kontroli wdrożenia. Grafiki wydarzeń pozostały przy właścicielu materiałów.

[Wróć do spisu studiów przypadków](README.md).
