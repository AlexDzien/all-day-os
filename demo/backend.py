"""Public, isolated CRM/ERP demo. No CRM imports, credentials or external I/O."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.staticfiles import StaticFiles

from .data_seed import PROFILE_DATA, build_state, enrich, money, price_items, totals

ROOT = Path(__file__).resolve().parent
COOKIE = "adit_demo_workspace"
TTL = 24 * 60 * 60
MAX_WORKSPACES = 128
MAX_STATE_BYTES = 1_000_000
MAX_RECORDS = 500
STAGES = {"new", "contacted", "qualified", "proposal", "won", "lost"}


class Action(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: str = Field(min_length=1, max_length=60, pattern=r"^[a-z_]+$")
    payload: dict = Field(default_factory=dict)


def text(payload, key, default="", maximum=1000, required=False):
    value = str(payload.get(key, default) or "").strip()
    if len(value) > maximum or "\x00" in value or (required and not value):
        raise HTTPException(422, f"Uzupełnij poprawne pole: {key}")
    return value


def number(payload, key, default=0, minimum=0, maximum=1_000_000_000):
    try:
        value = float(str(payload.get(key, default)).replace(",", "."))
    except (TypeError, ValueError):
        raise HTTPException(422, f"Niepoprawna liczba: {key}") from None
    if not math.isfinite(value) or not minimum <= value <= maximum:
        raise HTTPException(422, f"Wartość poza zakresem: {key}")
    return value


def choice(payload, key, allowed, default=""):
    value = text(payload, key, default)
    if value not in allowed:
        raise HTTPException(422, f"Niepoprawna wartość: {key}")
    return value


def day_value(payload, key, default):
    value = text(payload, key, default, 32)
    try:
        return date.fromisoformat(value[:10]).isoformat()
    except ValueError:
        raise HTTPException(422, f"Niepoprawna data: {key}") from None


def demo_email(payload, key, default=""):
    value = text(payload, key, default, 200).lower()
    if not re.fullmatch(r"[a-z0-9._+-]+@[a-z0-9.-]+\.example", value):
        raise HTTPException(
            422,
            "W demonstracji używaj wyłącznie fikcyjnych adresów w domenie .example.",
        )
    return value


def row_for(state, collection, record_id):
    record = next((r for r in state[collection] if r["id"] == str(record_id)), None)
    if record is None:
        raise HTTPException(404, "Nie znaleziono rekordu w Twojej demonstracji.")
    return record


def new_id(prefix):
    return prefix + secrets.token_hex(6)


def add_row(state, collection, row):
    if len(state[collection]) >= MAX_RECORDS:
        raise HTTPException(
            422,
            "Osiągnięto limit rekordów demonstracji. Możesz zresetować własne dane.",
        )
    state[collection].insert(0, row)
    return row


def event(state, action, entity, detail=""):
    current = datetime.now().astimezone().isoformat()
    entry = {
        "id": new_id("ev"),
        "date": current,
        "actor": state["meta"]["current_user"]["name"],
        "action": action,
        "entity": entity,
        "detail": detail or "Operacja wykonana wyłącznie w demonstracji.",
    }
    state["audit"] = [entry, *state["audit"]][:160]


def offer_items(payload, state):
    raw = payload.get("items") or []
    if not isinstance(raw, list) or not 1 <= len(raw) <= 100:
        raise HTTPException(422, "Oferta wymaga od 1 do 100 pozycji.")
    parsed = []
    for item in raw:
        if not isinstance(item, dict):
            raise HTTPException(422, "Niepoprawna pozycja oferty.")
        product_id = text(item, "product_id", "", 80)
        product = row_for(state, "products", product_id) if product_id else None
        parsed.append(
            {
                "product_id": product_id,
                "name": text(
                    item, "name", product["name"] if product else "", 300, True
                ),
                "quantity": number(item, "quantity", 1, 0.001, 1_000_000),
                "price_net": number(
                    item,
                    "price_net",
                    product["price_net"] if product else 0,
                    0,
                    10_000_000,
                ),
                "discount_pct": number(item, "discount_pct", 0, 0, 100),
                "vat": number(item, "vat", product["vat"] if product else 23, 0, 100),
                "unit": text(item, "unit", product["unit"] if product else "szt.", 30),
            }
        )
    items = price_items(parsed, state["products"])
    if totals(items)["gross_total"] > 1_000_000_000:
        raise HTTPException(422, "Wartość oferty przekracza limit demonstracji.")
    return items


def pl_number(value, decimals=0):
    """Stable Polish presentation; does not depend on the host's locale."""
    return f"{value:,.{decimals}f}".translate(str.maketrans({",": " ", ".": ","}))


def analyze(state, prompt, document_id="", context=None):
    """Deterministic, source-bound examples tailored to the visible business case."""
    context = context or {}
    scope = str(context.get("scope", ""))
    doc = (
        row_for(state, "documents", document_id)
        if document_id
        else state["documents"][0]
    )
    stats = state.get("stats", {})
    customer = (
        row_for(state, "customers", context["customer_id"])
        if context.get("customer_id")
        else None
    )
    lower = prompt.casefold()
    reply = any(
        word in lower
        for word in ("odpowied", "wiadomość", "wiadomosc", "maila", "napisz")
    )
    next_step = (
        any(
            word in lower
            for word in (
                "kolejny",
                "następny",
                "nastepny",
                "priorytet",
                "dzisiaj",
                "zadani",
            )
        )
        or scope == "calendar"
    )
    finance = any(
        word in prompt.lower()
        for word in ("finans", "sprzeda", "przych", "wynik", "marż", "należ")
    ) or (scope in {"reports", "invoices"} and not reply and not next_step)
    suggested = doc.get("structured_scope", [])
    requirements = doc.get("requirements", [])
    sources = [
        {
            "id": doc["id"],
            "name": doc["name"],
            "excerpt": doc["source_text"],
            "url": doc["pdf_url"],
        }
    ]
    fields = []
    if customer:
        deals = [row for row in state["deals"] if row["customer_id"] == customer["id"]]
        mails = [
            row for row in state["messages"] if row.get("customer_id") == customer["id"]
        ]
        offers = [
            row for row in state["offers"] if row["customer_id"] == customer["id"]
        ]
        tasks = [
            row
            for row in state["tasks"]
            if row.get("customer_id") == customer["id"] and row["status"] != "done"
        ]
        open_deals = [row for row in deals if row["stage"] not in {"won", "lost"}]
        if reply:
            answer = f"Dzień dobry,\n\ndziękuję za wiadomość. Przygotujemy propozycję dla firmy {customer['name']}. Proszę o potwierdzenie zakresu, ilości oraz oczekiwanego terminu. Dzięki temu wrócimy z konkretną wyceną i warunkami realizacji.\n\nPozdrawiam\n{state['meta']['current_user']['name']}\n{state['meta']['company']}"
        elif next_step:
            action = (
                tasks[0]["title"]
                if tasks
                else "Potwierdź aktualny zakres i termin przed przygotowaniem oferty"
            )
            answer = f"{customer['name']}: {action}. Opiekun: {customer['owner']}. Sprawdź ostatnią wiadomość i powiązane oferty przed kontaktem."
        else:
            answer = f"{customer['name']} — opiekun: {customer['owner']}. Historia obejmuje {len(mails)} wiadomości, {len(offers)} ofert i {len(open_deals)} otwartych szans. Do wykonania: {len(tasks)} aktywności. {customer.get('notes', '')}"
        fields = [
            {
                "label": label,
                "value": pl_number(value),
                "source": f"Karta klienta: {customer['name']}",
            }
            for label, value in [
                ("Wiadomości", len(mails)),
                ("Oferty", len(offers)),
                ("Otwarte szanse", len(open_deals)),
                ("Zaplanowane działania", len(tasks)),
            ]
        ]
        sources = [
            {
                "id": customer["id"],
                "name": customer["name"],
                "excerpt": customer.get("notes", "Dane klienta w sesji demo."),
                "url": f"#/clients/{customer['id']}",
            }
        ]
        sources += [
            {
                "id": mail["id"],
                "name": mail["subject"],
                "excerpt": mail["body"][:500],
                "url": f"#/mail/{mail['id']}",
            }
            for mail in mails[:2]
        ]
        suggested = []
    elif finance:
        answer = (
            f"Przychód netto w przykładowych dokumentach wynosi {pl_number(stats.get('revenue_net', 0), 2)} zł. "
            f"Otwarty pipeline to {pl_number(stats.get('pipeline_net', 0), 2)} zł; "
            f"{pl_number(stats.get('tasks_due', 0))} aktywności wymaga działania. "
            "Warto skupić opiekunów na ofertach z bliskim terminem oraz sprawdzić należności po terminie."
        )
        fields = [
            {
                "label": label,
                "value": f"{pl_number(value, 2)} zł"
                if label != "Działania na dziś"
                else pl_number(value),
                "source": "Rekordy finansowe bieżącej sesji",
            }
            for label, value in [
                ("Przychód netto", stats.get("revenue_net", 0)),
                ("Otwarte szanse netto", stats.get("pipeline_net", 0)),
                ("Należności netto", stats.get("receivables_net", 0)),
                ("Działania na dziś", stats.get("tasks_due", 0)),
            ]
        ]
        sources = [
            {
                "id": "reports",
                "name": "Raporty firmy",
                "excerpt": state["meta"].get(
                    "financial_model", "Przykładowe faktury w sesji."
                ),
                "url": "#/reports",
            }
        ]
        suggested = []
    elif next_step and not document_id:
        tasks = sorted(
            [row for row in state["tasks"] if row["status"] != "done"],
            key=lambda row: (row["date"], row["priority"] != "high"),
        )[:3]
        answer = (
            "Najbliższe działania:\n"
            + "\n".join(
                f"• {row['title']} — {row['date']}, {row['owner']}" for row in tasks
            )
            if tasks
            else "Nie masz zaplanowanych działań. Dodaj kontakt z klientem albo przegląd otwartych ofert."
        )
        sources = [
            {
                "id": row["id"],
                "name": row["title"],
                "excerpt": row.get("description", "Aktywność w sesji demo."),
                "url": f"#/calendar/{row['id']}",
            }
            for row in tasks
        ]
        suggested = []
    else:
        product_by_id = {row["id"]: row for row in state["products"]}
        lines = [
            f"{item['quantity']:g} {product_by_id[item['product_id']]['unit']} — {product_by_id[item['product_id']]['name']}"
            for item in suggested
            if item["product_id"] in product_by_id
        ]
        if reply:
            answer = f"Dzień dobry,\n\ndziękuję za przekazanie zakresu. Przygotujemy wycenę obejmującą: {'; '.join(lines) if lines else doc['name']}. Proszę jeszcze o potwierdzenie terminu i miejsca realizacji.\n\nPozdrawiam\n{state['meta']['current_user']['name']}"
        elif lines:
            answer = (
                "Zakres do wyceny:\n"
                + "\n".join(f"• {line}" for line in lines)
                + (
                    "\nWymagania: " + "; ".join(requirements) + "."
                    if requirements
                    else ""
                )
                + "\nDo potwierdzenia: termin, miejsce, dostępność i warunki płatności."
            )
        else:
            answer = f"{doc['name']}\n{doc['source_text']}\nNastępny krok: zweryfikuj zakres, odpowiedzialność oraz termin z opiekunem sprawy."
        fields = [
            {
                "label": product_by_id[item["product_id"]]["name"],
                "value": f"{item['quantity']:g} {product_by_id[item['product_id']]['unit']}",
                "source": doc["name"],
            }
            for item in suggested
            if item["product_id"] in product_by_id
        ]
        fields.append(
            {
                "label": "Termin i miejsce",
                "value": "Do potwierdzenia z klientem",
                "source": doc["name"],
            }
        )
    return {
        "id": new_id("ai"),
        "date": datetime.now().astimezone().isoformat(),
        "prompt": prompt,
        "answer": answer,
        "summary": answer,
        "mode": "simulation",
        "simulated": True,
        "notice": "Przykładowy wynik demonstracyjny. Żaden model ani usługa zewnętrzna nie są wywoływane.",
        "fields": fields,
        "warnings": [
            "Dane fikcyjne - wynik pokazuje scenariusz pracy, nie jakość rzeczywistego modelu AI.",
            "Ceny, VAT, dostępność i ostateczne zobowiązania wymagają akceptacji użytkownika.",
        ],
        "sources": sources,
        "suggested_items": suggested,
        "steps": [
            "Odczyt przykładowego dokumentu",
            "Rozpoznanie wymagań",
            "Kontrola braków",
            "Akceptacja przez pracownika",
        ],
    }


def run_rule(state, rule):
    """One simulated event creates inspectable records, not an animated counter."""
    processed = rule.setdefault("processed_ids", [])
    actor = state["meta"]["current_user"]
    day = state["meta"]["date"]
    kind, target, title, description, owner_id = "", None, "", "", actor["id"]
    if rule["id"] == "a1":
        target = next(
            (
                m
                for m in state["messages"]
                if m["direction"] == "inbound"
                and m["classification"] == "positive"
                and m["id"] not in processed
            ),
            None,
        )
        if target:
            c = row_for(state, "customers", target["customer_id"])
            _, _, deal = mutate(
                state,
                Action(
                    type="create_deal",
                    payload={
                        "customer_id": c["id"],
                        "title": f"Zapytanie: {target['subject']}",
                        "stage": "qualified",
                        "value_net": 0,
                        "probability": 50,
                        "expected_close": (
                            date.fromisoformat(day) + timedelta(days=7)
                        ).isoformat(),
                        "notes": "Szansa z przykładowej pozytywnej odpowiedzi. Wartość wymaga wyceny.",
                    },
                ),
            )
            deal.update(source_automation=rule["id"], source_message_id=target["id"])
            title = f"Przygotuj odpowiedź i wycenę - {c['name']}"
            description = f"Źródło: {target['subject']}. Sprawdź zakres i przygotuj ofertę. Szansa: {deal['id']}."
            owner_id = c["owner_id"]
            kind = "deal_and_task"
    elif rule["id"] == "a2":
        target = next(
            (
                l
                for l in state["licenses"]
                if l["status"] == "expiring" and l["id"] not in processed
            ),
            None,
        )
        if target:
            c = row_for(state, "customers", target["customer_id"])
            _, _, deal = mutate(
                state,
                Action(
                    type="create_deal",
                    payload={
                        "customer_id": c["id"],
                        "title": f"Odnowienie: {target['product']}",
                        "stage": "contacted",
                        "value_net": target["value_net"],
                        "probability": 50,
                        "expected_close": target["expires_at"],
                        "notes": "Odnowienie współpracy - sprawdź zakres i aktualne warunki.",
                    },
                ),
            )
            deal.update(source_automation=rule["id"], source_license_id=target["id"])
            title = f"Uzgodnij odnowienie współpracy - {c['name']}"
            description = (
                f"Produkt: {target['product']}; wygaśnięcie: {target['expires_at']}."
            )
            owner_id = c["owner_id"]
            kind = "deal_and_task"
    elif rule["id"] == "a3":
        existing = {o["offer_id"] for o in state["orders"]}
        target = next(
            (
                o
                for o in state["offers"]
                if o["status"] == "accepted"
                and o["id"] not in existing
                and o["id"] not in processed
            ),
            None,
        )
        if target:
            _, _, order = mutate(
                state, Action(type="offer_to_order", payload={"id": target["id"]})
            )
            order["source_automation"] = rule["id"]
            processed.append(target["id"])
            return (
                {
                    "created": True,
                    "created_type": "order",
                    "order": order,
                    "source_id": target["id"],
                },
                f"Automatyzacja utworzyła zamówienie {order['number']} z oferty {target['number']}. Wyłącznie DEMO.",
            )
    elif rule["id"] == "a4":
        target = next(
            (
                i
                for i in state["invoices"]
                if i["status"] == "overdue"
                and i["balance_gross"] > 0
                and i["id"] not in processed
            ),
            None,
        )
        if target:
            title = f"Wyjaśnij należność - {target['number']}"
            description = f"Klient: {target['customer']}; saldo brutto: {target['balance_gross']:.2f} zł; termin: {target['due_date']}. Brak działań bankowych lub wiadomości zewnętrznych."
            owner_id = state["team"][5]["id"]
            kind = "task"
    elif rule["id"] == "a5":
        target = next((t for t in state["tenders"] if t["id"] not in processed), None)
        if target:
            target["review"] = {
                "status": "needs_review",
                "checks": [
                    {
                        "label": "Dokument źródłowy powiązany",
                        "passed": bool(target.get("document_id")),
                    },
                    {
                        "label": "Wymagania opisane",
                        "passed": bool(target.get("requirements")),
                    },
                    {"label": "Ostateczne ceny i VAT potwierdzone", "passed": False},
                ],
                "warnings": [
                    "Sprawdź komplet wymaganych załączników i zatwierdź ceny oraz VAT przed złożeniem oferty."
                ],
            }
            title = f"Sprawdź kompletność - {target['title']}"
            description = "Lista kontrolna została zapisana w demonstracyjnym postępowaniu. Nie składamy dokumentów ani ofert na zewnętrznej platformie."
            kind = "tender_review_and_task"
    if target is None:
        return (
            {"created": False, "created_type": "none"},
            "Brak nowych rekordów spełniających warunki tej reguły. Nie utworzono duplikatów.",
        )
    _, _, task = mutate(
        state,
        Action(
            type="create_task",
            payload={
                "title": title,
                "description": description,
                "customer_id": target.get("customer_id", ""),
                "owner_id": owner_id,
                "date": day,
                "type": "task",
                "priority": "high",
            },
        ),
    )
    task.update(source_automation=rule["id"], source_record_id=target["id"])
    processed.append(target["id"])
    return (
        {
            "created": True,
            "created_type": kind,
            "task": task,
            "source_id": target["id"],
        },
        f"Automatyzacja utworzyła zadanie: {title}. Wynik jest zapisany wyłącznie w Twojej demonstracji.",
    )


def mutate(state, action):
    p = action.payload
    kind = action.type
    actor = state["meta"]["current_user"]
    day = state["meta"]["date"]
    message, result = "Zapisano zmiany w demonstracji.", {}
    if state["meta"].get("role") == "viewer" and kind not in {
        "reset",
        "set_role",
        "read_message",
        "ai_assist",
        "analyze_document",
    }:
        raise HTTPException(
            403,
            "Konto podglądowe nie może zmieniać danych. Przełącz rolę demonstracyjną.",
        )
    if kind == "reset":
        rebuilt = build_state(profile_id=state["meta"].get("profile_id", "legacy"))
        rebuilt["meta"]["role"] = state["meta"].get("role", "admin")
        return (
            enrich(rebuilt),
            "Przywrócono wyłącznie Twoje przykładowe dane.",
            {},
        )
    if kind == "set_demo_profile":
        profile_id = choice(p, "profile_id", set(PROFILE_DATA))
        rebuilt = build_state(profile_id=profile_id)
        rebuilt["meta"]["role"] = state["meta"].get("role", "admin")
        event(
            rebuilt,
            "Zmieniono scenariusz demonstracji",
            rebuilt["meta"]["profile_label"],
        )
        return (
            enrich(rebuilt),
            f"Scenariusz: {rebuilt['meta']['profile_label']}",
            {"profile_id": profile_id},
        )
    if kind == "set_role":
        role = choice(p, "role", {"admin", "sales", "viewer"}, "admin")
        state["meta"]["role"] = role
        event(state, "Zmieniono rolę demonstracyjną", role)
    elif kind in {"create_customer", "update_customer"}:
        existing = (
            row_for(state, "customers", p.get("id"))
            if kind == "update_customer"
            else None
        )
        old = existing or {}
        name = text(p, "name", p.get("company") or old.get("name", ""), 200, True)
        email = demo_email(p, "email", old.get("email", "kontakt@nowafirma.example"))
        owner_id = text(p, "owner_id", old.get("owner_id", actor["id"]), 50)
        owner = row_for(state, "team", owner_id)
        row = {
            **old,
            "id": old.get("id", new_id("c")),
            "name": name,
            "company": name,
            "email": email,
            "city": text(p, "city", old.get("city", "Poznań"), 100),
            "phone": text(p, "phone", old.get("phone", "+48 000 000 000"), 50),
            "nip": text(p, "nip", old.get("nip", "DEMO-NOWY"), 40),
            "sector": text(
                p, "sector", p.get("segment") or old.get("sector", "Usługi"), 100
            ),
            "segment": text(p, "segment", old.get("segment", "Usługi"), 100),
            "notes": text(p, "notes", old.get("notes", ""), 5000),
            "owner_id": owner["id"],
            "owner": owner["name"],
            "status": text(p, "status", old.get("status", "prospect"), 40),
            "color": text(p, "color", old.get("color", "#5c6cf1"), 30),
            "created_at": old.get("created_at", day),
            "value_net": old.get("value_net", 0),
            "revenue_net": old.get("revenue_net", 0),
        }
        if existing is not None:
            existing.update(row)
        else:
            add_row(state, "customers", row)
        event(state, "Zapisano klienta", name)
        result = row
    elif kind in {"move_deal", "update_deal", "create_deal"}:
        if kind == "create_deal":
            c = row_for(state, "customers", p.get("customer_id"))
            owner = row_for(state, "team", p.get("owner_id") or c["owner_id"])
            row = {
                "id": new_id("d"),
                "customer_id": c["id"],
                "customer": c["name"],
                "title": text(p, "title", "Nowa szansa", 200, True),
                "value_net": number(p, "value_net", 0),
                "stage": choice(p, "stage", STAGES, "new"),
                "owner": owner["name"],
                "owner_id": owner["id"],
                "probability": number(p, "probability", 25, 0, 100),
                "expected_close": day_value(p, "expected_close", day),
                "created_at": day,
                "notes": text(p, "notes", "", 5000),
                "tags": [c["sector"]],
                "priority": "normal",
            }
            add_row(state, "deals", row)
        else:
            row = row_for(state, "deals", p.get("id"))
            row["stage"] = choice(p, "stage", STAGES, row["stage"])
            row["probability"] = {
                "new": 10,
                "contacted": 25,
                "qualified": 50,
                "proposal": 75,
                "won": 100,
                "lost": 0,
            }[row["stage"]]
            if "value_net" in p:
                row["value_net"] = number(p, "value_net")
            if "notes" in p:
                row["notes"] = text(p, "notes", "", 5000)
            if "owner_id" in p:
                owner = row_for(state, "team", p["owner_id"])
                row.update(owner_id=owner["id"], owner=owner["name"])
        event(state, "Zaktualizowano szansę", row["title"], f"Etap: {row['stage']}")
        result = row
    elif kind in {"create_task", "update_task", "complete_task"}:
        if kind == "complete_task":
            row = row_for(state, "tasks", p.get("id"))
            row["status"] = "done"
        else:
            row = row_for(state, "tasks", p.get("id")) if kind == "update_task" else {}
            customer_id = p.get("customer_id", row.get("customer_id", ""))
            c = row_for(state, "customers", customer_id) if customer_id else None
            selected_day = day_value(
                p, "date", str(p.get("starts_at", row.get("date", day)))[:10]
            )
            owner = row_for(
                state, "team", p.get("owner_id", row.get("owner_id", actor["id"]))
            )
            row.update(
                {
                    "id": row.get("id", new_id("t")),
                    "title": text(
                        p, "title", row.get("title", "Nowa aktywność"), 300, True
                    ),
                    "customer_id": c["id"] if c else "",
                    "customer": c["name"] if c else "Wewnętrzna aktywność",
                    "owner": owner["name"],
                    "owner_id": owner["id"],
                    "type": choice(
                        p, "type", {"meeting", "call", "task"}, row.get("type", "task")
                    ),
                    "status": choice(
                        p, "status", {"todo", "done"}, row.get("status", "todo")
                    ),
                    "priority": choice(
                        p,
                        "priority",
                        {"low", "normal", "high"},
                        row.get("priority", "normal"),
                    ),
                    "date": selected_day,
                    "starts_at": text(
                        p,
                        "starts_at",
                        row.get("starts_at", f"{selected_day}T10:00:00+01:00"),
                        60,
                    ),
                    "ends_at": text(
                        p,
                        "ends_at",
                        row.get("ends_at", f"{selected_day}T11:00:00+01:00"),
                        60,
                    ),
                    "description": text(
                        p, "description", row.get("description", ""), 5000
                    ),
                }
            )
            try:
                if datetime.fromisoformat(row["ends_at"]) <= datetime.fromisoformat(
                    row["starts_at"]
                ):
                    raise ValueError
            except (ValueError, TypeError):
                raise HTTPException(
                    422, "Koniec aktywności musi być późniejszy niż początek."
                ) from None
            if kind == "create_task":
                add_row(state, "tasks", row)
        event(state, "Zapisano aktywność", row["title"])
        result = row
    elif kind in {"read_message", "mark_all_read"}:
        if kind == "read_message":
            row_for(state, "messages", p.get("id"))["read"] = True
        else:
            for row in state["messages"]:
                row["read"] = True
    elif kind == "send_message":
        recipient = demo_email(p, "to")
        subject = text(p, "subject", "", 300, True)
        body = text(p, "body", "", 12000, True)
        sender = demo_email(p, "from", "handel@orion.example")
        if sender not in {"handel@orion.example", *(m["email"] for m in state["team"])}:
            raise HTTPException(
                422, "Wybierz jedną z demonstracyjnych skrzynek nadawczych."
            )
        reply_to_id = text(p, "reply_to_id", "", 80)
        if reply_to_id:
            row_for(state, "messages", reply_to_id)
        c = (
            row_for(state, "customers", p["customer_id"])
            if p.get("customer_id")
            else next((c for c in state["customers"] if c["email"] == recipient), None)
        )
        attachments = []
        raw_attachments = p.get("attachments", [])
        if not isinstance(raw_attachments, list) or len(raw_attachments) > 10:
            raise HTTPException(422, "Wybierz najwyżej 10 przykładowych załączników.")
        for item in raw_attachments:
            if not isinstance(item, dict):
                raise HTTPException(422, "Niepoprawny załącznik demonstracyjny.")
            attachment = row_for(state, "documents", item.get("id"))
            if attachment["id"] not in {a["id"] for a in attachments}:
                attachments.append(
                    {
                        "id": attachment["id"],
                        "name": attachment["name"],
                        "type": "application/pdf",
                        "url": attachment["pdf_url"],
                        "size": attachment["size"],
                    }
                )
        row = {
            "id": new_id("m"),
            "customer_id": c["id"] if c else "",
            "customer": c["name"] if c else recipient,
            "from": sender,
            "to": recipient,
            "subject": subject,
            "body": body,
            "date": datetime.now().astimezone().isoformat(),
            "direction": "outbound",
            "folder": "sent",
            "read": True,
            "classification": "neutral",
            "campaign_id": "",
            "attachments": attachments,
            "reply_to_id": reply_to_id,
            "simulated": True,
        }
        add_row(state, "messages", row)
        event(state, "Symulacja wysłania wiadomości", subject)
        message = "Symulacja zakończona. Wiadomość zapisano w demo; nie wysłano jej poza system."
        result = row
    elif kind in {"update_campaign", "run_campaign"}:
        row = row_for(state, "campaigns", p.get("id"))
        if kind == "update_campaign":
            row["status"] = choice(
                p, "status", {"running", "paused", "scheduled", "completed"}, "paused"
            )
        else:
            count = min(12, row["queued"])
            if len(state["messages"]) + count > MAX_RECORDS:
                raise HTTPException(
                    422,
                    "Lista wiadomości demonstracyjnych osiągnęła limit. Zresetuj swój widok.",
                )
            recipients = set(row.setdefault("demo_recipients", []))
            cursor = row.get("demo_cursor", 0)
            batch = []
            while len(batch) < count:
                c = (
                    state["customers"][cursor]
                    if cursor < len(state["customers"])
                    else None
                )
                recipient = (
                    c["email"]
                    if c
                    else f"kontakt+{row['id']}-{cursor}@odbiorcy.example"
                )
                cursor += 1
                if recipient in recipients:
                    continue
                recipients.add(recipient)
                company = c["name"] if c else f"Kontakt demonstracyjny {cursor}"
                sent = {
                    "id": new_id("m"),
                    "customer_id": c["id"] if c else "",
                    "customer": company,
                    "from": "handel@orion.example",
                    "to": recipient,
                    "subject": f"Propozycja dopasowana do zespołu - {company}",
                    "body": f"Dzień dobry,\n\npiszę w sprawie współpracy z firmą {company}. W ramach kampanii „{row['name']}” możemy przygotować propozycję dopasowaną do Państwa potrzeb.\n\nCzy mogę prosić o zakres i oczekiwany termin, aby wrócić z konkretną wyceną?\n\nPozdrawiam\n{actor['name']}\n{state['meta']['company']}\n\nWIADOMOŚĆ DEMONSTRACYJNA. Nie została wysłana poza system.",
                    "date": datetime.now().astimezone().isoformat(),
                    "direction": "outbound",
                    "folder": "sent",
                    "read": True,
                    "classification": "neutral",
                    "campaign_id": row["id"],
                    "attachments": [],
                    "simulated": True,
                }
                add_row(state, "messages", sent)
                batch.append(sent)
            row["demo_recipients"] = sorted(recipients)
            row["demo_cursor"] = cursor
            row["queued"] -= len(batch)
            row["sent"] += len(batch)
            row["progress"] = round(
                row["sent"] / max(1, row["sent"] + row["queued"]) * 100
            )
            row["status"] = "running" if row["queued"] else "completed"
            message = f"Symulowano {count} pozycji kolejki. Żaden e-mail nie został rzeczywiście wysłany."
        event(state, "Zmieniono kampanię demonstracyjną", row["name"])
        result = (
            {**row, "messages": batch, "batch_count": len(batch)}
            if kind == "run_campaign"
            else row
        )
    elif kind == "create_product":
        sku = text(p, "sku", f"DEMO-{len(state['products']) + 1}", 80, True)
        if any(item["sku"].casefold() == sku.casefold() for item in state["products"]):
            raise HTTPException(409, "Produkt z tym SKU już istnieje.")
        row = {
            "id": new_id("p"),
            "sku": sku,
            "name": text(p, "name", "", 200, True),
            "category": choice(
                p, "category", {"license", "service", "hardware"}, "service"
            ),
            "producer": text(p, "producer", state["meta"]["company"], 100),
            "variant": text(p, "variant", "", 200),
            "unit": text(p, "unit", "szt.", 30),
            "price_net": number(p, "price_net"),
            "cost_net": number(p, "cost_net"),
            "vat": number(p, "vat", 23, 0, 100),
            "stock": number(p, "stock", 0, 0, 1000000),
            "description": text(p, "description", "", 3000),
        }
        add_row(state, "products", row)
        event(state, "Dodano produkt", row["name"])
        result = row
    elif kind in {
        "create_offer",
        "update_offer",
        "duplicate_offer",
        "update_offer_status",
        "delete_offer",
    }:
        if kind == "delete_offer":
            row = row_for(state, "offers", p.get("id"))
            if any(order.get("offer_id") == row["id"] for order in state["orders"]):
                raise HTTPException(
                    409, "Oferta ma powiązane zamówienie i pozostaje w historii."
                )
            state["offers"].remove(row)
            event(state, "Usunięto ofertę demonstracyjną", row["number"])
            return enrich(state), "Usunięto ofertę z Twojej demonstracji.", {}
        if kind == "update_offer_status":
            row = row_for(state, "offers", p.get("id"))
            row["status"] = choice(
                p, "status", {"draft", "sent", "accepted", "rejected"}, "draft"
            )
        elif kind == "duplicate_offer":
            source = row_for(state, "offers", p.get("id"))
            row = json.loads(json.dumps(source))
            row.update(
                id=new_id("of"),
                number=f"OF/{day[:4]}/{len(state['offers']) + 101:04d}",
                status="draft",
                date=day,
                version=1,
            )
            row["pdf_url"] = f"/api/demo/documents/offer/{row['id']}.pdf"
            add_row(state, "offers", row)
        else:
            existing = (
                row_for(state, "offers", p.get("id"))
                if kind == "update_offer"
                else None
            )
            c = row_for(
                state,
                "customers",
                p.get("customer_id") or (existing or {}).get("customer_id"),
            )
            items = (
                offer_items(p, state)
                if "items" in p
                else (existing or {}).get("items", [])
            )
            if not items:
                raise HTTPException(422, "Dodaj pozycję do oferty.")
            row = existing or {
                "id": new_id("of"),
                "number": f"OF/{day[:4]}/{len(state['offers']) + 101:04d}",
                "date": day,
                "status": "draft",
                "owner": actor["name"],
            }
            row.update(
                customer_id=c["id"],
                customer=c["name"],
                title=text(p, "title", row.get("title", "Oferta handlowa"), 300, True),
                valid_until=day_value(
                    p,
                    "valid_until",
                    (date.fromisoformat(day) + timedelta(days=14)).isoformat(),
                ),
                items=items,
                notes=text(p, "notes", row.get("notes", ""), 5000),
                version=row.get("version", 0) + 1,
                **totals(items),
            )
            row["pdf_url"] = f"/api/demo/documents/offer/{row['id']}.pdf"
            if existing is None:
                add_row(state, "offers", row)
        event(state, "Zapisano ofertę", row["number"])
        result = row
    elif kind == "offer_to_order":
        offer = row_for(state, "offers", p.get("id"))
        existing = next(
            (o for o in state["orders"] if o["offer_id"] == offer["id"]), None
        )
        if existing:
            return enrich(state), "Ta oferta ma już zamówienie.", existing
        row = json.loads(json.dumps(offer))
        row.update(
            id=new_id("ord"),
            number=f"ZAM/{day[:4]}/{len(state['orders']) + 201:04d}",
            offer_id=offer["id"],
            status="new",
            date=day,
            delivery_date=(date.fromisoformat(day) + timedelta(days=14)).isoformat(),
        )
        add_row(state, "orders", row)
        offer["status"] = "accepted"
        event(state, "Utworzono zamówienie", row["number"])
        result = row
    elif kind == "update_order":
        row = row_for(state, "orders", p.get("id"))
        row["status"] = choice(
            p, "status", {"new", "processing", "completed"}, "processing"
        )
        event(state, "Zaktualizowano zamówienie", row["number"])
        result = row
    elif kind == "create_invoice":
        order = row_for(state, "orders", p.get("order_id") or p.get("id"))
        existing = next(
            (
                i
                for i in state["invoices"]
                if i["order_id"] == order["id"] and i["date"] == day
            ),
            None,
        )
        if existing:
            return (
                enrich(state),
                "To zamówienie ma już fakturę demonstracyjną z dzisiaj.",
                existing,
            )
        row = json.loads(json.dumps(order))
        row.update(
            id=new_id("inv"),
            number=f"FV/{day[:4]}/{day[5:7]}/{len(state['invoices']) + 1:03d}",
            order_id=order["id"],
            status="unpaid",
            date=day,
            due_date=(date.fromisoformat(day) + timedelta(days=14)).isoformat(),
            paid_gross=0,
            balance_gross=order["gross_total"],
            ksef_status="not_sent",
            ksef_id="",
        )
        row["pdf_url"] = f"/api/demo/documents/invoice/{row['id']}.pdf"
        add_row(state, "invoices", row)
        event(state, "Utworzono fakturę DEMO", row["number"])
        result = row
    elif kind == "pay_invoice":
        row = row_for(state, "invoices", p.get("id"))
        amount = number(p, "amount", row["balance_gross"], 0.01, 1000000000)
        if amount > row["balance_gross"] + 0.005:
            raise HTTPException(422, "Wpłata przekracza saldo faktury.")
        row["paid_gross"] = money(row["paid_gross"] + amount)
        event(
            state,
            "Zarejestrowano płatność DEMO",
            row["number"],
            f"Kwota brutto: {amount:.2f} zł. Brak operacji bankowej.",
        )
        result = row
    elif kind == "send_ksef":
        row = row_for(state, "invoices", p.get("id"))
        row.update(ksef_status="accepted_demo", ksef_id=f"DEMO-KSEF-{row['id']}")
        event(state, "Symulacja przyjęcia KSeF", row["number"])
        message = "Symulacja KSeF. Dokument nie trafił do żadnego systemu urzędowego."
        result = row
    elif kind == "renew_license":
        row = row_for(state, "licenses", p.get("id"))
        start = max(date.fromisoformat(row["expires_at"]), date.fromisoformat(day))
        row.update(
            expires_at=(start + timedelta(days=365)).isoformat(),
            days_remaining=(start + timedelta(days=365) - date.fromisoformat(day)).days,
            status="active",
        )
        event(state, "Odnowiono umowę DEMO", row["product"])
        message = "Przedłużono umowę w demonstracji. Bez zobowiązania poza systemem."
        result = row
    elif kind == "complete_project_task":
        row = row_for(state, "projects", p.get("project_id"))
        task = next((t for t in row["tasks"] if t["id"] == p.get("id")), None)
        if task is None:
            raise HTTPException(404, "Nie znaleziono zadania w tym projekcie.")
        task["status"] = choice(p, "status", {"todo", "done"}, "done")
        row["progress"] = round(
            sum(t["status"] == "done" for t in row["tasks"])
            / max(1, len(row["tasks"]))
            * 100
        )
        row["status"] = "completed" if row["progress"] == 100 else "active"
        event(state, "Zmieniono zadanie projektu", row["name"], task["title"])
        result = row
    elif kind == "update_project":
        row = row_for(state, "projects", p.get("id"))
        if "progress" in p:
            row["progress"] = round(number(p, "progress", 0, 0, 100))
        if "status" in p:
            row["status"] = choice(
                p, "status", {"active", "paused", "completed"}, "active"
            )
        if row["progress"] == 100:
            row["status"] = "completed"
        event(state, "Zaktualizowano projekt", row["name"])
        result = row
    elif kind in {"ai_assist", "analyze_document"}:
        result = analyze(
            state,
            text(p, "prompt", "Przeanalizuj specyfikację i wskaż wymagania.", 4000),
            text(p, "id", p.get("source_id", p.get("document_id", "")), 80),
            p,
        )
        state["ai"]["history"] = [result, *state["ai"]["history"]][:30]
        if kind == "analyze_document":
            row_for(state, "documents", p.get("id"))["analysis"] = result
        event(state, "Przygotowano przykładowy wynik AI", "Analiza demonstracyjna")
        message = (
            "Pokazano przykładowy wynik analizy. Nie wywołano rzeczywistego modelu AI."
        )
    elif kind in {"toggle_automation", "run_automation"}:
        row = row_for(state, "automations", p.get("id"))
        if kind == "toggle_automation":
            row["enabled"] = not row["enabled"]
        else:
            if not row["enabled"]:
                raise HTTPException(409, "Najpierw włącz tę regułę w demonstracji.")
            outcome, message = run_rule(state, row)
            if outcome["created"]:
                row["runs"] += 1
            row["last_result"] = {
                "date": datetime.now().astimezone().isoformat(),
                **outcome,
            }
            result = {**row, **outcome}
        event(state, "Zmieniono automatyzację DEMO", row["name"], message)
        if kind == "toggle_automation":
            result = row
    else:
        raise HTTPException(422, "Ta operacja nie jest dostępna w demonstracji.")
    return enrich(state), message, result


class Workspaces:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute(
                "CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,state TEXT NOT NULL,updated_at INTEGER NOT NULL)"
            )
        try:
            self.path.chmod(0o600)
        except OSError:
            pass

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def load(self, token, before_create=None):
        now = int(time.time())
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM workspaces WHERE updated_at<?", (now - TTL,))
            key = hashlib.sha256(token.encode()).hexdigest() if token else ""
            row = db.execute(
                "SELECT state FROM workspaces WHERE id=?", (key,)
            ).fetchone()
            if row:
                db.execute("UPDATE workspaces SET updated_at=? WHERE id=?", (now, key))
                return json.loads(row[0]), token
            if before_create:
                before_create()
            if (
                db.execute("SELECT count(*) FROM workspaces").fetchone()[0]
                >= MAX_WORKSPACES
            ):
                raise HTTPException(
                    503, "Demonstracja jest chwilowo zajęta. Spróbuj ponownie później."
                )
            token = secrets.token_urlsafe(32)
            key = hashlib.sha256(token.encode()).hexdigest()
            state = enrich(build_state())
            db.execute(
                "INSERT INTO workspaces VALUES(?,?,?)",
                (key, json.dumps(state, ensure_ascii=False), now),
            )
            return state, token

    def action(self, token, action):
        key = hashlib.sha256(token.encode()).hexdigest()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT state FROM workspaces WHERE id=?", (key,)
            ).fetchone()
            if not row:
                raise HTTPException(409, "Sesja demonstracji wygasła. Odśwież widok.")
            state, message, result = mutate(json.loads(row[0]), action)
            encoded = json.dumps(state, ensure_ascii=False)
            if len(encoded.encode()) > MAX_STATE_BYTES:
                raise HTTPException(
                    422, "Demonstracja osiągnęła limit danych. Zresetuj swój widok."
                )
            db.execute(
                "UPDATE workspaces SET state=?,updated_at=? WHERE id=?",
                (encoded, int(time.time()), key),
            )
            return {"state": state, "message": message, "result": result}


def create_app(database_path=None, public_url=None, static_dir=None):
    public_url = public_url or os.environ.get(
        "ADIT_DEMO_PUBLIC_URL", "http://localhost:8400"
    )
    parsed = urlsplit(public_url)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise ValueError("Invalid ADIT_DEMO_PUBLIC_URL")
    if parsed.scheme != "https" and parsed.hostname not in {
        "localhost",
        "127.0.0.1",
        "testserver",
    }:
        raise ValueError("Public demo requires HTTPS")
    allowed_origin = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    store = Workspaces(
        database_path or os.environ.get("ADIT_DEMO_DB_PATH", str(ROOT / "data/demo.db"))
    )
    static = Path(
        static_dir or os.environ.get("ADIT_DEMO_STATIC_DIR", str(ROOT / "dist"))
    ).resolve()
    app = FastAPI(
        title="All Day IT - CRM/ERP Demo",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.store = store
    buckets = defaultdict(deque)
    limit_lock = threading.Lock()

    def limited(key, limit, window=60):
        now = time.monotonic()
        with limit_lock:
            if len(buckets) > 5000:
                for old in list(buckets):
                    if not buckets[old] or buckets[old][-1] < now - 3600:
                        buckets.pop(old, None)
            values = buckets[key]
            while values and values[0] < now - window:
                values.popleft()
            if len(values) >= limit:
                raise HTTPException(429, "Zbyt wiele operacji. Odczekaj chwilę.")
            values.append(now)

    @app.middleware("http")
    async def safety(request, call_next):
        host = request.url.hostname
        if host != parsed.hostname:
            return JSONResponse(
                {"detail": "Nieprawidłowy host demonstracji."},
                status_code=421,
                headers={"X-Robots-Tag": "noindex, nofollow"},
            )
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("origin", "").rstrip("/")
            if origin and origin != allowed_origin:
                return JSONResponse(
                    {"detail": "Niedozwolone źródło żądania."}, status_code=403
                )
            if (
                not request.headers.get("content-type", "")
                .lower()
                .startswith("application/json")
            ):
                return JSONResponse(
                    {"detail": "Wymagane application/json."}, status_code=415
                )
            try:
                size = int(request.headers.get("content-length", "0") or 0)
            except ValueError:
                return JSONResponse(
                    {"detail": "Niepoprawny Content-Length."}, status_code=400
                )
            if size < 0:
                return JSONResponse(
                    {"detail": "Niepoprawny Content-Length."}, status_code=400
                )
            if size > 65000:
                return JSONResponse({"detail": "Zbyt duże żądanie."}, status_code=413)
            buffered = bytearray()
            async for chunk in request.stream():
                if len(buffered) + len(chunk) > 65000:
                    return JSONResponse(
                        {"detail": "Zbyt duże żądanie."}, status_code=413
                    )
                buffered.extend(chunk)
            request._body = bytes(buffered)
        response = await call_next(request)
        response.headers.update(
            {
                "X-Robots-Tag": "noindex, nofollow, noarchive",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "same-origin",
                "X-Frame-Options": "SAMEORIGIN",
                "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
                "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
            }
        )
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def workspace(request, response):
        token = request.cookies.get(COOKIE, "")
        if token and not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            token = ""
        ip = request.client.host if request.client else "unknown"
        state, token = store.load(
            token, before_create=lambda: limited("new:" + ip, 30, 3600)
        )
        response.set_cookie(
            COOKIE,
            token,
            max_age=TTL,
            httponly=True,
            secure=parsed.scheme == "https",
            samesite="strict",
            path="/",
        )
        return state, token

    @app.get("/api/demo/health")
    def health():
        return {
            "status": "ok",
            "product": "all-day-it-demo",
            "demo": True,
            "external_actions": False,
        }

    @app.get("/api/demo/state")
    def state(request: Request, response: Response):
        current, _ = workspace(request, response)
        return enrich(current)

    @app.post("/api/demo/actions")
    def actions(action: Action, request: Request, response: Response):
        _, token = workspace(request, response)
        limited("action:" + hashlib.sha256(token.encode()).hexdigest(), 120)
        if len(json.dumps(action.payload).encode()) > 60000:
            raise HTTPException(413, "Za duże dane operacji.")
        return store.action(token, action)

    @app.get("/api/demo/documents/{kind}/{record_id}.pdf")
    def pdf(kind: str, record_id: str, request: Request, response: Response):
        if kind not in {"offer", "invoice", "document"}:
            raise HTTPException(404, "Nieznany typ dokumentu.")
        current, token = workspace(request, response)
        limited("pdf:" + hashlib.sha256(token.encode()).hexdigest(), 20)
        collection = {
            "offer": "offers",
            "invoice": "invoices",
            "document": "documents",
        }[kind]
        record = row_for(current, collection, record_id)
        from .pdf_documents import render_pdf

        content = render_pdf(kind, record, current)
        result = Response(
            content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="AllDayIT-DEMO-{kind}-{record_id}.pdf"',
                "Cache-Control": "no-store",
            },
        )
        result.set_cookie(
            COOKIE,
            token,
            max_age=TTL,
            httponly=True,
            secure=parsed.scheme == "https",
            samesite="strict",
            path="/",
        )
        return result

    @app.get("/robots.txt")
    def robots():
        return Response("User-agent: *\nDisallow: /\n", media_type="text/plain")

    if (static / "assets").exists():
        app.mount("/assets", StaticFiles(directory=static / "assets"), name="assets")

    @app.get("/{path:path}")
    def frontend(path: str):
        if path.startswith("api/") or path.endswith((".py", ".db", ".env", ".json")):
            raise HTTPException(404, "Nie znaleziono zasobu.")
        candidate = (static / path).resolve()
        if candidate.is_relative_to(static) and candidate.is_file():
            return FileResponse(candidate)
        if (static / "index.html").is_file():
            return FileResponse(static / "index.html")
        return JSONResponse(
            {"product": "All Day IT Demo", "status": "frontend_not_built"},
            status_code=503,
        )

    return app


app = create_app()
