from __future__ import annotations

import json
import re
import subprocess
import sys
import uuid
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
OPTIONAL_VALUE_HEADERS = {"LATITUD", "LONGITUD", "TELEFONO / CELULAR", "OBSERVACIONES", "UBICACION"}
REQUIRED_VALUE_HEADERS = REQUIRED_HEADERS - OPTIONAL_VALUE_HEADERS


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


def iso_timestamp(value: str) -> str | None:
    text = clean(value)
    if text in NO_DATA or text.casefold() in {"antigua", "n/a", "s/d"}:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=timezone.utc)
    except ValueError as error:
        raise ValueError(f"Invalid source timestamp: {value!r}. Keep source value in context or validate with SEPSA.") from error
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


def cut_order_eligible(row: dict[str, object]) -> bool:
    return int(row["debt_cents"]) > 0 and int(row["months_pending"]) >= 3


def map_row(headers: list[str], values: list[str], excel_row: int, dataset: str = "EXCEL_IMPORTED") -> dict[str, object]:
    raw = {header: clean(values[index] if index < len(values) else "") for index, header in enumerate(headers)}
    missing = sorted(header for header in REQUIRED_VALUE_HEADERS if not raw.get(header))
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
    updated_at = iso_timestamp(raw["ULTIMA FECHA FACT."])

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
        "updated_at": updated_at,
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
            "dataset": dataset,
            "meaning_status": "TODO: VALIDAR CON SEPSA",
            "source_updated_at": raw["ULTIMA FECHA FACT."],
            "updated_at_status": "UNAVAILABLE_SOURCE_VALUE" if updated_at is None else "PARSED_SOURCE_VALUE",
            "area_name": raw["AREA"],
            "ruta_name": raw["RUTA"],
            "ubicacion_url": raw["UBICACION"],
            "correl": raw["CORREL"],
            "excel_row": raw,
        },
    }


def make_sql(rows: list[dict[str, object]], replace_pilot: bool = False, assign_technician: str | None = None) -> str:
    if assign_technician and not replace_pilot:
        raise ValueError("--assign-technician requires --replace-pilot so assignment is bounded to this field-test load.")

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
    statements = ["BEGIN;"]
    if replace_pilot:
        statements.extend([
            "-- Explicit field-test replacement. Users remain so credentials and role identities stay stable.",
            "DELETE FROM sync_operations WHERE source = 'PILOT_PROVISIONAL';",
            "DELETE FROM cut_authorizations WHERE source = 'PILOT_PROVISIONAL';",
            "DELETE FROM order_assignments WHERE source = 'PILOT_PROVISIONAL';",
            "DELETE FROM audit_events WHERE source = 'PILOT_PROVISIONAL';",
            "DELETE FROM orders WHERE source = 'PILOT_PROVISIONAL';",
            "DELETE FROM sessions WHERE source = 'PILOT_PROVISIONAL';",
            "DELETE FROM command_operations WHERE source = 'PILOT_PROVISIONAL';",
            "DELETE FROM debtors WHERE source = 'PILOT_PROVISIONAL';",
        ])

    statements.append("""INSERT INTO debtors (%s)
VALUES
  %s
ON CONFLICT (debtor_id) DO UPDATE SET
  %s;""" % (", ".join(columns), ",\n  ".join(values), ",\n  ".join(updates)))

    if assign_technician:
        technician_literal = sql_literal(assign_technician)
        technician_error = sql_literal(f"Requested pilot technician is missing, disabled, or not a technician: {assign_technician}")
        admin_selector = "(SELECT user_id FROM users WHERE username = 'admin.sepsa' AND role = 'ADMIN' AND enabled = true AND source = 'PILOT_PROVISIONAL')"
        technician_selector = f"(SELECT user_id FROM users WHERE username = {technician_literal} AND role = 'TECHNICIAN' AND enabled = true AND source = 'PILOT_PROVISIONAL')"
        statements.append(f"""DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin.sepsa' AND role = 'ADMIN' AND enabled = true AND source = 'PILOT_PROVISIONAL') THEN
    RAISE EXCEPTION 'Required pilot admin admin.sepsa is missing or disabled.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE username = {technician_literal} AND role = 'TECHNICIAN' AND enabled = true AND source = 'PILOT_PROVISIONAL') THEN
    RAISE EXCEPTION {technician_error};
  END IF;
END $$;""")

        eligible_rows = [row for row in rows if cut_order_eligible(row)]
        for row in eligible_rows:
            order_id = str(uuid.uuid4())
            assignment_id = str(uuid.uuid4())
            cuc = f"CUC-{uuid.uuid4()}"
            debtor_id = str(row["debtor_id"])
            create_operation_id = f"FIELD-TEST-CREATE-{debtor_id}"
            assignment_operation_id = f"FIELD-TEST-ASSIGN-{debtor_id}"
            statements.extend([
                f"""INSERT INTO orders(order_id, cuc, debtor_id, purpose, status, physical_status, version, created_by, source)
VALUES ({sql_literal(order_id)}, {sql_literal(cuc)}, {sql_literal(debtor_id)}, 'CUT', 'GENERADO', 'NONE', 1, {admin_selector}, 'PILOT_PROVISIONAL');""",
                f"""INSERT INTO audit_events(audit_id, actor_id, actor_role, action, entity_id, order_id, operation_id, result, transition, metadata, source)
VALUES ({sql_literal(str(uuid.uuid4()))}, {admin_selector}, 'ADMIN', 'CREATE_ORDER', {sql_literal(order_id)}, {sql_literal(order_id)}, {sql_literal(create_operation_id)}, 'accepted',
  jsonb_build_object('before', NULL, 'after', 'GENERADO', 'version', 1),
  {json_literal({'field_test': True, 'debtor_id': debtor_id})}, 'PILOT_PROVISIONAL');""",
                f"""UPDATE orders
SET assigned_technician_id = {technician_selector}, version = 2, updated_at = now()
WHERE order_id = {sql_literal(order_id)} AND status = 'GENERADO' AND version = 1;""",
                f"""INSERT INTO order_assignments(assignment_id, order_id, technician_id, assigned_by, from_technician_id, version, source)
VALUES ({sql_literal(assignment_id)}, {sql_literal(order_id)}, {technician_selector}, {admin_selector}, NULL, 2, 'PILOT_PROVISIONAL');""",
                f"""INSERT INTO audit_events(audit_id, actor_id, actor_role, action, entity_id, order_id, operation_id, result, transition, metadata, source)
VALUES ({sql_literal(str(uuid.uuid4()))}, {admin_selector}, 'ADMIN', 'ASSIGN_ORDER', {sql_literal(order_id)}, {sql_literal(order_id)}, {sql_literal(assignment_operation_id)}, 'accepted',
  jsonb_build_object('before', NULL, 'after', {technician_selector}, 'version', 2),
  {json_literal({'field_test': True, 'technician_username': assign_technician})}, 'PILOT_PROVISIONAL');""",
            ])

    statements.append("COMMIT;")
    return "\n\n".join(statements) + "\n"


def parse_arguments(arguments: list[str]) -> dict[str, object]:
    if not arguments:
        raise ValueError("Usage: import-debtors-xlsx.py PATH [--dataset DATASET] [--dry-run] [--replace-pilot --create-cut-orders --assign-technician USERNAME]")

    path: Path | None = None
    dataset = "EXCEL_IMPORTED"
    dry_run = False
    replace_pilot = False
    create_cut_orders = False
    assign_technician: str | None = None
    index = 0
    while index < len(arguments):
        argument = arguments[index]
        if argument.startswith("--"):
            if argument == "--dry-run":
                dry_run = True
            elif argument == "--replace-pilot":
                replace_pilot = True
            elif argument == "--create-cut-orders":
                create_cut_orders = True
            elif argument in {"--dataset", "--assign-technician"}:
                index += 1
                if index >= len(arguments) or arguments[index].startswith("--"):
                    raise ValueError(f"{argument} requires a value.")
                if argument == "--dataset":
                    dataset = arguments[index]
                else:
                    assign_technician = arguments[index]
            else:
                raise ValueError(f"Unknown option: {argument}")
        elif path is None:
            path = Path(argument).expanduser()
        else:
            raise ValueError(f"Unexpected argument: {argument}")
        index += 1

    if path is None:
        raise ValueError("An Excel path is required.")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", dataset):
        raise ValueError("Dataset must contain only letters, numbers, underscores, or hyphens.")
    if create_cut_orders and not assign_technician:
        raise ValueError("--create-cut-orders requires --assign-technician.")
    if assign_technician and not create_cut_orders:
        raise ValueError("--assign-technician requires --create-cut-orders.")
    if create_cut_orders and not replace_pilot:
        raise ValueError("--create-cut-orders requires --replace-pilot so orders are not duplicated or reassigned silently.")
    return {
        "path": path,
        "dataset": dataset,
        "dry_run": dry_run,
        "replace_pilot": replace_pilot,
        "assign_technician": assign_technician,
    }


def main() -> int:
    options = parse_arguments(sys.argv[1:])
    path = options["path"]
    dataset = str(options["dataset"])
    dry_run = bool(options["dry_run"])
    replace_pilot = bool(options["replace_pilot"])
    assign_technician = options["assign_technician"]
    if not isinstance(path, Path):
        raise ValueError("Invalid Excel path.")
    if not path.is_file():
        print(f"Excel file not found: {path}", file=sys.stderr)
        return 2
    database_url = __import__("os").environ.get("DATABASE_URL", "").strip()
    if not database_url and not dry_run:
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

    mapped = [map_row(headers, values, index + 1, dataset) for index, values in enumerate(rows[1:], start=2) if any(clean(value) for value in values)]
    debtor_ids = [str(row["debtor_id"]) for row in mapped]
    account_ids = [str(row["account_id"]) for row in mapped]
    if len(debtor_ids) != len(set(debtor_ids)) or len(account_ids) != len(set(account_ids)):
        raise ValueError("Excel contains duplicate CODIGO values.")

    eligible_count = sum(cut_order_eligible(row) for row in mapped)
    if dry_run:
        print(f"Validated {len(mapped)} debtor rows from {path.name}.")
        print(f"Eligible cut orders (debt_cents > 0 and months_pending >= 3): {eligible_count}.")
        print(f"Rows without an eligible cut order: {len(mapped) - eligible_count}.")
        print(f"Dataset: {dataset}.")
        return 0

    subprocess.run(
        ["psql", "--dbname", database_url, "--set", "ON_ERROR_STOP=1", "--quiet"],
        input=make_sql(mapped, replace_pilot, str(assign_technician) if assign_technician else None),
        text=True,
        encoding="utf-8",
        check=True,
    )
    localities = {str(row["locality"]) for row in mapped}
    routes = {str(row["route"]) for row in mapped}
    statuses = {str(row["supply_status"]) for row in mapped}
    print(f"Imported {len(mapped)} debtor rows transactionally.")
    print(f"Distinct areas: {len({str(row['area']) for row in mapped})}; localities: {len(localities)}; routes: {len(routes)}; statuses: {len(statuses)}.")
    if replace_pilot:
        print("Replaced previous PILOT_PROVISIONAL field-test data; users were preserved.")
    if assign_technician:
        print(f"Created {eligible_count} CUT orders and assigned all to {assign_technician}.")
    else:
        print("Existing debtor/account/supply identifiers were preserved; no orders or audit rows were deleted.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, zipfile.BadZipFile) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(2) from error
