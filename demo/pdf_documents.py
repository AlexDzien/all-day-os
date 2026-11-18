"""Presentation-quality, memory-only PDF documents for the isolated demo."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

FONT = "ADITDemo"
FONT_PATH = Path(__file__).parent / "assets/fonts/DejaVuSans.ttf"
if FONT not in pdfmetrics.getRegisteredFontNames():
    pdfmetrics.registerFont(TTFont(FONT, str(FONT_PATH)))
NAVY = colors.HexColor("#162b2a")
BLUE = colors.HexColor("#087f6b")
MUTED = colors.HexColor("#536a66")
LINE = colors.HexColor("#d8e1dc")
PALE = colors.HexColor("#f4f5f1")


def safe(value):
    return escape(str(value or "")).replace("\n", "<br/>")


def style(size=10, color=NAVY, **kwargs):
    return ParagraphStyle(
        "adit",
        fontName=FONT,
        fontSize=size,
        leading=size * 1.55,
        textColor=color,
        spaceAfter=9,
        **kwargs,
    )


def p(value, size=10, color=NAVY):
    return Paragraph(safe(value), style(size, color))


def currency(value):
    return f"{float(value):,.2f}".replace(",", " ").replace(".", ",") + " zł"


def page(canvas, doc, company="ALL DAY IT"):
    w, h = A4
    canvas.saveState()
    canvas.setFillColor(BLUE)
    canvas.roundRect(43, h - 48, 15, 15, 4, stroke=0, fill=1)
    canvas.setFont(FONT, 11)
    canvas.setFillColor(NAVY)
    canvas.drawString(66, h - 45, "ALL DAY IT")
    canvas.setFont(FONT, 8)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(w - 44, h - 44, f"{str(company)[:35].upper()} / DEMO")
    canvas.setStrokeColor(LINE)
    canvas.line(44, h - 61, w - 44, h - 61)
    canvas.line(44, 44, w - 44, 44)
    canvas.setFont(FONT, 6.8)
    canvas.drawString(
        44,
        29,
        "DEMONSTRACJA. Dane fikcyjne. Dokument nie jest dokumentem księgowym ani wiążącą ofertą.",
    )
    canvas.drawRightString(w - 44, 16, f"Strona {doc.page}")
    canvas.restoreState()


def info_table(left, right):
    table = Table([[p(left, 9), p(right, 9)]], colWidths=[253, 254])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PALE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table


def line_items(record):
    headers = ["Produkt / usługa", "Ilość", "Cena netto", "VAT", "Wartość netto"]
    rows = [[p(h, 7.5, colors.white) for h in headers]]
    for item in record.get("items", []):
        rows.append(
            [
                p(item["name"], 8.3),
                p(f"{item['quantity']:g} {item.get('unit', 'szt.')}", 7.5),
                p(
                    currency(item["price_net"])
                    + (
                        f"\nRabat: {item['discount_pct']:g}%"
                        if item["discount_pct"]
                        else ""
                    ),
                    7.5,
                ),
                p(f"{item['vat']:g}%", 7.5),
                p(currency(item["net"]), 8),
            ]
        )
    table = Table(rows, colWidths=[208, 62, 85, 40, 112], repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
            ]
        )
    )
    return table


def summary(record):
    table = Table(
        [
            [p("Razem netto", 10), p(currency(record["net_total"]), 11)],
            [p("VAT", 10, MUTED), p(currency(record["vat_total"]), 10, MUTED)],
            [
                p("Razem brutto", 12, colors.white),
                p(currency(record["gross_total"]), 14, colors.white),
            ],
        ],
        colWidths=[330, 177],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 2), (-1, 2), BLUE),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LINEABOVE", (0, 0), (-1, 0), 0.5, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return table


def render_pdf(kind, record, state):
    stream = BytesIO()
    doc = SimpleDocTemplate(
        stream,
        pagesize=A4,
        rightMargin=44,
        leftMargin=44,
        topMargin=82,
        bottomMargin=62,
        title=f"All Day IT DEMO - {record.get('number', record.get('name', 'Dokument'))}",
        author="All Day IT - środowisko demonstracyjne",
    )
    customer = next(
        (c for c in state["customers"] if c["id"] == record.get("customer_id")), {}
    )
    story = []
    if kind == "offer":
        story.extend(
            [
                Spacer(1, 35),
                p("OFERTA / DEMO", 10, BLUE),
                Spacer(1, 10),
                p(record.get("title", "Oferta handlowa"), 29),
                p(record["number"], 11, MUTED),
                Spacer(1, 40),
                p("Przygotowano dla", 10, BLUE),
                p(record["customer"], 21),
                p(
                    f"{customer.get('city', '')} · {customer.get('email', '')}",
                    10,
                    MUTED,
                ),
                Spacer(1, 35),
                info_table(
                    f"Data: {record['date']}\nWażna do: {record['valid_until']}",
                    f"Opiekun: {record['owner']}\nCeny i dane wyłącznie demonstracyjne",
                ),
                Spacer(1, 35),
                p("Technologia dopasowana do Twojego biznesu.", 21),
                p(
                    "Jedno środowisko. Spójne dane. Uporządkowana współpraca.\n"
                    "Ten dokument prezentuje sposób tworzenia profesjonalnych ofert w CRM / ERP.",
                    11,
                    MUTED,
                ),
                PageBreak(),
            ]
        )
    if kind in {"offer", "invoice"}:
        story.extend(
            [
                p(
                    "Wycena i warunki"
                    if kind == "offer"
                    else "FAKTURA - DOKUMENT DEMO",
                    23,
                ),
                p(record["number"], 11, BLUE),
                Spacer(1, 8),
                info_table(
                    f"SPRZEDAWCA DEMONSTRACYJNY\n{state['meta']['company']}\nDane fikcyjne / demo.example\nNIP: DEMO - nie używać do rozliczeń",
                    f"ODBIORCA\n{record['customer']}\n{customer.get('address', 'ul. Przykładowa 1')}\n{customer.get('city', '')}\n{customer.get('email', '')}",
                ),
                Spacer(1, 17),
                line_items(record),
                Spacer(1, 15),
                summary(record),
                Spacer(1, 16),
            ]
        )
        if kind == "invoice":
            story.extend(
                [
                    p("Termin płatności: " + record["due_date"], 10),
                    p(
                        "Wpłacono (symulacja): "
                        + currency(record.get("paid_gross", 0)),
                        10,
                    ),
                    p(
                        "Pozostało (symulacja): "
                        + currency(record.get("balance_gross", 0)),
                        10,
                    ),
                    p(
                        "KSeF: "
                        + (
                            "symulowane przyjęcie - brak wysyłki urzędowej"
                            if record.get("ksef_status") == "accepted_demo"
                            else "nie wysłano"
                        ),
                        9,
                        MUTED,
                    ),
                    p(
                        "Nie dokonuj płatności na podstawie tego dokumentu. Nie jest to faktura podatkowa.",
                        10,
                        BLUE,
                    ),
                ]
            )
        else:
            story.extend(
                [
                    p("Warunki współpracy", 14),
                    p(
                        record.get(
                            "notes", "Realizacja po uzgodnieniu zakresu i warunków."
                        ),
                        10,
                        MUTED,
                    ),
                    p(
                        "Dostępność, termin i ceny wymagają potwierdzenia w rzeczywistym procesie handlowym. "
                        "W demonstracji żadne zobowiązanie nie jest zaciągane.",
                        9,
                        MUTED,
                    ),
                    PageBreak(),
                    Spacer(1, 25),
                    p("Wspieramy cały proces", 27),
                    p(
                        "Od pierwszego zapytania do realizacji i kolejnego odnowienia.",
                        12,
                        MUTED,
                    ),
                    Spacer(1, 24),
                ]
            )
            for title, detail in [
                (
                    "Produkty i rozwiązania",
                    "Dopasowany zakres, warianty, ilości i przejrzyste zestawienie cen netto.",
                ),
                (
                    "Usługi i realizacja",
                    "Uzgodniony plan, odpowiedzialność, etapy i warunki odbioru.",
                ),
                (
                    "Stała współpraca",
                    "Obsługa po realizacji, umowy okresowe i terminy kolejnych działań.",
                ),
            ]:
                story.append(
                    KeepTogether(
                        [p(title, 15, BLUE), p(detail, 11, MUTED), Spacer(1, 14)]
                    )
                )
            story.extend(
                [
                    Spacer(1, 20),
                    info_table(
                        f"{state['meta']['company']} / DEMONSTRACJA\n{state['team'][0]['email']}",
                        "Platforma prezentacyjna All Day IT\nBez prawdziwej wysyłki i transakcji",
                    ),
                ]
            )
    else:
        story.extend(
            [
                p(record["name"], 24),
                p("BAZA WIEDZY / DOKUMENT PRZYKŁADOWY", 9, BLUE),
                Spacer(1, 12),
                info_table(
                    f"Kategoria: {record['category']}\nWersja: 1.0 DEMO",
                    f"Opiekun: {record['owner']}\nData: {record['date']}",
                ),
                Spacer(1, 24),
                p("Zakres i wymagania", 16),
                p(record["source_text"], 11),
                Spacer(1, 18),
                p("Kontrola i akceptacja", 16),
                p(
                    "Wymagania, ilości, ceny i terminy należy sprawdzić przed utworzeniem wiążącego dokumentu. "
                    "Funkcja AI w demonstracji pokazuje przykładowy wynik z cytowanym źródłem. Nie wywołuje zewnętrznego modelu.",
                    11,
                    MUTED,
                ),
            ]
        )
    def draw_page(canvas, document):
        page(canvas, document, state["meta"]["company"])

    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)
    return stream.getvalue()
