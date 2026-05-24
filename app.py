from __future__ import annotations

import contextlib
import io
import json
import sqlite3
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from flask import Flask, jsonify, render_template, request


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "odoo_playground.sqlite3"


@dataclass(frozen=True)
class Field:
    name: str
    type: str
    relation: str | None = None
    inverse: str | None = None
    relation_table: str | None = None
    column1: str | None = None
    column2: str | None = None


@dataclass(frozen=True)
class ModelMeta:
    name: str
    table: str
    fields: dict[str, Field]
    sql_constraints: list[tuple[str, str, str]]


MODELS: dict[str, ModelMeta] = {
    "product.category": ModelMeta(
        "product.category",
        "product_category",
        {
            "id": Field("id", "integer"),
            "name": Field("name", "char"),
            "product_ids": Field("product_ids", "one2many", "product.product", "categ_id"),
        },
        [],
    ),
    "product.tag": ModelMeta(
        "product.tag",
        "product_tag",
        {
            "id": Field("id", "integer"),
            "name": Field("name", "char"),
            "product_ids": Field(
                "product_ids",
                "many2many",
                "product.product",
                relation_table="product_product_tag_rel",
                column1="tag_id",
                column2="product_id",
            ),
        },
        [],
    ),
    "product.product": ModelMeta(
        "product.product",
        "product_product",
        {
            "id": Field("id", "integer"),
            "name": Field("name", "char"),
            "default_code": Field("default_code", "char"),
            "list_price": Field("list_price", "float"),
            "categ_id": Field("categ_id", "many2one", "product.category"),
            "tag_ids": Field(
                "tag_ids",
                "many2many",
                "product.tag",
                relation_table="product_product_tag_rel",
                column1="product_id",
                column2="tag_id",
            ),
        },
        [("unique_default_code", "unique(default_code)", "Product internal reference must be unique.")],
    ),
    "res.partner": ModelMeta(
        "res.partner",
        "res_partner",
        {"id": Field("id", "integer"), "name": Field("name", "char"), "email": Field("email", "char")},
        [],
    ),
    "sale.order": ModelMeta(
        "sale.order",
        "sale_order",
        {
            "id": Field("id", "integer"),
            "name": Field("name", "char"),
            "partner_id": Field("partner_id", "many2one", "res.partner"),
            "order_line": Field("order_line", "one2many", "sale.order.line", "order_id"),
        },
        [("unique_name", "unique(name)", "Sale order name must be unique.")],
    ),
    "sale.order.line": ModelMeta(
        "sale.order.line",
        "sale_order_line",
        {
            "id": Field("id", "integer"),
            "order_id": Field("order_id", "many2one", "sale.order"),
            "product_id": Field("product_id", "many2one", "product.product"),
            "quantity": Field("quantity", "float"),
            "price_unit": Field("price_unit", "float"),
        },
        [],
    ),
}


EXAMPLES = [
    {
        "title": "Search products",
        "code": "# env['product.product'] means: open the Product model.\n"
        "# search([]) means: search with no filter, so return all products.\n"
        "products = env['product.product'].search([])\n"
        "# products is a recordset: a group of product records.\n"
        "# read() changes those records into plain dictionaries, so they are easy to print.\n"
        "print(products.read())",
    },
    {
        "title": "Empty recordset",
        "code": "# The domain [('name', '=', 'Not Exist')] means:\n"
        "# find products where the name is exactly 'Not Exist'.\n"
        "product = env['product.product'].search([('name', '=', 'Not Exist')])\n"
        "# No product has that name, so the result is an empty recordset.\n"
        "print(product)\n"
        "# bool(product) tells you if the recordset has at least one record.\n"
        "# Empty recordsets are False. Non-empty recordsets are True.\n"
        "print(bool(product))",
    },
    {
        "title": "Many2one",
        "code": "# First, find the product named Laptop.\n"
        "product = env['product.product'].search([('name', '=', 'Laptop')])\n"
        "# categ_id is a Many2one field: one product belongs to one category.\n"
        "# product.categ_id gives the related category record.\n"
        "# .name reads the name field on that category.\n"
        "print(product.categ_id.name)",
    },
    {
        "title": "One2many",
        "code": "# First, find the category named Electronics.\n"
        "category = env['product.category'].search([('name', '=', 'Electronics')])\n"
        "# product_ids is a One2many field: one category can have many products.\n"
        "# It contains every product whose categ_id points to this category.\n"
        "# read(['name', 'list_price']) prints only the fields we ask for.\n"
        "print(category.product_ids.read(['name', 'list_price']))",
    },
    {
        "title": "Many2many",
        "code": "# First, find the product named Laptop.\n"
        "product = env['product.product'].search([('name', '=', 'Laptop')])\n"
        "# tag_ids is a Many2many field: one product can have many tags,\n"
        "# and one tag can also belong to many products.\n"
        "# read() prints the tag records linked to Laptop.\n"
        "print(product.tag_ids.read())",
    },
    {
        "title": "ensure_one",
        "code": "# search([]) returns all products, so products has many records.\n"
        "products = env['product.product'].search([])\n"
        "# ensure_one() checks that the recordset has exactly one record.\n"
        "# This example raises an error on purpose because there are many products.\n"
        "# In real code, use ensure_one() before reading fields that need one record.\n"
        "products.ensure_one()",
    },
    {
        "title": "exists after unlink",
        "code": "# create() adds a new product to the database.\n"
        "p = env['product.product'].create({'name': 'Temp Product', 'default_code': 'TMP001'})\n"
        "# exists() checks if the record still exists in the database.\n"
        "# Right after create(), it exists, so read() shows the product.\n"
        "print(p.exists().read())\n"
        "# unlink() deletes the product from the database.\n"
        "p.unlink()\n"
        "# p still remembers the old id, but the database row is gone.\n"
        "# exists() returns an empty recordset after unlink().\n"
        "print(p.exists().read())",
    },
    {
        "title": "copy",
        "code": "# Find the original product that we want to duplicate.\n"
        "p = env['product.product'].search([('name', '=', 'Laptop')])\n"
        "# copy({...}) creates a new product using Laptop as the template.\n"
        "# The dictionary changes fields on the new copy only.\n"
        "new_p = p.copy({'name': 'Laptop Copy', 'default_code': 'LAPCOPY'})\n"
        "# Print the new product record.\n"
        "print(new_p.read())",
    },
    {
        "title": "name_get",
        "code": "# Get all product records first.\n"
        "products = env['product.product'].search([])\n"
        "# name_get() returns a list of pairs: (record id, display name).\n"
        "# Odoo uses this kind of result in dropdowns and relation fields.\n"
        "print(products.name_get())",
    },
    {
        "title": "name_search",
        "code": "# name_search('lap') searches by display name.\n"
        "# It is similar to what Odoo does when you type in a Many2one dropdown.\n"
        "# The result is a list of (id, display name) pairs.\n"
        "print(env['product.product'].name_search('lap'))",
    },
    {
        "title": "read vs search_read",
        "code": "# This version does two steps:\n"
        "# 1. search([]) gets all product records.\n"
        "# 2. read([...]) prints only name and list_price.\n"
        "print(env['product.product'].search([]).read(['name', 'list_price']))\n"
        "# search_read(domain, fields) is a shortcut for search() then read().\n"
        "# It returns the same kind of list of dictionaries.\n"
        "print(env['product.product'].search_read([], ['name', 'list_price']))",
    },
    {
        "title": "many2many commands",
        "code": "# Find the Laptop product.\n"
        "p = env['product.product'].search([('name', '=', 'Laptop')])\n"
        "# tag_ids is Many2many, so we update it with command tuples.\n"
        "# (6, 0, [1, 2]) means: replace all current tags with tag ids 1 and 2.\n"
        "p.write({'tag_ids': [(6, 0, [1, 2])]})\n"
        "# Print the tags now linked to Laptop.\n"
        "print(p.tag_ids.read())",
    },
    {
        "title": "one2many commands",
        "code": "# Find the sale order named SO001.\n"
        "order = env['sale.order'].search([('name', '=', 'SO001')])\n"
        "# order_line is One2many, so we update it with command tuples.\n"
        "# (0, 0, values) means: create a new child line with these values.\n"
        "# product_id 1 is the product on the line.\n"
        "# quantity and price_unit are used to calculate the line amount.\n"
        "order.write({\n"
        "    'order_line': [\n"
        "        (0, 0, {'product_id': 1, 'quantity': 2, 'price_unit': 100})\n"
        "    ]\n"
        "})\n"
        "# Print all lines on the order, including the new one.\n"
        "print(order.order_line.read())",
    },
]


class UserFacingError(Exception):
    pass


class SQLLogger:
    def __init__(self) -> None:
        self.entries: list[dict[str, Any]] = []

    def log(self, sql: str, params: tuple[Any, ...] | list[Any] = ()) -> None:
        self.entries.append({"sql": sql, "params": list(params)})


class Database:
    def __init__(self, path: Path, logger: SQLLogger | None = None) -> None:
        self.path = path
        self.logger = logger or SQLLogger()
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")

    def execute(self, sql: str, params: tuple[Any, ...] | list[Any] = ()) -> sqlite3.Cursor:
        self.logger.log(sql, params)
        try:
            return self.conn.execute(sql, params)
        except sqlite3.IntegrityError as exc:
            raise UserFacingError(self._friendly_integrity_error(str(exc))) from exc

    def executemany(self, sql: str, rows: list[tuple[Any, ...]]) -> sqlite3.Cursor:
        self.logger.log(sql, rows)
        try:
            return self.conn.executemany(sql, rows)
        except sqlite3.IntegrityError as exc:
            raise UserFacingError(self._friendly_integrity_error(str(exc))) from exc

    def commit(self) -> None:
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def _friendly_integrity_error(self, message: str) -> str:
        if "product_product.default_code" in message:
            return "Constraint error: Product internal reference must be unique."
        if "sale_order.name" in message:
            return "Constraint error: Sale order name must be unique."
        return f"Database constraint error: {message}"


class Env:
    def __init__(self, db: Database) -> None:
        self.db = db

    def __getitem__(self, model_name: str) -> "Model":
        if model_name not in MODELS:
            raise UserFacingError(f"Unknown model: {model_name}")
        return Model(self, MODELS[model_name])


class Model:
    def __init__(self, env: Env, meta: ModelMeta) -> None:
        self.env = env
        self.meta = meta

    def browse(self, ids: int | list[int] | tuple[int, ...]) -> "Recordset":
        if isinstance(ids, int):
            ids = [ids]
        return Recordset(self.env, self.meta, list(dict.fromkeys(ids)))

    def search(
        self,
        domain: list[tuple[str, str, Any]] | None = None,
        limit: int | None = None,
        order: str | None = None,
    ) -> "Recordset":
        where, params = domain_to_sql(self.meta, domain or [])
        order_sql = order_to_sql(self.meta, order)
        limit_sql = " LIMIT ?" if limit is not None else ""
        if limit is not None:
            params.append(limit)
        sql = f"SELECT id FROM {self.meta.table}{where}{order_sql}{limit_sql}"
        ids = [row["id"] for row in self.env.db.execute(sql, params).fetchall()]
        return Recordset(self.env, self.meta, ids)

    def create(self, vals: dict[str, Any]) -> "Recordset":
        return Recordset(self.env, self.meta, []).create(vals)

    def search_read(self, domain: list[tuple[str, str, Any]] | None = None, fields: list[str] | None = None) -> list[dict[str, Any]]:
        return self.search(domain or []).read(fields)

    def search_count(self, domain: list[tuple[str, str, Any]] | None = None) -> int:
        where, params = domain_to_sql(self.meta, domain or [])
        row = self.env.db.execute(f"SELECT COUNT(*) AS count FROM {self.meta.table}{where}", params).fetchone()
        return row["count"]

    def name_search(
        self,
        name: str = "",
        args: list[tuple[str, str, Any]] | None = None,
        operator: str = "ilike",
        limit: int = 100,
    ) -> list[tuple[int, str]]:
        domain = list(args or [])
        if name:
            domain.append(("name", operator, name))
        return self.search(domain, limit=limit).name_get()


class Record:
    def __init__(self, recordset: "Recordset", record_id: int) -> None:
        self._recordset = recordset.browse([record_id])
        self.id = record_id

    def __getattr__(self, name: str) -> Any:
        return getattr(self._recordset, name)

    def __repr__(self) -> str:
        return f"<{self._recordset.meta.name}({self.id})>"


class Recordset:
    def __init__(self, env: Env, meta: ModelMeta, ids: list[int]) -> None:
        self.env = env
        self.meta = meta
        self.ids = list(dict.fromkeys(ids))

    def __bool__(self) -> bool:
        return bool(self.ids)

    def __len__(self) -> int:
        return len(self.ids)

    def __iter__(self):
        for record_id in self.ids:
            yield Record(self, record_id)

    def __repr__(self) -> str:
        return f"{self.meta.name}{tuple(self.ids)}"

    def __getattr__(self, name: str) -> Any:
        if name not in self.meta.fields:
            raise AttributeError(name)
        field = self.meta.fields[name]
        if field.type in {"char", "float", "integer"}:
            self.ensure_one()
            row = self._fetch_row(self.ids[0])
            return row[name]
        if field.type == "many2one":
            self.ensure_one()
            row = self._fetch_row(self.ids[0])
            related_id = row[name]
            return self.env[field.relation].browse(related_id) if related_id else self.env[field.relation].browse([])
        if field.type == "one2many":
            self.ensure_one()
            related = MODELS[field.relation]
            ids = [
                row["id"]
                for row in self.env.db.execute(
                    f"SELECT id FROM {related.table} WHERE {field.inverse} = ? ORDER BY id", (self.ids[0],)
                ).fetchall()
            ]
            return Recordset(self.env, related, ids)
        if field.type == "many2many":
            self.ensure_one()
            rows = self.env.db.execute(
                f"SELECT {field.column2} AS id FROM {field.relation_table} WHERE {field.column1} = ? ORDER BY {field.column2}",
                (self.ids[0],),
            ).fetchall()
            return self.env[field.relation].browse([row["id"] for row in rows])
        raise AttributeError(name)

    def browse(self, ids: list[int]) -> "Recordset":
        return Recordset(self.env, self.meta, ids)

    def limit(self, count: int) -> "Recordset":
        return self.browse(self.ids[:count])

    def ensure_one(self) -> "Recordset":
        if len(self.ids) != 1:
            raise UserFacingError(f"Expected one record in {self.meta.name}, got {len(self.ids)}.")
        return self

    def exists(self) -> "Recordset":
        if not self.ids:
            return self.browse([])
        placeholders = ",".join("?" for _ in self.ids)
        rows = self.env.db.execute(f"SELECT id FROM {self.meta.table} WHERE id IN ({placeholders})", self.ids).fetchall()
        existing = {row["id"] for row in rows}
        return self.browse([record_id for record_id in self.ids if record_id in existing])

    def read(self, fields: list[str] | None = None) -> list[dict[str, Any]]:
        fields = fields or [name for name, field in self.meta.fields.items() if field.type != "one2many"]
        return [self._read_one(record_id, fields) for record_id in self.exists().ids]

    def search_read(self, domain: list[tuple[str, str, Any]] | None = None, fields: list[str] | None = None) -> list[dict[str, Any]]:
        return Model(self.env, self.meta).search_read(domain or [], fields)

    def search_count(self, domain: list[tuple[str, str, Any]] | None = None) -> int:
        return Model(self.env, self.meta).search_count(domain or [])

    def create(self, vals: dict[str, Any]) -> "Recordset":
        vals = dict(vals)
        relational = self._pop_relational_values(vals)
        columns = list(vals.keys())
        params = [vals[column] for column in columns]
        if columns:
            placeholders = ",".join("?" for _ in columns)
            sql = f"INSERT INTO {self.meta.table} ({','.join(columns)}) VALUES ({placeholders})"
            cursor = self.env.db.execute(sql, params)
        else:
            cursor = self.env.db.execute(f"INSERT INTO {self.meta.table} DEFAULT VALUES")
        record = self.browse([cursor.lastrowid])
        record._apply_relational_values(relational)
        self.env.db.commit()
        return record

    def write(self, vals: dict[str, Any]) -> bool:
        vals = dict(vals)
        relational = self._pop_relational_values(vals)
        if vals and self.ids:
            assignments = ", ".join(f"{column} = ?" for column in vals)
            params = list(vals.values())
            for record_id in self.ids:
                self.env.db.execute(f"UPDATE {self.meta.table} SET {assignments} WHERE id = ?", params + [record_id])
        self._apply_relational_values(relational)
        self.env.db.commit()
        return True

    def unlink(self) -> bool:
        for record_id in self.ids:
            for meta in MODELS.values():
                for field in meta.fields.values():
                    if field.type == "many2many" and field.relation_table:
                        self.env.db.execute(
                            f"DELETE FROM {field.relation_table} WHERE ({field.column1} = ? AND ? = ?) OR ({field.column2} = ? AND ? = ?)",
                            (record_id, meta.name, self.meta.name, record_id, field.relation, self.meta.name),
                        )
            self.env.db.execute(f"DELETE FROM {self.meta.table} WHERE id = ?", (record_id,))
        self.env.db.commit()
        return True

    def mapped(self, field_name: str) -> list[Any] | "Recordset":
        values = [getattr(record, field_name) for record in self]
        recordsets = [value for value in values if isinstance(value, Recordset)]
        if recordsets and len(recordsets) == len(values):
            ids: list[int] = []
            meta = recordsets[0].meta
            for value in recordsets:
                ids.extend(value.ids)
            return Recordset(self.env, meta, ids)
        return values

    def filtered(self, func: Callable[[Record], bool]) -> "Recordset":
        return self.browse([record.id for record in self if func(record)])

    def sorted(self, key: Callable[[Record], Any] | None = None, reverse: bool = False) -> "Recordset":
        return self.browse([record.id for record in sorted(list(self), key=key, reverse=reverse)])

    def copy(self, default: dict[str, Any] | None = None) -> "Recordset":
        self.ensure_one()
        data = self.read()[0]
        data.pop("id", None)
        for name, field in self.meta.fields.items():
            if field.type == "many2many":
                data.pop(name, None)
        data.update(default or {})
        new_record = self.create(data)
        for name, field in self.meta.fields.items():
            if field.type == "many2many":
                related_ids = getattr(self, name).ids
                if related_ids:
                    new_record.write({name: [(6, 0, related_ids)]})
        return new_record

    def name_get(self) -> list[tuple[int, str]]:
        result = []
        for row in self.read(["id", "name"] if "name" in self.meta.fields else ["id"]):
            result.append((row["id"], row.get("name", f"{self.meta.name},{row['id']}")))
        return result

    def _fetch_row(self, record_id: int) -> sqlite3.Row:
        row = self.env.db.execute(f"SELECT * FROM {self.meta.table} WHERE id = ?", (record_id,)).fetchone()
        if not row:
            raise UserFacingError(f"Record {self.meta.name}({record_id}) does not exist.")
        return row

    def _read_one(self, record_id: int, fields: list[str]) -> dict[str, Any]:
        data: dict[str, Any] = {}
        row = self._fetch_row(record_id)
        for name in fields:
            field = self.meta.fields[name]
            if field.type in {"char", "float", "integer", "many2one"}:
                data[name] = row[name]
            elif field.type in {"one2many", "many2many"}:
                data[name] = getattr(self.browse([record_id]), name).ids
        return data

    def _pop_relational_values(self, vals: dict[str, Any]) -> dict[str, Any]:
        relational = {}
        for name in list(vals):
            field = self.meta.fields.get(name)
            if field and field.type in {"one2many", "many2many"}:
                relational[name] = vals.pop(name)
        return relational

    def _apply_relational_values(self, relational: dict[str, Any]) -> None:
        for name, commands in relational.items():
            field = self.meta.fields[name]
            for record_id in self.ids:
                apply_commands(self.env, self.meta, record_id, field, commands)


def domain_to_sql(meta: ModelMeta, domain: list[tuple[str, str, Any]]) -> tuple[str, list[Any]]:
    if not domain:
        return "", []
    clauses = []
    params: list[Any] = []
    for field_name, operator, value in domain:
        if field_name not in meta.fields:
            raise UserFacingError(f"Unknown field in domain: {meta.name}.{field_name}")
        field = meta.fields[field_name]
        if field.type in {"one2many", "many2many"}:
            raise UserFacingError("This playground supports domains on stored scalar and many2one fields.")
        if operator in {"=", "!=", ">", ">=", "<", "<="}:
            clauses.append(f"{field_name} {operator} ?")
            params.append(value)
        elif operator in {"like", "ilike"}:
            clauses.append(f"LOWER({field_name}) LIKE LOWER(?)")
            params.append(f"%{value}%")
        elif operator == "in":
            placeholders = ",".join("?" for _ in value)
            clauses.append(f"{field_name} IN ({placeholders})")
            params.extend(value)
        else:
            raise UserFacingError(f"Unsupported domain operator: {operator}")
    return " WHERE " + " AND ".join(clauses), params


def order_to_sql(meta: ModelMeta, order: str | None) -> str:
    if not order:
        return " ORDER BY id"
    parts = []
    for item in order.split(","):
        tokens = item.strip().split()
        if not tokens:
            continue
        field_name = tokens[0]
        direction = tokens[1].upper() if len(tokens) > 1 else "ASC"
        if field_name not in meta.fields:
            raise UserFacingError(f"Unknown order field: {meta.name}.{field_name}")
        if meta.fields[field_name].type in {"one2many", "many2many"}:
            raise UserFacingError("This playground supports ordering on stored scalar and many2one fields.")
        if direction not in {"ASC", "DESC"}:
            raise UserFacingError("Order direction must be ASC or DESC.")
        parts.append(f"{field_name} {direction}")
    return " ORDER BY " + ", ".join(parts or ["id"])


def apply_commands(env: Env, owner_meta: ModelMeta, owner_id: int, field: Field, commands: list[tuple[Any, ...]]) -> None:
    if field.type == "many2many":
        for command in commands:
            code = command[0]
            if code == 0:
                related = env[field.relation].create(command[2])
                env.db.execute(
                    f"INSERT OR IGNORE INTO {field.relation_table} ({field.column1}, {field.column2}) VALUES (?, ?)",
                    (owner_id, related.ids[0]),
                )
            elif code == 1:
                env[field.relation].browse(command[1]).write(command[2])
            elif code == 2:
                env[field.relation].browse(command[1]).unlink()
            elif code == 3:
                env.db.execute(
                    f"DELETE FROM {field.relation_table} WHERE {field.column1} = ? AND {field.column2} = ?",
                    (owner_id, command[1]),
                )
            elif code == 4:
                env.db.execute(
                    f"INSERT OR IGNORE INTO {field.relation_table} ({field.column1}, {field.column2}) VALUES (?, ?)",
                    (owner_id, command[1]),
                )
            elif code == 5:
                env.db.execute(f"DELETE FROM {field.relation_table} WHERE {field.column1} = ?", (owner_id,))
            elif code == 6:
                env.db.execute(f"DELETE FROM {field.relation_table} WHERE {field.column1} = ?", (owner_id,))
                rows = [(owner_id, related_id) for related_id in command[2]]
                if rows:
                    env.db.executemany(
                        f"INSERT OR IGNORE INTO {field.relation_table} ({field.column1}, {field.column2}) VALUES (?, ?)",
                        rows,
                    )
            else:
                raise UserFacingError(f"Unsupported command tuple: {command}")
    elif field.type == "one2many":
        related_model = env[field.relation]
        inverse = field.inverse
        for command in commands:
            code = command[0]
            if code == 0:
                vals = dict(command[2])
                vals[inverse] = owner_id
                related_model.create(vals)
            elif code == 1:
                related_model.browse(command[1]).write(command[2])
            elif code == 2:
                related_model.browse(command[1]).unlink()
            elif code == 3:
                related_model.browse(command[1]).write({inverse: None})
            elif code == 4:
                related_model.browse(command[1]).write({inverse: owner_id})
            elif code == 5:
                for record in getattr(Recordset(env, owner_meta, [owner_id]), field.name):
                    related_model.browse(record.id).write({inverse: None})
            elif code == 6:
                current = getattr(Recordset(env, owner_meta, [owner_id]), field.name)
                for record in current:
                    related_model.browse(record.id).write({inverse: None})
                for related_id in command[2]:
                    related_model.browse(related_id).write({inverse: owner_id})
            else:
                raise UserFacingError(f"Unsupported command tuple: {command}")


def init_db() -> None:
    db = Database(DB_PATH)
    db.execute(
        "CREATE TABLE IF NOT EXISTS product_category (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)"
    )
    db.execute(
        "CREATE TABLE IF NOT EXISTS product_tag (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)"
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS product_product (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            default_code TEXT UNIQUE,
            list_price REAL DEFAULT 0,
            categ_id INTEGER REFERENCES product_category(id) ON DELETE SET NULL
        )
        """
    )
    db.execute(
        "CREATE TABLE IF NOT EXISTS res_partner (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT)"
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS sale_order (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            partner_id INTEGER REFERENCES res_partner(id) ON DELETE SET NULL
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS sale_order_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER REFERENCES sale_order(id) ON DELETE SET NULL,
            product_id INTEGER REFERENCES product_product(id) ON DELETE SET NULL,
            quantity REAL DEFAULT 0,
            price_unit REAL DEFAULT 0
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS product_product_tag_rel (
            product_id INTEGER NOT NULL REFERENCES product_product(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES product_tag(id) ON DELETE CASCADE,
            PRIMARY KEY (product_id, tag_id)
        )
        """
    )
    existing = db.execute("SELECT COUNT(*) AS count FROM product_category").fetchone()["count"]
    if not existing:
        seed(db)
    db.commit()
    db.close()


def seed(db: Database) -> None:
    db.executemany("INSERT INTO product_category (name) VALUES (?)", [("Electronics",), ("Furniture",), ("Services",)])
    db.executemany("INSERT INTO product_tag (name) VALUES (?)", [("Featured",), ("Discountable",), ("Fragile",)])
    db.executemany(
        "INSERT INTO product_product (name, default_code, list_price, categ_id) VALUES (?, ?, ?, ?)",
        [
            ("Laptop", "LAP001", 1200, 1),
            ("Desk", "DSK001", 350, 2),
            ("Consulting Hour", "SRV001", 100, 3),
            ("Monitor", "MON001", 250, 1),
        ],
    )
    db.executemany("INSERT INTO product_product_tag_rel (product_id, tag_id) VALUES (?, ?)", [(1, 1), (1, 3), (2, 2), (4, 1)])
    db.executemany(
        "INSERT INTO res_partner (name, email) VALUES (?, ?)",
        [("Azure Interior", "hello@azure.example"), ("Deco Addict", "sales@deco.example")],
    )
    db.executemany("INSERT INTO sale_order (name, partner_id) VALUES (?, ?)", [("SO001", 1), ("SO002", 2)])
    db.executemany(
        "INSERT INTO sale_order_line (order_id, product_id, quantity, price_unit) VALUES (?, ?, ?, ?)",
        [(1, 1, 1, 1200), (1, 4, 2, 250), (2, 2, 1, 350)],
    )


def snapshot(db: Database) -> dict[str, Any]:
    tables = [
        row["name"]
        for row in db.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).fetchall()
    ]
    result = {}
    for table in tables:
        rows = [dict(row) for row in db.conn.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()]
        columns = [dict(row) for row in db.conn.execute(f"PRAGMA table_info({table})").fetchall()]
        result[table] = {"columns": columns, "rows": rows}
    return result


def snapshot_diff(before: dict[str, Any], after: dict[str, Any]) -> list[dict[str, Any]]:
    changes = []
    for table in sorted(set(before) | set(after)):
        before_rows = {row["id"]: row for row in before.get(table, {}).get("rows", []) if "id" in row}
        after_rows = {row["id"]: row for row in after.get(table, {}).get("rows", []) if "id" in row}
        table_changes = {"table": table, "created": [], "deleted": [], "updated": []}

        for row_id in sorted(after_rows.keys() - before_rows.keys()):
            table_changes["created"].append(after_rows[row_id])

        for row_id in sorted(before_rows.keys() - after_rows.keys()):
            table_changes["deleted"].append(before_rows[row_id])

        for row_id in sorted(before_rows.keys() & after_rows.keys()):
            before_row = before_rows[row_id]
            after_row = after_rows[row_id]
            field_changes = {
                field: {"before": before_row.get(field), "after": after_row.get(field)}
                for field in sorted(set(before_row) | set(after_row))
                if before_row.get(field) != after_row.get(field)
            }
            if field_changes:
                table_changes["updated"].append(
                    {
                        "id": row_id,
                        "before": before_row,
                        "after": after_row,
                        "fields": field_changes,
                    }
                )

        if table_changes["created"] or table_changes["deleted"] or table_changes["updated"]:
            changes.append(table_changes)
    return changes


def model_metadata() -> list[dict[str, Any]]:
    data = []
    for meta in MODELS.values():
        data.append(
            {
                "name": meta.name,
                "table": meta.table,
                "fields": [
                    {
                        "name": field.name,
                        "type": field.type,
                        "relation": field.relation,
                        "inverse": field.inverse,
                        "relation_table": field.relation_table,
                    }
                    for field in meta.fields.values()
                ],
                "constraints": [
                    {"name": name, "definition": definition, "message": message}
                    for name, definition, message in meta.sql_constraints
                ],
            }
        )
    return data


def execute_code(code: str) -> dict[str, Any]:
    logger = SQLLogger()
    db = Database(DB_PATH, logger)
    env = Env(db)
    stdout = io.StringIO()
    pretty_output: list[dict[str, Any]] = []
    before = snapshot(db)

    def normalize_print_value(value: Any) -> Any:
        if isinstance(value, Recordset):
            return {
                "type": "recordset",
                "model": value.meta.name,
                "ids": value.ids,
                "rows": normalize_print_value(value.read()),
            }
        if isinstance(value, Record):
            return {
                "type": "record",
                "model": value.recordset.meta.name,
                "id": value.id,
                "row": normalize_print_value(value.recordset.browse([value.id]).read()[0]),
            }
        if isinstance(value, dict):
            return {str(key): normalize_print_value(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [normalize_print_value(item) for item in value]
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        return repr(value)

    def playground_print(*args: Any, sep: str = " ", end: str = "\n", **kwargs: Any) -> None:
        print(*args, sep=sep, end=end, **kwargs)
        pretty_output.append(
            {
                "args": [normalize_print_value(arg) for arg in args],
                "text": sep.join(str(arg) for arg in args) + end,
            }
        )

    globals_dict = {
        "__builtins__": {
            "print": playground_print,
            "len": len,
            "sum": sum,
            "min": min,
            "max": max,
            "sorted": sorted,
            "bool": bool,
            "list": list,
            "dict": dict,
            "tuple": tuple,
        },
        "env": env,
    }
    status = "ok"
    error = None
    with contextlib.redirect_stdout(stdout):
        try:
            exec(code, globals_dict, {})
            db.commit()
        except Exception as exc:
            db.conn.rollback()
            status = "error"
            error = str(exc)
            print(traceback.format_exc(limit=6))
    after = snapshot(db)
    data = {
        "status": status,
        "output": stdout.getvalue(),
        "pretty": pretty_output,
        "error": error,
        "sql": logger.entries,
        "db": after,
        "before_db": before,
        "changes": snapshot_diff(before, after) if status == "ok" else [],
    }
    db.close()
    return data


app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html", examples=EXAMPLES)


@app.get("/api/state")
def state():
    db = Database(DB_PATH)
    data = {"db": snapshot(db), "models": model_metadata(), "examples": EXAMPLES}
    db.close()
    return jsonify(data)


@app.post("/api/run")
def run_code():
    payload = request.get_json(force=True)
    return jsonify(execute_code(payload.get("code", "")))


if __name__ == "__main__":
    init_db()
    app.run(debug=True, host="127.0.0.1", port=5000)
