from __future__ import annotations

import json
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from xml.etree import ElementTree


NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NO_DATA = {"", "0", "____________________"}
REQUIRED_HEADERS = {
    "AREA COD", "AREA", "LOC COD", "LOCALIDAD", "RUTA COD", "RUTA", "CORREL",
    "CODIGO", "CATEGORIA", "NOMBRE", "DIRECCION", "MEDIDOR", "MESES", "DEUDA",
    "ESTADO", "OBSERVACIONES", "UBICACION", "LATITUD", "LONGITUD",
    "TELEFONO / CELULAR", "CIRCUITO", "ULTIMA FECHA FACT.",
}


def cell_value(cell: ElementTree.Element, shared_strings: list[str]) -> str:
    value = cell.find(f"{{{NAMESPACE}}}v")
    if value is None:
        inline = cell.find(f"{{{NAMESPACE}}}is")
        return "".join(part.text or "" for part in inline.iter(f"{{{NAMESPACE}}}t")) if inline is not None else ""
    text = value.text or ""
    return shared_strings[int(text)] if cell.attrib.get("t") == "s" else text


def column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference or "")
    if not letters:
        raise ValueError(f"Invalid Excel cell reference: {reference}")
    result = 0
    for letter in letters.group(0):
        result = result * 26 + ord(letter) - ord("A") + 1
    return result - 1


def load_rows(path: Path) -> list[list[str]]:
    with zipfile.ZipFile(path) as workbook:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(part.text or "" for part in item.iter(f"{{{NAMESPACE}}}t"))
                for item in root.findall(f"{{{NAMESPACE}}}si")
            ]

        sheet = workbook.read("xl/worksheets/sheet1.xml")
        root = ElementTree.fromstring(sheet)
        rows: list[list[str]] = []
        for row in root.findall(f".//{{{NAMESPACE}}}sheetData/{{{NAMESPACE}}}row"):
            values: dict[int, str] = {}
            for cell in row.findall(f"{{{NAMESPACE}}}c"):
                values[column_index(cell.attrib.get("r", ""))] = cell_value(cell, shared_strings)
            rows.append([values.get(index, "") for index in range(max(values.keys(), default=-1) + 1)])
        return rows


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def decimal_value(value: str) -> Decimal:
    text = clean(value).replace(" ", "")
    if "," in text and "." in text:
        text = text.replace(",", "")
    elif "," in text:
        parts = text.split(",")
        text = "".join(parts) if len(parts[-1]) == 3 else ".".join(parts)
    try:
        return Decimal(text)
    except InvalidOperation as error:
        raise ValueError(f"Invalid monetary value: {value}") from error


def cents(value: str) -> int:
    amount = (decimal_value(value) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    if amount < 0:
        raise ValueError(f"Debt cannot be negative: {value}")
    return int(amount)


def optional_number(value: str) -> str:
    text = clean(value)
    return "" if text in NO_DATA else text


def iso_timestamp(value: str) -> str:
    text = clean(value)
    parsed = datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=timezone.utc)
    return parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sql_literal(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def json_literal(value: object) -> str:
    return sql_literal(json.dumps(value, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def map_row(headers: list[str], values: list[str], excel_row: int) -> dict[str, object]:
    raw = {header: clean(values[index] if index < len(values) else "") for index, header in enumerate(headers)}
    missing = sorted(header for header in REQUIRED_HEADERS if not raw.get(header))
    if missing:
        raise ValueError(f"Excel row {excel_row} missing required values: {', '.join(missing)}")

    meter = raw["MEDIDOR"]
    meter_id, separator, brand = meter.partition("(")
    brand = brand.rstrip(") ") if separator else ""
    latitude = optional_number(raw["LATITUD"])
    longitude = optional_number(raw["LONGITUD"])
    phone = optional_number(raw["TELEFONO / CELULAR"])
    if latitude == "0" or latitude == "0.0":
        latitude = ""
    if longitude == "0" or longitude == "0.0":
        longitude = ""
    if phone == "0":
        phone = ""

    return {
        "debtor_id": f"EXCEL-{raw['CODIGO']}",
        "account_id": raw["CODIGO"],
        "supply_id": f"SUM-{raw['CODIGO']}",
        "customer_name": raw["NOMBRE"],
        "address": raw["DIRECCION"],
        "reference_text": "" if raw["OBSERVACIONES"] in NO_DATA else raw["OBSERVACIONES"],
        "meter_id": meter_id.strip(),
        "area": raw["AREA COD"],
        "locality": f"{raw['LOC COD']} - {raw['LOCALIDAD']}",
        "route": raw["RUTA COD"],
        "debt_cents": cents(raw["DEUDA"]),
        "months_pending": int(raw["MESES"]),
        "updated_at": iso_timestamp(raw["ULTIMA FECHA FACT."]),
        "circuit": raw["CIRCUITO"],
        "customer_ci": None,
        "contact_phone": phone or None,
        "tariff": raw["CATEGORIA"],
        "supply_status": raw["ESTADO"],
        "enabling_title": None,
        "route_order": int(raw["CORREL"]),
        "cadastral_latitude": latitude or None,
        "cadastral_longitude": longitude or None,
        "meter_brand": brand or None,
        "meter_index": meter_id.strip(),
        "meter_multiplier": 1,
        "claims": None,
        "payment_plan": None,
        "suspension_date": None,
        "reconnection_manual": None,
        "reconnection_date": None,
        "reconnection_technician": None,
        "kardex": [],
        "context": {
            "dataset": "EXCEL_20260330",
            "meaning_status": "TODO: VALIDAR CON SEPSA",
            "area_name": raw["AREA"],
            "ruta_name": raw["RUTA"],
            "ubicacion_url": raw["UBICACION"],
            "correl": raw["CORREL"],
            "excel_row": raw,
        },
    }


def make_sql(rows: list[dict[str, object]]) -> str:
    columns = [
        "debtor_id", "account_id", "supply_id", "customer_name", "address", "reference_text", "meter_id",
        "area", "locality", "route", "debt_cents", "months_pending", "kardex", "context", "updated_at",
        "source", "circuit", "customer_ci", "contact_phone", "tariff", "supply_status", "enabling_title",
        "route_order", "cadastral_latitude", "cadastral_longitude", "meter_brand", "meter_index",
        "meter_multiplier", "claims", "payment_plan", "suspension_date", "reconnection_manual",
        "reconnection_date", "reconnection_technician",
    ]
    values = []
    for row in rows:
        values.append("(" + ", ".join([
            sql_literal(row["debtor_id"]), sql_literal(row["account_id"]), sql_literal(row["supply_id"]),
            sql_literal(row["customer_name"]), sql_literal(row["address"]), sql_literal(row["reference_text"]),
            sql_literal(row["meter_id"]), sql_literal(row["area"]), sql_literal(row["locality"]),
            sql_literal(row["route"]), sql_literal(row["debt_cents"]), sql_literal(row["months_pending"]),
            json_literal(row["kardex"]), json_literal(row["context"]), sql_literal(row["updated_at"]),
            sql_literal("PILOT_PROVISIONAL"), sql_literal(row["circuit"]), sql_literal(row["customer_ci"]),
            sql_literal(row["contact_phone"]), sql_literal(row["tariff"]), sql_literal(row["supply_status"]),
            sql_literal(row["enabling_title"]), sql_literal(row["route_order"]),
            sql_literal(row["cadastral_latitude"]), sql_literal(row["cadastral_longitude"]),
            sql_literal(row["meter_brand"]), sql_literal(row["meter_index"]), sql_literal(row["meter_multiplier"]),
            sql_literal(row["claims"]), sql_literal(row["payment_plan"]), sql_literal(row["suspension_date"]),
            sql_literal(row["reconnection_manual"]), sql_literal(row["reconnection_date"]),
            sql_literal(row["reconnection_technician"]),
        ]) + ")")

    updates = [
        "customer_name = EXCLUDED.customer_name",
        "address = EXCLUDED.address",
        "reference_text = CASE WHEN EXCLUDED.reference_text <> '' THEN EXCLUDED.reference_text ELSE debtors.reference_text END",
        "meter_id = EXCLUDED.meter_id",
        "area = EXCLUDED.area",
        "locality = EXCLUDED.locality",
        "route = EXCLUDED.route",
        "debt_cents = EXCLUDED.debt_cents",
        "months_pending = EXCLUDED.months_pending",
        "context = debtors.context || EXCLUDED.context",
        "updated_at = EXCLUDED.updated_at",
        "circuit = EXCLUDED.circuit",
        "contact_phone = COALESCE(EXCLUDED.contact_phone, debtors.contact_phone)",
        "tariff = EXCLUDED.tariff",
        "supply_status = EXCLUDED.supply_status",
        "route_order = EXCLUDED.route_order",
        "cadastral_latitude = COALESCE(EXCLUDED.cadastral_latitude, debtors.cadastral_latitude)",
        "cadastral_longitude = COALESCE(EXCLUDED.cadastral_longitude, debtors.cadastral_longitude)",
        "meter_brand = COALESCE(EXCLUDED.meter_brand, debtors.meter_brand)",
        "meter_index = EXCLUDED.meter_index",
        "meter_multiplier = COALESCE(EXCLUDED.meter_multiplier, debtors.meter_multiplier)",
    ]
    return """BEGIN;
INSERT INTO debtors (%s)
VALUES
  %s
ON CONFLICT (debtor_id) DO UPDATE SET
  %s;
COMMIT;
""" % (", ".join(columns), ",\n  ".join(values), ",\n  ".join(updates))


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: import-debtors-xlsx.py PATH", file=sys.stderr)
        return 2
    path = Path(sys.argv[1]).expanduser()
    if not path.is_file():
        print(f"Excel file not found: {path}", file=sys.stderr)
        return 2
    database_url = __import__("os").environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("DATABASE_URL is required; no database write was attempted.", file=sys.stderr)
        return 2

    rows = load_rows(path)
    if not rows:
        print("Excel contains no rows.", file=sys.stderr)
        return 2
    headers = [clean(value) for value in rows[0]]
    missing_headers = sorted(REQUIRED_HEADERS - set(headers))
    if missing_headers:
        print(f"Excel headers missing: {', '.join(missing_headers)}", file=sys.stderr)
        return 2

    mapped = [map_row(headers, values, index + 1) for index, values in enumerate(rows[1:], start=2) if any(clean(value) for value in values)]
    debtor_ids = [str(row["debtor_id"]) for row in mapped]
    account_ids = [str(row["account_id"]) for row in mapped]
    if len(debtor_ids) != len(set(debtor_ids)) or len(account_ids) != len(set(account_ids)):
        raise ValueError("Excel contains duplicate CODIGO values.")

    subprocess.run(
        ["psql", "--dbname", database_url, "--set", "ON_ERROR_STOP=1", "--quiet"],
        input=make_sql(mapped),
        text=True,
        check=True,
    )
    localities = {str(row["locality"]) for row in mapped}
    routes = {str(row["route"]) for row in mapped}
    statuses = {str(row["supply_status"]) for row in mapped}
    print(f"Imported {len(mapped)} debtor rows transactionally.")
    print(f"Distinct areas: {len({str(row['area']) for row in mapped})}; localities: {len(localities)}; routes: {len(routes)}; statuses: {len(statuses)}.")
    print("Existing debtor/account/supply identifiers were preserved; no orders or audit rows were deleted.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, zipfile.BadZipFile) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(2) from error
