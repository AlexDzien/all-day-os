"""End-to-end demo tests. No production database, mailbox or external API."""

import re
from datetime import date
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from demo.backend import COOKIE, create_app
from demo.data_seed import _build_base_state, build_state, enrich, price_items, totals


@pytest.fixture
def app(tmp_path):
    return create_app(tmp_path / "demo.db", "http://testserver", tmp_path / "dist")


@pytest.fixture
def client(app):
    with TestClient(app, base_url="http://testserver") as result:
        yield result


def perform(client, kind, payload=None):
    return client.post(
        "/api/demo/actions", json={"type": kind, "payload": payload or {}}
    )


def test_fixture_relations_math_and_addresses():
    state = enrich(build_state(date(2026, 11, 3)))
    assert len(state["customers"]) == 68
    assert len(state["deals"]) == 42
    assert len(state["offers"]) == 66
    assert state["stats"]["revenue_net"] == sum(
        r["net_total"] for r in state["invoices"]
    )
    assert (
        sum(r["revenue"] for r in state["revenue_series"])
        == state["stats"]["revenue_net"]
    )
    orders = {r["id"]: r for r in state["orders"]}
    offers = {r["id"]: r for r in state["offers"]}
    for inv in state["invoices"]:
        order = orders[inv["order_id"]]
        assert inv["customer_id"] == order["customer_id"]
        assert inv["gross_total"] == order["gross_total"]
        assert order["gross_total"] == offers[order["offer_id"]]["gross_total"]
    for customer in state["customers"]:
        assert customer["email"].endswith(".example")
        assert customer["nip"].startswith("DEMO-")
    assert state["meta"]["no_external_actions"]


def test_decimal_prices_half_up():
    items = price_items(
        [
            {
                "name": "Test",
                "quantity": 3,
                "price_net": "0.335",
                "discount_pct": 0,
                "vat": 23,
            }
        ],
        [],
    )
    assert items[0]["net"] == 1.01
    assert items[0]["vat_total"] == 0.23
    assert totals(items) == {"net_total": 1.01, "vat_total": 0.23, "gross_total": 1.24}


def test_partial_task_handoff_preserves_context(client):
    state = client.get("/api/demo/state").json()
    task = state["tasks"][0]
    owner = next(person for person in state["team"] if person["id"] != task["owner_id"])
    response = perform(
        client, "update_task", {"id": task["id"], "owner_id": owner["id"]}
    )
    assert response.status_code == 200
    saved = next(
        row for row in response.json()["state"]["tasks"] if row["id"] == task["id"]
    )
    assert saved["owner_id"] == owner["id"]
    assert saved["owner"] == owner["name"]
    for field in (
        "title",
        "customer_id",
        "customer",
        "date",
        "starts_at",
        "ends_at",
        "type",
        "status",
        "priority",
        "description",
    ):
        assert saved[field] == task[field]


def test_visitor_isolation_and_own_reset(app):
    with (
        TestClient(app, base_url="http://testserver") as alice,
        TestClient(app, base_url="http://testserver") as bob,
    ):
        a = alice.get("/api/demo/state").json()
        b = bob.get("/api/demo/state").json()
        assert alice.cookies.get(COOKIE) != bob.cookies.get(COOKIE)
        changed = perform(alice, "move_deal", {"id": "d1", "stage": "won"})
        assert changed.status_code == 200
        assert changed.json()["state"]["deals"][0]["stage"] == "won"
        assert (
            bob.get("/api/demo/state").json()["deals"][0]["stage"]
            == b["deals"][0]["stage"]
        )
        perform(bob, "move_deal", {"id": "d1", "stage": "lost"})
        assert perform(alice, "reset").status_code == 200
        assert (
            alice.get("/api/demo/state").json()["deals"][0]["stage"]
            == a["deals"][0]["stage"]
        )
        assert bob.get("/api/demo/state").json()["deals"][0]["stage"] == "lost"


def test_origin_host_and_payload_boundaries(client):
    assert (
        client.get("/api/demo/state", headers={"host": "wrong.example"}).status_code
        == 421
    )
    assert (
        client.post(
            "/api/demo/actions",
            json={"type": "reset"},
            headers={"origin": "https://evil.example"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/demo/actions",
            content="a=reset",
            headers={"content-type": "text/plain"},
        ).status_code
        == 415
    )
    assert (
        client.post(
            "/api/demo/actions",
            content="{}",
            headers={"content-type": "application/json", "content-length": "bad"},
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/demo/actions",
            content="x" * 66000,
            headers={"content-type": "application/json"},
        ).status_code
        == 413
    )
    response = client.post(
        "/api/demo/actions",
        content=iter([b'{"type":"reset","payload":{"x":"', b"x" * 66000, b'"}}']),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 413


def test_metadata_cookies_and_no_index(client):
    response = client.get("/api/demo/state")
    assert response.status_code == 200
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]
    assert "noindex" in response.headers["x-robots-tag"]
    assert response.headers["cache-control"] == "no-store"
    assert "connect-src 'self'" in response.headers["content-security-policy"]
    assert "Disallow: /" in client.get("/robots.txt").text
    assert client.get("/api/demo/health").json()["external_actions"] is False
    for path in ("/.env", "/backend.py", "/data/demo.db", "/api/not-real"):
        assert client.get(path).status_code == 404


def test_public_https_requires_secure_cookie(tmp_path):
    with TestClient(
        create_app(
            tmp_path / "secure.db", "https://demo.alldayit.pl", tmp_path / "dist"
        ),
        base_url="https://demo.alldayit.pl",
    ) as c:
        response = c.get("/api/demo/state")
        assert "Secure" in response.headers["set-cookie"]
        assert (
            perform(c, "move_deal", {"id": "d1", "stage": "qualified"}).status_code
            == 200
        )


def test_complete_sales_flow_mixed_vat_and_payment(client):
    client.get("/api/demo/state")
    created = perform(
        client,
        "create_offer",
        {
            "customer_id": "c1",
            "title": "Test <script> - DEMO",
            "items": [
                {
                    "product_id": "p1",
                    "quantity": 20,
                    "price_net": 1260,
                    "discount_pct": 5,
                    "vat": 8,
                },
                {"product_id": "p6", "quantity": 1, "price_net": 6400, "vat": 0},
            ],
        },
    )
    assert created.status_code == 200, created.text
    offer = created.json()["result"]
    assert offer["net_total"] == 30340
    assert offer["vat_total"] == 1915.2
    order = perform(client, "offer_to_order", {"id": offer["id"]}).json()["result"]
    second = perform(client, "offer_to_order", {"id": offer["id"]}).json()["result"]
    assert second["id"] == order["id"]
    invoice = perform(client, "create_invoice", {"order_id": order["id"]}).json()[
        "result"
    ]
    assert invoice["gross_total"] == offer["gross_total"]
    data = perform(client, "send_ksef", {"id": invoice["id"]}).json()
    assert "Symulacja KSeF" in data["message"]
    assert data["result"]["ksef_id"].startswith("DEMO-KSEF-")
    assert (
        perform(
            client,
            "pay_invoice",
            {"id": invoice["id"], "amount": invoice["gross_total"] + 1},
        ).status_code
        == 422
    )
    paid = perform(client, "pay_invoice", {"id": invoice["id"]}).json()
    final = next(i for i in paid["state"]["invoices"] if i["id"] == invoice["id"])
    assert final["status"] == "paid" and final["balance_gross"] == 0
    assert perform(client, "delete_offer", {"id": offer["id"]}).status_code == 409


@pytest.mark.parametrize("value", ["NaN", "Infinity", -1])
def test_invalid_arithmetic_fails_without_persistence(client, value):
    before = client.get("/api/demo/state").json()
    response = perform(
        client,
        "create_offer",
        {"customer_id": "c1", "items": [{"product_id": "p1", "quantity": value}]},
    )
    assert response.status_code == 422
    assert len(client.get("/api/demo/state").json()["offers"]) == len(before["offers"])


def test_mail_only_reserved_domains_and_no_sending(client):
    before = client.get("/api/demo/state").json()
    assert (
        perform(
            client,
            "send_message",
            {"to": "real@business.pl", "subject": "Test", "body": "Test"},
        ).status_code
        == 422
    )
    sent = perform(
        client,
        "send_message",
        {
            "to": "kontakt@firma1.example",
            "subject": "Przykładowy kontakt",
            "body": "Wyłącznie symulacja.",
        },
    )
    assert sent.status_code == 200
    assert "nie wysłano" in sent.json()["message"]
    assert len(sent.json()["state"]["messages"]) == len(before["messages"]) + 1
    assert sent.json()["result"]["simulated"] is True
    assert sent.json()["result"]["folder"] == "sent"


def test_ai_demonstration_has_sources_and_disclosure(client):
    data = perform(client, "analyze_document", {"id": "doc1"}).json()
    result = data["result"]
    assert result["simulated"] and result["mode"] == "simulation"
    assert result["sources"][0]["id"] == "doc1"
    assert len(result["fields"]) == 4
    assert result["warnings"]
    state_doc = next(d for d in data["state"]["documents"] if d["id"] == "doc1")
    assert state_doc["analysis"]["id"] == result["id"]


def test_pdf_offer_invoice_document_are_valid(client):
    state = client.get("/api/demo/state").json()
    for kind, key in [
        ("offer", "offers"),
        ("invoice", "invoices"),
        ("document", "documents"),
    ]:
        response = client.get(f"/api/demo/documents/{kind}/{state[key][0]['id']}.pdf")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        reader = PdfReader(BytesIO(response.content))
        assert len(reader.pages) == (3 if kind == "offer" else 1)
        text = "\n".join(page.extract_text() for page in reader.pages)
        assert "DEMO" in text and "ALL DAY IT" in text
        assert "NeoPlant" not in text
    assert client.get("/api/demo/documents/offer/nonexistent.pdf").status_code == 404


def test_viewer_cannot_mutate_and_role_is_per_session(client):
    assert perform(client, "set_role", {"role": "viewer"}).status_code == 200
    assert perform(client, "move_deal", {"id": "d1", "stage": "won"}).status_code == 403
    assert perform(client, "read_message", {"id": "m1"}).status_code == 200
    assert perform(client, "set_role", {"role": "admin"}).status_code == 200
    assert perform(client, "move_deal", {"id": "d1", "stage": "won"}).status_code == 200


def test_other_operational_actions_and_reference_validation(client):
    state = client.get("/api/demo/state").json()
    customer = perform(
        client,
        "create_customer",
        {"name": "Fikcyjna firma", "email": "biuro@nowa.example"},
    ).json()["result"]
    assert customer["id"].startswith("c")
    assert (
        perform(
            client,
            "create_deal",
            {"customer_id": customer["id"], "title": "Wdrożenie", "value_net": 12000},
        ).status_code
        == 200
    )
    task = perform(
        client, "create_task", {"title": "Rozmowa", "customer_id": customer["id"]}
    ).json()["result"]
    assert (
        perform(client, "complete_task", {"id": task["id"]}).json()["result"]["status"]
        == "done"
    )
    assert (
        perform(client, "renew_license", {"id": "lic2"}).json()["result"][
            "days_remaining"
        ]
        > 365
    )
    assert (
        perform(client, "run_campaign", {"id": "camp1"}).json()["result"]["sent"]
        == state["campaigns"][0]["sent"] + 12
    )
    assert (
        perform(client, "update_project", {"id": "pr1", "progress": 100}).json()[
            "result"
        ]["status"]
        == "completed"
    )
    assert (
        perform(
            client,
            "create_offer",
            {"customer_id": "missing", "items": [{"product_id": "p1", "quantity": 1}]},
        ).status_code
        == 404
    )
    assert (
        perform(
            client,
            "create_customer",
            {"name": "Test", "email": "biuro@test.example", "owner_id": "missing"},
        ).status_code
        == 404
    )
    assert perform(client, "unexpected_operation").status_code == 422


def test_mixed_vat_receivable_net_is_proportional():
    state = enrich(build_state(date(2026, 11, 3)))
    state["invoices"] = [
        {
            "id": "x",
            "net_total": 100,
            "gross_total": 108,
            "paid_gross": 54,
            "date": "2026-11-01",
            "due_date": "2026-11-02",
            "customer_id": "c1",
        }
    ]
    enriched = enrich(state)
    assert enriched["stats"]["receivables_net"] == 50
    assert enriched["stats"]["overdue_net"] == 50


def test_campaign_simulation_logs_distinct_inspectable_messages(client):
    before = client.get("/api/demo/state").json()
    first = perform(client, "run_campaign", {"id": "camp1"})
    assert first.status_code == 200
    result = first.json()["result"]
    assert result["batch_count"] == len(result["messages"]) == 12
    for mail in result["messages"]:
        assert mail["campaign_id"] == "camp1"
        assert mail["simulated"] is True and mail["folder"] == "sent"
        assert mail["to"].endswith(".example") and mail["subject"] and mail["body"]
    second = perform(client, "run_campaign", {"id": "camp1"}).json()
    recipients = [m["to"] for m in result["messages"] + second["result"]["messages"]]
    assert len(recipients) == len(set(recipients)) == 24
    assert len(second["state"]["messages"]) == len(before["messages"]) + 24
    assert second["result"]["sent"] == before["campaigns"][0]["sent"] + 24


def test_automation_creates_related_records_and_no_duplicate_order(client):
    before = client.get("/api/demo/state").json()
    first = perform(client, "run_automation", {"id": "a1"}).json()
    assert first["result"]["created"] is True
    assert first["result"]["created_type"] == "deal_and_task"
    assert len(first["state"]["tasks"]) == len(before["tasks"]) + 1
    assert len(first["state"]["deals"]) == len(before["deals"]) + 1
    task = first["result"]["task"]
    assert task["source_automation"] == "a1"
    second = perform(client, "run_automation", {"id": "a1"}).json()
    assert second["result"]["source_id"] != first["result"]["source_id"]
    renewal = perform(client, "run_automation", {"id": "a2"}).json()
    assert renewal["result"]["created"] and renewal["result"]["task"]["customer_id"]
    order = perform(client, "run_automation", {"id": "a3"}).json()
    assert order["result"]["created_type"] == "order"
    assert order["result"]["order"]["offer_id"] == "of2"
    again = perform(client, "run_automation", {"id": "a3"}).json()
    assert not again["result"]["created"]
    assert len(again["state"]["orders"]) == len(order["state"]["orders"])
    overdue = perform(client, "run_automation", {"id": "a4"}).json()
    assert overdue["result"]["created_type"] == "task"
    assert overdue["result"]["task"]["owner_id"] == "u6"
    assert perform(client, "run_automation", {"id": "a5"}).status_code == 409
    perform(client, "toggle_automation", {"id": "a5"})
    tender = perform(client, "run_automation", {"id": "a5"}).json()
    assert tender["result"]["created_type"] == "tender_review_and_task"
    assert tender["state"]["tenders"][0]["review"]["status"] == "needs_review"


def test_composer_preserves_sender_attachment_and_thread(client):
    response = perform(
        client,
        "send_message",
        {
            "from": "zespol2@orion.example",
            "to": "kontakt@firma1.example",
            "subject": "Oferta demonstracyjna",
            "body": "Przekazuję przykładowy dokument.",
            "reply_to_id": "m1",
            "attachments": [{"id": "doc1", "name": "Spoofed"}],
        },
    )
    assert response.status_code == 200
    mail = response.json()["result"]
    assert mail["from"] == "zespol2@orion.example"
    assert mail["reply_to_id"] == "m1" and mail["customer_id"] == "c1"
    assert mail["attachments"][0]["name"] != "Spoofed"
    assert client.get(mail["attachments"][0]["url"]).status_code == 200
    assert (
        perform(
            client,
            "send_message",
            {
                "to": "a@b.example",
                "from": "intruder@b.example",
                "subject": "X",
                "body": "X",
            },
        ).status_code
        == 422
    )


def test_project_task_progress_is_mutable_and_repeatable(client):
    state = client.get("/api/demo/state").json()
    project = state["projects"][0]
    todo = next(t for t in project["tasks"] if t["status"] == "todo")
    response = perform(
        client, "complete_project_task", {"project_id": project["id"], "id": todo["id"]}
    )
    assert response.status_code == 200
    updated = response.json()["result"]
    assert updated["progress"] == round(
        sum(t["status"] == "done" for t in updated["tasks"])
        / len(updated["tasks"])
        * 100
    )
    repeated = perform(
        client, "complete_project_task", {"project_id": project["id"], "id": todo["id"]}
    ).json()["result"]
    assert repeated["progress"] == updated["progress"]
    assert (
        perform(
            client, "complete_project_task", {"project_id": "pr2", "id": todo["id"]}
        ).status_code
        == 404
    )


def test_deal_preserves_selected_owner_and_rejects_unknown_owner(client):
    state = client.get("/api/demo/state").json()
    owner = state["team"][-1]
    response = perform(
        client,
        "create_deal",
        {"customer_id": "c1", "title": "Wybrany opiekun", "owner_id": owner["id"]},
    )
    assert response.status_code == 200
    deal = response.json()["result"]
    assert deal["owner_id"] == owner["id"] and deal["owner"] == owner["name"]
    updated = perform(
        client, "update_deal", {"id": deal["id"], "owner_id": state["team"][0]["id"]}
    )
    assert updated.status_code == 200
    assert updated.json()["result"]["owner_id"] == state["team"][0]["id"]
    assert (
        perform(
            client, "update_deal", {"id": deal["id"], "owner_id": "unknown"}
        ).status_code
        == 404
    )


@pytest.mark.parametrize("profile_id", ["services", "trade", "projects"])
def test_profile_data_has_consistent_products_documents_and_totals(profile_id):
    state = enrich(build_state(date(2026, 11, 3), profile_id))
    assert state["meta"]["profile_id"] == profile_id
    assert {p["id"] for p in state["meta"]["profile_catalog"]} == {
        "services",
        "trade",
        "projects",
    }
    assert state["meta"]["user_name"] == state["meta"]["current_user"]["name"]
    assert state["meta"]["company_short"]
    products = {p["id"]: p for p in state["products"]}
    offers = {p["id"]: p for p in state["offers"]}
    orders = {p["id"]: p for p in state["orders"]}
    for collection in ("offers", "orders", "invoices"):
        for row in state[collection]:
            assert totals(row["items"])["net_total"] == row["net_total"]
            assert totals(row["items"])["gross_total"] == row["gross_total"]
            for item in row["items"]:
                assert item["name"] == products[item["product_id"]]["name"]
                assert item["price_net"] == products[item["product_id"]]["price_net"]
    for order in state["orders"]:
        assert order["gross_total"] == offers[order["offer_id"]]["gross_total"]
        assert order["title"] == offers[order["offer_id"]]["title"]
    for invoice in state["invoices"]:
        assert invoice["gross_total"] == orders[invoice["order_id"]]["gross_total"]
        assert invoice["paid_gross"] + invoice["balance_gross"] == pytest.approx(
            invoice["gross_total"]
        )
    docs = {doc["id"]: doc for doc in state["documents"]}
    assert len({tender["needs_summary"] for tender in state["tenders"]}) == 4
    for tender in state["tenders"]:
        assert docs[tender["document_id"]]["structured_scope"] == tender["offer_items"]
        for item in tender["offer_items"]:
            assert (
                products[item["product_id"]]["name"]
                in docs[tender["document_id"]]["source_text"]
            )
    assert not any(
        "Business Workspace" in doc["source_text"] for doc in state["documents"]
    )


def test_switching_demo_profile_is_isolated_and_reset_preserves_selection(app):
    with (
        TestClient(app, base_url="http://testserver") as alice,
        TestClient(app, base_url="http://testserver") as bob,
    ):
        initial = alice.get("/api/demo/state").json()
        assert initial["meta"]["profile_id"] == "services"
        assert bob.get("/api/demo/state").json()["meta"]["profile_id"] == "services"
        perform(
            alice,
            "create_customer",
            {"name": "Wyłącznie moja zmiana", "email": "test@my.example"},
        )
        switched = perform(alice, "set_demo_profile", {"profile_id": "trade"})
        assert switched.status_code == 200
        state = switched.json()["state"]
        assert state["meta"]["company"] == "Orion Dystrybucja"
        assert not any(
            row["name"] == "Wyłącznie moja zmiana" for row in state["customers"]
        )
        assert (
            bob.get("/api/demo/state").json()["meta"]["company"]
            == initial["meta"]["company"]
        )
        assert perform(alice, "reset").json()["state"]["meta"]["profile_id"] == "trade"
        before = alice.get("/api/demo/state").json()
        assert (
            perform(alice, "set_demo_profile", {"profile_id": "unknown"}).status_code
            == 422
        )
        assert (
            alice.get("/api/demo/state").json()["meta"]["company"]
            == before["meta"]["company"]
        )
        perform(alice, "set_role", {"role": "viewer"})
        assert (
            perform(alice, "set_demo_profile", {"profile_id": "projects"}).status_code
            == 403
        )
        assert perform(alice, "reset").json()["state"]["meta"]["role"] == "viewer"


def test_legacy_metadata_preserves_user_records_and_own_reset_keeps_legacy():
    state = _build_base_state(date(2026, 11, 3))
    state["customers"][0]["notes"] = "Własne edytowane ustalenia"
    enriched = enrich(state)
    assert enriched["meta"]["profile_id"] == "legacy"
    assert enriched["meta"]["profile_label"] == "Własna przestrzeń"
    assert enriched["customers"][0]["notes"] == "Własne edytowane ustalenia"
    assert build_state(profile_id="legacy")["meta"]["profile_id"] == "legacy"


def test_copilot_uses_customer_and_document_context_in_each_profile(client):
    for profile in ("services", "trade", "projects"):
        state = perform(client, "set_demo_profile", {"profile_id": profile}).json()[
            "state"
        ]
        result = perform(
            client, "ai_assist", {"customer_id": "c2", "prompt": "Podsumuj relację"}
        ).json()["result"]
        assert state["customers"][1]["name"] in result["answer"]
        assert result["sources"][0]["url"] == "#/clients/c2"
        assert result["suggested_items"] == []
        reply = perform(
            client, "ai_assist", {"customer_id": "c2", "prompt": "Przygotuj odpowiedź"}
        ).json()["result"]
        assert (
            "Dzień dobry" in reply["answer"]
            and state["meta"]["company"] in reply["answer"]
        )
        document = next(doc for doc in state["documents"] if doc["id"] == "doc5")
        analysis = perform(client, "analyze_document", {"id": "doc5"}).json()["result"]
        assert analysis["sources"][0]["name"] == document["name"]
        assert analysis["suggested_items"] == document["structured_scope"]
        for item in analysis["suggested_items"]:
            product = next(
                p for p in state["products"] if p["id"] == item["product_id"]
            )
            assert product["name"] in analysis["answer"]
    assert (
        perform(
            client, "ai_assist", {"customer_id": "missing", "prompt": "Podsumuj"}
        ).status_code
        == 404
    )


def test_copilot_financial_output_uses_polish_amount_format(client):
    state = client.get("/api/demo/state").json()
    result = perform(client, "ai_assist", {"prompt": "Podsumuj wyniki firmy"}).json()[
        "result"
    ]
    for index, key in enumerate(("revenue_net", "pipeline_net", "receivables_net")):
        value = result["fields"][index]["value"]
        assert re.fullmatch(r"\d{1,3}(?: \d{3})*,\d{2} zł", value)
        assert (
            float(value.removesuffix(" zł").replace(" ", "").replace(",", "."))
            == state["stats"][key]
        )
    assert result["fields"][0]["value"] in result["answer"]
    assert result["fields"][1]["value"] in result["answer"]
    assert ".00 zł" not in result["answer"]
