const editor = document.querySelector("#codeEditor");
const codeHighlight = document.querySelector("#codeHighlight code");
const codeHighlightFrame = document.querySelector("#codeHighlight");
const output = document.querySelector("#output");
const prettyOutput = document.querySelector("#prettyOutput");
const changeSummary = document.querySelector("#changeSummary");
const sqlLog = document.querySelector("#sqlLog");
const statusBadge = document.querySelector("#statusBadge");
const tableList = document.querySelector("#tableList");
const tableRows = document.querySelector("#tableRows");
const modelsView = document.querySelector("#modelsView");
const lessonsView = document.querySelector("#lessonsView");
const themeToggle = document.querySelector("#themeToggle");
const domainModel = document.querySelector("#domainModel");
const domainFields = document.querySelector("#domainFields");
const domainConditions = document.querySelector("#domainConditions");
const domainPreview = document.querySelector("#domainPreview");
const addDomainConditionBtn = document.querySelector("#addDomainConditionBtn");
const buildDomainBtn = document.querySelector("#buildDomainBtn");
const runDomainBtn = document.querySelector("#runDomainBtn");

let state = { db: {}, models: [] };
let activeTable = null;
let domainConditionId = 0;
let tablePages = {};
let lastRunData = null;
let rawTexts = {};
const TABLE_PAGE_SIZE = 25;
const RAW_TEXT_LINES = 24;
const RAW_TEXT_CHARS = 2400;

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

const ormLessons = [
  {
    method: "search",
    explanation: "Find records that match a domain. An empty domain returns every record for the model.",
    code: `products = env['product.product'].search([('list_price', '>=', 250)])
print(products)
print(products.read(['name', 'list_price']))`,
    expected: `product.product(...)
A list of products whose list_price is at least 250.`,
  },
  {
    method: "browse",
    explanation: "Build a recordset from known database IDs. It does not search; it points directly to those IDs.",
    code: `product = env['product.product'].browse(1)
print(product)
print(product.read(['name', 'default_code']))`,
    expected: `product.product(1,)
The product with id 1, usually Laptop in the seed data.`,
  },
  {
    method: "create",
    explanation: "Insert a new row and return the new record as a recordset.",
    code: `product = env['product.product'].create({
    'name': 'Lesson Mouse',
    'default_code': 'LESSON-MOUSE',
    'list_price': 25,
    'categ_id': 1,
})
print(product.read(['name', 'default_code', 'list_price']))`,
    expected: `A new product row appears in product_product.
Before / After shows a created row.`,
  },
  {
    method: "write",
    explanation: "Update fields on every record in the recordset.",
    code: `product = env['product.product'].search([('name', '=', 'Laptop')])
product.write({'list_price': 1150})
print(product.read(['name', 'list_price']))`,
    expected: `Laptop list_price changes to 1150.
Before / After shows list_price before and after.`,
  },
  {
    method: "unlink",
    explanation: "Delete records from the database. Use it carefully in real Odoo modules.",
    code: `product = env['product.product'].create({'name': 'Lesson Delete', 'default_code': 'LESSON-DEL'})
print('before:', product.exists().read(['name']))
product.unlink()
print('after:', product.exists().read(['name']))`,
    expected: `before: one temporary product
after: an empty list
Before / After shows created and deleted effects during the snippet.`,
  },
  {
    method: "read",
    explanation: "Convert records into plain dictionaries, optionally limited to selected fields.",
    code: `products = env['product.product'].search([], limit=2)
print(products.read(['name', 'list_price']))`,
    expected: `A list of dictionaries like:
[{'name': 'Laptop', 'list_price': 1200.0}, ...]`,
  },
  {
    method: "search_read",
    explanation: "Shortcut for search(domain).read(fields). Useful for quick list-style data reads.",
    code: `rows = env['product.product'].search_read(
    [('categ_id', '=', 1)],
    ['name', 'list_price']
)
print(rows)`,
    expected: `A list of dictionaries for products in category id 1.`,
  },
  {
    method: "filtered",
    explanation: "Filter an existing recordset in Python using a function or lambda.",
    code: `products = env['product.product'].search([])
premium = products.filtered(lambda product: product.list_price >= 300)
print(premium.read(['name', 'list_price']))`,
    expected: `Only products from the original recordset with list_price >= 300.`,
  },
  {
    method: "mapped",
    explanation: "Collect one field from every record. Relation fields return a merged recordset.",
    code: `orders = env['sale.order'].search([])
partners = orders.mapped('partner_id')
print(partners)
print(partners.name_get())`,
    expected: `A res.partner recordset, then display names for the customers on the orders.`,
  },
  {
    method: "sorted",
    explanation: "Sort a recordset in Python without changing database rows.",
    code: `products = env['product.product'].search([])
ordered = products.sorted(key=lambda product: product.list_price)
print(ordered.read(['name', 'list_price']))`,
    expected: `Products printed from cheapest to most expensive.`,
  },
  {
    method: "exists",
    explanation: "Keep only records that still exist in the database.",
    code: `product = env['product.product'].create({'name': 'Lesson Exists', 'default_code': 'LESSON-EXISTS'})
print(product.exists())
product.unlink()
print(product.exists())`,
    expected: `Before unlink: product.product(id,)
After unlink: product.product()`,
  },
  {
    method: "ensure_one",
    explanation: "Assert that a recordset contains exactly one record. It raises an error for zero or many records.",
    code: `products = env['product.product'].search([])
products.ensure_one()`,
    expected: `Friendly error:
Expected one record in product.product, got the current product count.`,
  },
];

document.querySelector("#runBtn").addEventListener("click", runCode);
document.querySelector("#resetBtn").addEventListener("click", resetState);
themeToggle.addEventListener("click", toggleTheme);
domainModel.addEventListener("change", () => {
  renderDomainConditions();
  updateDomainPreview();
});
domainFields.addEventListener("input", updateDomainPreview);
addDomainConditionBtn.addEventListener("click", () => {
  addDomainCondition();
  updateDomainPreview();
});
buildDomainBtn.addEventListener("click", () => {
  editor.value = buildDomainCode();
  syncCodeHighlight();
  editor.focus();
});
runDomainBtn.addEventListener("click", () => {
  editor.value = buildDomainCode();
  syncCodeHighlight();
  runCode();
});

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
document.addEventListener("click", (event) => {
  const pageButton = event.target.closest("[data-table-page]");
  if (pageButton) {
    tablePages[pageButton.dataset.tablePage] = Number(pageButton.dataset.page);
    if (lastRunData) {
      renderChangeSummary(lastRunData);
      renderPrettyOutput(lastRunData);
    }
    renderDb();
    return;
  }

  const rawToggle = event.target.closest("[data-raw-toggle]");
  if (rawToggle) {
    const element = rawToggle.dataset.rawToggle === "ormSqlLog" ? sqlLog : output;
    element.dataset.expanded = element.dataset.expanded === "true" ? "false" : "true";
    renderRawText(element, rawTexts[rawToggle.dataset.rawToggle] || element.textContent, rawToggle.dataset.rawToggle);
  }
});

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
  renderLessons();
  renderDomainBuilder();
}

async function resetState() {
  const response = await fetch("/api/reset", { method: "POST" });
  state = await response.json();
  activeTable = Object.keys(state.db)[0];
  renderDb();
  renderModels();
  renderLessons();
  renderDomainBuilder();
  lastRunData = null;
  tablePages = {};
  output.dataset.expanded = "false";
  renderRawText(output, "Database reset to seed data.", "rawOutput");
  changeSummary.className = "change-summary empty";
  changeSummary.textContent = "Run create(), write(), unlink(), or command tuple examples to see database changes.";
  prettyOutput.className = "pretty-output empty";
  prettyOutput.textContent = "Run a snippet to see formatted results.";
  sqlLog.dataset.expanded = "false";
  renderRawText(sqlLog, "SQL statements will appear after running code.", "ormSqlLog");
}

async function runCode() {
  statusBadge.textContent = "Running";
  statusBadge.className = "";
  output.textContent = "";
  changeSummary.className = "change-summary empty";
  changeSummary.textContent = "Running...";
  prettyOutput.className = "pretty-output empty";
  prettyOutput.textContent = "Running...";
  const response = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: editor.value }),
  });
  const data = await response.json();
  state.db = data.db;
  lastRunData = data;
  statusBadge.textContent = data.status === "ok" ? "OK" : "Error";
  statusBadge.className = data.status;
  tablePages = {};
  output.dataset.expanded = "false";
  renderRawText(output, formatOutput(data), "rawOutput");
  renderChangeSummary(data);
  renderPrettyOutput(data);
  sqlLog.dataset.expanded = "false";
  renderRawText(sqlLog, data.sql.map((entry) => `${entry.sql}\nparams: ${JSON.stringify(entry.params)}`).join("\n\n"), "ormSqlLog");
  renderDb();
}

function formatOutput(data) {
  const parts = [];
  const prettyText = data.error ? "" : formatPrettyRawOutput(data.pretty || []);
  if (prettyText) parts.push(prettyText);
  else if (data.output) parts.push(data.output.trimEnd());
  if (data.error) parts.push(`Friendly error: ${data.error}`);
  if (!parts.length) parts.push("(No printed output)");
  return parts.join("\n\n");
}

function formatPrettyRawOutput(items) {
  return items
    .map((item) => formatPrettyRawItem(item))
    .filter(Boolean)
    .join("\n");
}

function formatPrettyRawItem(item) {
  const args = item.args || [];
  if (!args.length) return (item.text || "").trimEnd();
  const firstArg = args[0];
  const hasLabel = args.length > 1 && typeof firstArg === "string" && firstArg.length < 80;
  const values = hasLabel ? args.slice(1) : args;
  const formattedValues = values.map(formatRawValue).join(" ");
  return hasLabel ? `${firstArg}\n${formattedValues}` : formattedValues;
}

function formatRawValue(value) {
  if (Array.isArray(value) || isPlainObject(value) || (value && typeof value === "object")) {
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === "string") return value;
  return formatScalar(value);
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

function renderChangeSummary(data) {
  if (data.error) {
    changeSummary.className = "change-summary empty";
    changeSummary.textContent = "No database changes were saved because the snippet raised an error.";
    return;
  }

  const changes = data.changes || [];
  if (!changes.length) {
    changeSummary.className = "change-summary empty";
    changeSummary.textContent = "No database rows changed. Search/read examples usually only query data.";
    return;
  }

  changeSummary.className = "change-summary";
  changeSummary.innerHTML = changes.map(renderTableChange).join("");
}

function renderTableChange(change) {
  const blocks = [];
  if (change.created?.length) {
    blocks.push(renderChangedRows("Created rows", "created", change.created, change.table));
  }
  if (change.updated?.length) {
    blocks.push(renderUpdatedRows(change.updated));
  }
  if (change.deleted?.length) {
    blocks.push(renderChangedRows("Deleted rows", "deleted", change.deleted, change.table));
  }

  return `
    <article class="change-card">
      <h3>${escapeHtml(change.table)}</h3>
      ${blocks.join("")}
    </article>
  `;
}

function renderChangedRows(title, type, rows, tableName) {
  return `
    <section class="change-block ${type}">
      <h4>${escapeHtml(title)}</h4>
      ${renderPrettyTable(rows, `change-${tableName}-${type}-${title}`)}
    </section>
  `;
}

function renderUpdatedRows(rows) {
  return `
    <section class="change-block updated">
      <h4>Updated rows</h4>
      ${rows
        .map(
          (row) => `
            <div class="field-diff">
              <div class="field-diff-title">id ${escapeHtml(row.id)}</div>
              <table class="diff-table">
                <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                <tbody>
                  ${Object.entries(row.fields)
                    .map(
                      ([field, values]) => `
                        <tr>
                          <td>${escapeHtml(field)}</td>
                          <td>${escapeHtml(formatScalar(values.before))}</td>
                          <td>${escapeHtml(formatScalar(values.after))}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
        )
        .join("")}
    </section>
  `;
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
        ${values.length ? values.map((value, valueIndex) => renderPrettyValue(value, `pretty-${index}-${valueIndex}`)).join("") : `<p class="pretty-text">${escapeHtml(item.text || "")}</p>`}
      </div>
    </article>
  `;
}

function renderPrettyValue(value, path = "pretty") {
  if (value && value.type === "recordset") {
    return `
      <div class="pretty-record-title">${escapeHtml(value.model)} <span>${escapeHtml(value.ids.length)} records</span></div>
      ${renderPrettyValue(value.rows, `${path}-recordset`)}
    `;
  }
  if (value && value.type === "record") {
    return `
      <div class="pretty-record-title">${escapeHtml(value.model)},${escapeHtml(value.id)}</div>
      ${renderPrettyValue(value.row, `${path}-record`)}
    `;
  }
  if (Array.isArray(value)) {
    if (!value.length) return `<div class="pretty-empty-list">Empty list</div>`;
    if (value.every(isPlainObject)) return renderPrettyTable(value, `${path}-table`);
    if (value.every(Array.isArray)) return renderPrettyArrayTable(value, `${path}-array-table`);
    return `<div class="pretty-list">${value.map((item, index) => `<div>${renderPrettyValue(item, `${path}-${index}`)}</div>`).join("")}</div>`;
  }
  if (isPlainObject(value)) {
    return `
      <dl class="pretty-kv">
        ${Object.entries(value)
          .map(([key, item]) => `<dt>${escapeHtml(key)}</dt><dd>${renderPrettyValue(item, `${path}-${key}`)}</dd>`)
          .join("")}
      </dl>
    `;
  }
  return `<span class="pretty-scalar">${escapeHtml(formatScalar(value))}</span>`;
}

function renderPrettyTable(rows, tableId = "pretty-table") {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return `<div class="pretty-table-wrap">${renderPaginatedTable(rows, columns, tableId, "pretty-table")}</div>`;
}

function renderPrettyArrayTable(rows, tableId = "pretty-array-table") {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const columns = Array.from({ length: columnCount }, (_, index) => `Value ${index + 1}`);
  const objectRows = rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
  return `<div class="pretty-table-wrap">${renderPaginatedTable(objectRows, columns, tableId, "pretty-table")}</div>`;
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
      ${renderPaginatedTable(info.rows, columns, `db-${activeTable}`)}
    </div>
  `;
}

function renderPaginatedTable(rows, columns, tableId, tableClass = "") {
  if (!columns.length) return `<div class="pretty-empty-list">No columns</div>`;
  const pageCount = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
  const currentPage = Math.min(tablePages[tableId] || 0, pageCount - 1);
  tablePages[tableId] = currentPage;
  const start = currentPage * TABLE_PAGE_SIZE;
  const pageRows = rows.slice(start, start + TABLE_PAGE_SIZE);
  const rangeStart = rows.length ? start + 1 : 0;
  const rangeEnd = start + pageRows.length;
  return `
    <div class="paginated-table" data-table-id="${escapeHtml(tableId)}">
      <table class="${escapeHtml(tableClass)}">
        <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
        <tbody>
          ${pageRows
            .map((row) => `<tr>${columns.map((column) => `<td>${renderPrettyCell(row[column])}</td>`).join("")}</tr>`)
            .join("")}
        </tbody>
      </table>
      ${pageCount > 1 ? `
        <div class="table-pager">
          <span>${rangeStart}-${rangeEnd} of ${rows.length}</span>
          <div>
            <button type="button" data-table-page="${escapeHtml(tableId)}" data-page="${Math.max(0, currentPage - 1)}" ${currentPage === 0 ? "disabled" : ""}>Previous</button>
            <button type="button" data-table-page="${escapeHtml(tableId)}" data-page="${Math.min(pageCount - 1, currentPage + 1)}" ${currentPage === pageCount - 1 ? "disabled" : ""}>Next</button>
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderRawText(element, text, key) {
  rawTexts[key] = text;
  const lines = text.split("\n");
  const expanded = element.dataset.expanded === "true";
  const needsToggle = lines.length > RAW_TEXT_LINES || text.length > RAW_TEXT_CHARS;
  element.textContent = needsToggle && !expanded ? collapseRawText(text, lines) : text;
  let toggle = element.nextElementSibling;
  if (!toggle || toggle.dataset.rawToggle !== key) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "raw-toggle";
    toggle.dataset.rawToggle = key;
    element.insertAdjacentElement("afterend", toggle);
  }
  toggle.hidden = !needsToggle;
  toggle.textContent = expanded ? "Show less" : `Show more (${formatHiddenRawAmount(text, lines)})`;
}

function collapseRawText(text, lines) {
  if (lines.length > RAW_TEXT_LINES) {
    return `${lines.slice(0, RAW_TEXT_LINES).join("\n")}\n...`;
  }
  return `${text.slice(0, RAW_TEXT_CHARS).trimEnd()}\n...`;
}

function formatHiddenRawAmount(text, lines) {
  if (lines.length > RAW_TEXT_LINES) return `${lines.length - RAW_TEXT_LINES} more lines`;
  return `${text.length - RAW_TEXT_CHARS} more chars`;
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

function renderLessons() {
  lessonsView.innerHTML = ormLessons
    .map(
      (lesson, index) => `
        <article class="lesson-card">
          <div class="lesson-header">
            <div>
              <span class="lesson-number">${index + 1}</span>
              <h3>${escapeHtml(lesson.method)}</h3>
            </div>
            <button class="lesson-run" type="button" data-lesson="${index}">Load Code</button>
          </div>
          <p>${escapeHtml(lesson.explanation)}</p>
          <div class="lesson-columns">
            <section>
              <h4>Runnable code</h4>
              <pre>${escapeHtml(lesson.code)}</pre>
            </section>
            <section>
              <h4>Expected output</h4>
              <pre>${escapeHtml(lesson.expected)}</pre>
            </section>
          </div>
        </article>
      `
    )
    .join("");

  lessonsView.querySelectorAll(".lesson-run").forEach((button) => {
    button.addEventListener("click", () => {
      const lesson = ormLessons[Number(button.dataset.lesson)];
      editor.value = lesson.code;
      syncCodeHighlight();
      editor.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function renderDomainBuilder() {
  const previousModel = domainModel.value;
  domainModel.innerHTML = state.models
    .map((model) => `<option value="${escapeHtml(model.name)}">${escapeHtml(model.name)}</option>`)
    .join("");
  if (previousModel && state.models.some((model) => model.name === previousModel)) {
    domainModel.value = previousModel;
  } else {
    domainModel.value = "product.product";
  }
  if (!domainConditions.children.length) {
    addDomainCondition({ field: "name", operator: "ilike", value: "lap" });
  } else {
    renderDomainConditions();
  }
  updateDomainPreview();
}

function renderDomainConditions() {
  const values = readDomainConditions();
  domainConditions.innerHTML = "";
  values.forEach((condition) => addDomainCondition(condition));
}

function addDomainCondition(condition = {}) {
  const model = getDomainModel();
  const fields = getSearchableFields(model);
  const defaultField = fields.some((field) => field.name === condition.field)
    ? condition.field
    : fields[0]?.name || "id";
  const row = document.createElement("div");
  row.className = "domain-condition";
  row.dataset.id = String(++domainConditionId);
  row.innerHTML = `
    <select class="domain-field" title="Field">
      ${fields.map((field) => `<option value="${escapeHtml(field.name)}">${escapeHtml(field.name)} (${escapeHtml(field.type)})</option>`).join("")}
    </select>
    <select class="domain-operator" title="Operator">
      ${["=", "!=", ">", ">=", "<", "<=", "ilike", "like", "in"]
        .map((operator) => `<option value="${escapeHtml(operator)}">${escapeHtml(operator)}</option>`)
        .join("")}
    </select>
    <input class="domain-value" type="text" title="Value" placeholder="value">
    <button class="domain-remove" type="button" title="Remove condition">Remove</button>
  `;
  row.querySelector(".domain-field").value = defaultField;
  row.querySelector(".domain-operator").value = condition.operator || "ilike";
  row.querySelector(".domain-value").value = condition.value ?? "";
  row.querySelectorAll("select, input").forEach((input) => input.addEventListener("input", updateDomainPreview));
  row.querySelector(".domain-remove").addEventListener("click", () => {
    row.remove();
    if (!domainConditions.children.length) addDomainCondition();
    updateDomainPreview();
  });
  domainConditions.appendChild(row);
}

function getDomainModel() {
  return state.models.find((model) => model.name === domainModel.value) || state.models[0];
}

function getSearchableFields(model) {
  if (!model) return [];
  return model.fields.filter((field) => !["one2many", "many2many"].includes(field.type));
}

function readDomainConditions() {
  return [...domainConditions.querySelectorAll(".domain-condition")].map((row) => ({
    field: row.querySelector(".domain-field").value,
    operator: row.querySelector(".domain-operator").value,
    value: row.querySelector(".domain-value").value,
  }));
}

function buildDomainCode() {
  const model = domainModel.value || "product.product";
  const domain = readDomainConditions()
    .filter((condition) => condition.field)
    .map((condition) => `(${pythonString(condition.field)}, ${pythonString(condition.operator)}, ${pythonValue(condition.value, condition.operator)})`);
  const fields = domainFields.value
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
  const fieldsCode = fields.length ? `[${fields.map(pythonString).join(", ")}]` : "None";

  return `# Generated by the Domain Builder.
# A domain is a list of conditions: (field, operator, value).
records = env[${pythonString(model)}].search([${domain.join(", ")}])
print(records)
print(records.read(${fieldsCode}))`;
}

function updateDomainPreview() {
  domainPreview.textContent = buildDomainCode();
}

function pythonString(value) {
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function pythonValue(value, operator) {
  const trimmed = String(value).trim();
  if (operator === "in") {
    const values = trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => parseDomainScalar(item));
    return `[${values.join(", ")}]`;
  }
  return parseDomainScalar(trimmed);
}

function parseDomainScalar(value) {
  if (value === "") return "False";
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return value;
  if (["True", "False", "None"].includes(value)) return value;
  return pythonString(value);
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
