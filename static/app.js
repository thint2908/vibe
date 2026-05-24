const editor = document.querySelector("#codeEditor");
const codeHighlight = document.querySelector("#codeHighlight code");
const codeHighlightFrame = document.querySelector("#codeHighlight");
const output = document.querySelector("#output");
const prettyOutput = document.querySelector("#prettyOutput");
const sqlLog = document.querySelector("#sqlLog");
const statusBadge = document.querySelector("#statusBadge");
const tableList = document.querySelector("#tableList");
const tableRows = document.querySelector("#tableRows");
const modelsView = document.querySelector("#modelsView");
const themeToggle = document.querySelector("#themeToggle");

let state = { db: {}, models: [] };
let activeTable = null;

const selectExamples = {
  search_all: `# env['product.product'] means: open the Product model.
# search([]) means: search with no filter, so return all products.
products = env['product.product'].search([])
print(products)
# products is a recordset: a group of product records.
# read([...]) changes records into dictionaries and prints only these fields.
print(products.read(['name', 'default_code', 'list_price']))`,

  search_domain: `# A domain is a list of conditions used to filter records.
# Each condition looks like: (field_name, operator, value).
# This condition means: categ_id equals 1.
products = env['product.product'].search([('categ_id', '=', 1)])
# Only products in category id 1 are printed.
print(products.read(['name', 'list_price', 'categ_id']))`,

  search_operators: `# Domain operators compare a field with a value.
# '>=' means greater than or equal to.
# This finds products with list_price at least 250.
expensive = env['product.product'].search([('list_price', '>=', 250)])
print('>= 250:', expensive.read(['name', 'list_price']))

# 'ilike' means case-insensitive text search.
# This finds product names containing 'lap', like 'Laptop'.
name_match = env['product.product'].search([('name', 'ilike', 'lap')])
print('name ilike lap:', name_match.read(['name']))`,

  search_order_limit: `# order='list_price desc' sorts products by price, highest first.
# limit=2 keeps only the first two records after sorting.
products = env['product.product'].search([], order='list_price desc', limit=2)
# This prints the two most expensive products.
print(products.read(['name', 'list_price']))`,

  filtered: `# First get all products from the database.
products = env['product.product'].search([])
# filtered(...) runs Python code on each product in the recordset.
# Keep only products where list_price is greater than or equal to 300.
premium = products.filtered(lambda p: p.list_price >= 300)
print(premium.read(['name', 'list_price']))`,

  mapped: `# First get all sale orders.
orders = env['sale.order'].search([])
# mapped('partner_id') takes the partner_id field from each order.
# Because partner_id is Many2one, the result is partner records.
partners = orders.mapped('partner_id')
# name_get() prints each partner as (id, display name).
print(partners.name_get())`,

  sorted: `# First get all products.
products = env['product.product'].search([])
# sorted(key=...) reorders the recordset in Python.
# The key says: sort using each product's list_price.
cheap_to_expensive = products.sorted(key=lambda p: p.list_price)
print(cheap_to_expensive.read(['name', 'list_price']))`,

  browse: `# browse(1) means: create a recordset for the product with id 1.
# It does not search by name; it uses the exact database id.
product = env['product.product'].browse(1)
print(product)
# read([...]) prints selected fields for that one product.
print(product.read(['name', 'default_code', 'list_price']))`,

  create: `# create({...}) inserts a new product row into the database.
# The dictionary keys are field names. The values are what we save.
product = env['product.product'].create({
    'name': 'Keyboard',
    'default_code': 'KEY001',
    'list_price': 45,
    'categ_id': 1,
})
# create() returns the new product as a recordset, so we can read it.
print(product.read())`,

  write: `# First find the product named Laptop.
product = env['product.product'].search([('name', '=', 'Laptop')])
# write({...}) updates fields on every record in product.
# Here it changes the price and category.
product.write({'list_price': 1150, 'categ_id': 1})
print(product.read(['name', 'list_price', 'categ_id']))`,

  unlink: `# Create a temporary product so this example can delete it safely.
product = env['product.product'].create({'name': 'Delete Me', 'default_code': 'DEL001'})
# Before deleting, exists() returns the product because it is in the database.
print('before:', product.exists().read())
# unlink() deletes the record from the database.
product.unlink()
# After deleting, product still has the old id in memory.
# exists() checks the database and returns an empty recordset.
print('after:', product.exists().read())`,

  m2o: `# First find sale order SO001.
order = env['sale.order'].search([('name', '=', 'SO001')])
# partner_id is Many2one: one order has one customer.
# order.partner_id gives the related customer record.
print(order.partner_id.name)

# order_line is One2many: one order can have many lines.
# Sort the lines by id and keep only the first line.
line = order.order_line.sorted(key=lambda line: line.id).limit(1)
# product_id is Many2one: one line points to one product.
print(line.product_id.name)`,

  o2m: `# First find sale order SO001.
order = env['sale.order'].search([('name', '=', 'SO001')])
# order.order_line returns all sale order lines that belong to this order.
# The for loop reads one line at a time.
for line in order.order_line:
    # For each line, print product name, quantity, and unit price.
    print(line.product_id.name, line.quantity, line.price_unit)`,

  revenue: `# Get all customers.
partners = env['res.partner'].search([])
# Loop over one customer at a time.
for partner in partners:
    # Find this customer's sale orders.
    orders = env['sale.order'].search([('partner_id', '=', partner.id)])
    total = 0
    # Add every order line amount into total.
    for order in orders:
        for line in order.order_line:
            # Line amount = quantity multiplied by price_unit.
            total = total + line.quantity * line.price_unit
    print(partner.name, total)`,

  inventory: `# Get all products.
products = env['product.product'].search([])
# Loop over one product at a time.
for product in products:
    # Find sale order lines that use this product.
    lines = env['sale.order.line'].search([('product_id', '=', product.id)])
    # sum(...) adds the quantity from every matching line.
    sold_qty = sum(line.quantity for line in lines)
    print(product.name, 'sold quantity:', sold_qty)`,

  search_count: `# search_count(domain) counts matching records.
# It does not return the records themselves, only a number.
# This counts products with list_price greater than or equal to 250.
count = env['product.product'].search_count([('list_price', '>=', 250)])
print('Products with price >= 250:', count)`,
};

document.querySelector("#runBtn").addEventListener("click", runCode);
document.querySelector("#resetBtn").addEventListener("click", loadState);
themeToggle.addEventListener("click", toggleTheme);

document.querySelectorAll(".example-btn").forEach((button) => {
  button.addEventListener("click", () => {
    editor.value = button.dataset.code;
    syncCodeHighlight();
    editor.focus();
  });
});

function loadExample(value) {
  if (!value || !selectExamples[value]) return;
  editor.value = selectExamples[value];
  syncCodeHighlight();
  editor.focus();
}

window.loadExample = loadExample;

editor.addEventListener("input", syncCodeHighlight);
editor.addEventListener("scroll", syncCodeScroll);

function syncCodeHighlight() {
  codeHighlight.innerHTML = highlightPython(editor.value);
  syncCodeScroll();
}

function syncCodeScroll() {
  codeHighlightFrame.scrollTop = editor.scrollTop;
  codeHighlightFrame.scrollLeft = editor.scrollLeft;
}

function highlightPython(source) {
  const keywords = new Set([
    "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
    "elif", "else", "except", "False", "finally", "for", "from", "global", "if", "import",
    "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass", "raise", "return",
    "True", "try", "while", "with", "yield",
  ]);
  const builtins = new Set([
    "all", "any", "bool", "dict", "enumerate", "float", "int", "len", "list", "max",
    "min", "print", "range", "repr", "round", "set", "sorted", "str", "sum", "tuple",
  ]);
  let html = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "#") {
      const end = source.indexOf("\n", index);
      const token = source.slice(index, end === -1 ? source.length : end);
      html += wrapToken("comment", token);
      index += token.length;
      continue;
    }

    if (char === "\"" || char === "'") {
      const token = readPythonString(source, index);
      html += wrapToken("string", token);
      index += token.length;
      continue;
    }

    if (char === "@" && /[A-Za-z_]/.test(next || "")) {
      const match = source.slice(index).match(/^@[A-Za-z_][A-Za-z0-9_.]*/);
      html += wrapToken("decorator", match[0]);
      index += match[0].length;
      continue;
    }

    if (/\d/.test(char)) {
      const match = source.slice(index).match(/^\d+(?:\.\d+)?/);
      html += wrapToken("number", match[0]);
      index += match[0].length;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const match = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      const word = match[0];
      const afterWord = source.slice(index + word.length).match(/^\s*\(/);
      const type = keywords.has(word)
        ? "keyword"
        : builtins.has(word)
          ? "builtin"
          : afterWord
            ? "function"
            : "";
      html += type ? wrapToken(type, word) : escapeHtml(word);
      index += word.length;
      continue;
    }

    if (/[-+*/%=!<>|&:.,()[\]{}]/.test(char)) {
      const type = /[-+*/%=!<>|&]/.test(char) ? "operator" : "punctuation";
      html += wrapToken(type, char);
      index += 1;
      continue;
    }

    html += escapeHtml(char);
    index += 1;
  }

  return html || "\n";
}

function readPythonString(source, start) {
  const quote = source[start];
  const triple = source.slice(start, start + 3) === quote.repeat(3);
  let index = start + (triple ? 3 : 1);

  while (index < source.length) {
    if (source[index] === "\\" && !triple) {
      index += 2;
      continue;
    }
    if (triple && source.slice(index, index + 3) === quote.repeat(3)) {
      return source.slice(start, index + 3);
    }
    if (!triple && source[index] === quote) {
      return source.slice(start, index + 1);
    }
    index += 1;
  }

  return source.slice(start);
}

function wrapToken(type, value) {
  return `<span class="token-${type}">${escapeHtml(value)}</span>`;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "dark" ? "Light Theme" : "Dark Theme";
  localStorage.setItem("odoo-playground-theme", theme);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || "light";
  applyTheme(current === "dark" ? "light" : "dark");
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#tab-${button.dataset.tab}`).classList.add("active");
  });
});

async function loadState() {
  const response = await fetch("/api/state");
  state = await response.json();
  activeTable = activeTable || Object.keys(state.db)[0];
  renderDb();
  renderModels();
}

async function runCode() {
  statusBadge.textContent = "Running";
  statusBadge.className = "";
  output.textContent = "";
  prettyOutput.className = "pretty-output empty";
  prettyOutput.textContent = "Running...";
  const response = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: editor.value }),
  });
  const data = await response.json();
  state.db = data.db;
  statusBadge.textContent = data.status === "ok" ? "OK" : "Error";
  statusBadge.className = data.status;
  output.textContent = formatOutput(data);
  renderPrettyOutput(data);
  sqlLog.textContent = data.sql.map((entry) => `${entry.sql}\nparams: ${JSON.stringify(entry.params)}`).join("\n\n");
  renderDb();
}

function formatOutput(data) {
  const parts = [];
  if (data.output) parts.push(data.output.trimEnd());
  if (data.error) parts.push(`Friendly error: ${data.error}`);
  if (!parts.length) parts.push("(No printed output)");
  return parts.join("\n\n");
}

function renderPrettyOutput(data) {
  const items = data.pretty || [];
  if (data.error) {
    prettyOutput.className = "pretty-output";
    prettyOutput.innerHTML = `<div class="pretty-error">${escapeHtml(data.error)}</div>`;
    return;
  }
  if (!items.length) {
    prettyOutput.className = "pretty-output empty";
    prettyOutput.textContent = "(No printed output)";
    return;
  }
  prettyOutput.className = "pretty-output";
  prettyOutput.innerHTML = items.map(renderPrettyItem).join("");
}

function renderPrettyItem(item, index) {
  const args = item.args || [];
  const firstArg = args[0];
  const hasLabel = args.length > 1 && typeof firstArg === "string" && firstArg.length < 80;
  const title = hasLabel ? firstArg : `Print ${index + 1}`;
  const values = hasLabel ? args.slice(1) : args;
  return `
    <article class="pretty-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="pretty-card-body">
        ${values.length ? values.map(renderPrettyValue).join("") : `<p class="pretty-text">${escapeHtml(item.text || "")}</p>`}
      </div>
    </article>
  `;
}

function renderPrettyValue(value) {
  if (value && value.type === "recordset") {
    return `
      <div class="pretty-record-title">${escapeHtml(value.model)} <span>${escapeHtml(value.ids.length)} records</span></div>
      ${renderPrettyValue(value.rows)}
    `;
  }
  if (value && value.type === "record") {
    return `
      <div class="pretty-record-title">${escapeHtml(value.model)},${escapeHtml(value.id)}</div>
      ${renderPrettyValue(value.row)}
    `;
  }
  if (Array.isArray(value)) {
    if (!value.length) return `<div class="pretty-empty-list">Empty list</div>`;
    if (value.every(isPlainObject)) return renderPrettyTable(value);
    if (value.every(Array.isArray)) return renderPrettyArrayTable(value);
    return `<div class="pretty-list">${value.map((item) => `<div>${renderPrettyValue(item)}</div>`).join("")}</div>`;
  }
  if (isPlainObject(value)) {
    return `
      <dl class="pretty-kv">
        ${Object.entries(value)
          .map(([key, item]) => `<dt>${escapeHtml(key)}</dt><dd>${renderPrettyValue(item)}</dd>`)
          .join("")}
      </dl>
    `;
  }
  return `<span class="pretty-scalar">${escapeHtml(formatScalar(value))}</span>`;
}

function renderPrettyTable(rows) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return `
    <div class="pretty-table-wrap">
      <table class="pretty-table">
        <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows
            .map((row) => `<tr>${columns.map((column) => `<td>${renderPrettyCell(row[column])}</td>`).join("")}</tr>`)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPrettyArrayTable(rows) {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const columns = Array.from({ length: columnCount }, (_, index) => `Value ${index + 1}`);
  return `
    <div class="pretty-table-wrap">
      <table class="pretty-table">
        <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows
            .map((row) => `<tr>${columns.map((_, index) => `<td>${renderPrettyCell(row[index])}</td>`).join("")}</tr>`)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPrettyCell(value) {
  if (Array.isArray(value)) return escapeHtml(`[${value.map(formatScalar).join(", ")}]`);
  if (isPlainObject(value)) return renderPrettyValue(value);
  return escapeHtml(formatScalar(value));
}

function formatScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "True" : "False";
  return String(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !value.type;
}

function renderDb() {
  const tables = Object.keys(state.db);
  if (!tables.includes(activeTable)) activeTable = tables[0];
  tableList.innerHTML = "";
  tables.forEach((table) => {
    const button = document.createElement("button");
    button.textContent = `${table} (${state.db[table].rows.length})`;
    button.className = table === activeTable ? "active" : "";
    button.addEventListener("click", () => {
      activeTable = table;
      renderDb();
    });
    tableList.appendChild(button);
  });

  const info = state.db[activeTable];
  if (!info) {
    tableRows.textContent = "No tables found.";
    return;
  }
  const columns = info.columns.map((column) => column.name);
  tableRows.innerHTML = `
    <h3>${activeTable}</h3>
    <div class="table-wrap">
      <table>
        <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
        <tbody>
          ${info.rows
            .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderModels() {
  modelsView.innerHTML = state.models
    .map(
      (model) => `
      <article class="model-card">
        <h3>${escapeHtml(model.name)}</h3>
        <p><strong>Table:</strong> ${escapeHtml(model.table)}</p>
        <table>
          <thead><tr><th>Field</th><th>Type</th><th>Relation</th></tr></thead>
          <tbody>
            ${model.fields
              .map((field) => {
                const relation = field.type === "one2many"
                  ? `${field.relation} via ${field.inverse}`
                  : field.type === "many2many"
                    ? `${field.relation} via ${field.relation_table}`
                    : field.relation || "";
                return `<tr><td>${escapeHtml(field.name)}</td><td>${escapeHtml(field.type)}</td><td>${escapeHtml(relation)}</td></tr>`;
              })
              .join("")}
          </tbody>
        </table>
        ${model.constraints
          .map((constraint) => `<div class="constraint">${escapeHtml(constraint.name)}: ${escapeHtml(constraint.message)}</div>`)
          .join("")}
      </article>
    `
    )
    .join("");
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const savedTheme = localStorage.getItem("odoo-playground-theme");
const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
applyTheme(savedTheme || preferredTheme);
syncCodeHighlight();
loadState();
