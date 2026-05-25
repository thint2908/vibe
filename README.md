# Odoo ORM Playground

A local Flask app for learning Odoo-style ORM concepts without running Odoo. It uses Python classes over SQLite to mimic common recordset behavior, relational fields, command tuples, basic domains, constraints, and SQL visibility.

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000`.

The SQLite database is created automatically as `odoo_playground.sqlite3` on first run and seeded with SME-style sample data: categories, tags, a few hundred products and partners, hundreds of sale orders, and thousands of order lines/relations.

Open `http://127.0.0.1:5000/sql` for the SQL playground. It uses the same sample database so you can compare ORM behavior with the SQL underneath it.

## What It Includes

- `env['model.name']`
- `search`, `browse`, `create`, `write`, `unlink`
- `read`, `search_read`, `mapped`, `filtered`, `sorted`
- `ensure_one`, `exists`, `copy`, `name_get`, `name_search`
- many2one, one2many, many2many fields
- Odoo-style command tuples `(0, 0, vals)` through `(6, 0, ids)`
- simulated `_sql_constraints` for unique product `default_code` and sale order `name`
- DB viewer, model metadata, relation diagram, cheatsheet, and SQL log
- SQL playground page with runnable queries, examples, lessons, schema reference, DB viewer, before/after changes, and query history

## Project Structure

```text
.
├── app.py
├── requirements.txt
├── README.md
├── static
│   ├── app.js
│   └── style.css
└── templates
    └── index.html
```

## Safety Note

Code execution is intentionally limited for local learning. The execution environment exposes only `env`, `print`, and a small set of harmless built-ins. It is still a Python execution playground, so do not expose it to a network or run untrusted snippets.
