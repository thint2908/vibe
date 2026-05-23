const editor = document.querySelector("#codeEditor");
const output = document.querySelector("#output");
const sqlLog = document.querySelector("#sqlLog");
const statusBadge = document.querySelector("#statusBadge");
const tableList = document.querySelector("#tableList");
const tableRows = document.querySelector("#tableRows");
const modelsView = document.querySelector("#modelsView");
const themeToggle = document.querySelector("#themeToggle");

let state = { db: {}, models: [] };
let activeTable = null;

const selectExamples = {
  search_all: `products = env['product.product'].search([])
print(products)
print(products.read(['name', 'default_code', 'list_price']))`,

  search_domain: `products = env['product.product'].search([('categ_id', '=', 1)])
print(products.read(['name', 'list_price', 'categ_id']))`,

  search_operators: `expensive = env['product.product'].search([('list_price', '>=', 250)])
print('>= 250:', expensive.read(['name', 'list_price']))

name_match = env['product.product'].search([('name', 'ilike', 'lap')])
print('name ilike lap:', name_match.read(['name']))`,

  search_order_limit: `products = env['product.product'].search([], order='list_price desc', limit=2)
print(products.read(['name', 'list_price']))`,

  filtered: `products = env['product.product'].search([])
premium = products.filtered(lambda p: p.list_price >= 300)
print(premium.read(['name', 'list_price']))`,

  mapped: `orders = env['sale.order'].search([])
partners = orders.mapped('partner_id')
print(partners.name_get())`,

  sorted: `products = env['product.product'].search([])
cheap_to_expensive = products.sorted(key=lambda p: p.list_price)
print(cheap_to_expensive.read(['name', 'list_price']))`,

  browse: `product = env['product.product'].browse(1)
print(product)
print(product.read(['name', 'default_code', 'list_price']))`,

  create: `product = env['product.product'].create({
    'name': 'Keyboard',
    'default_code': 'KEY001',
    'list_price': 45,
    'categ_id': 1,
})
print(product.read())`,

  write: `product = env['product.product'].search([('name', '=', 'Laptop')])
product.write({'list_price': 1150, 'categ_id': 1})
print(product.read(['name', 'list_price', 'categ_id']))`,

  unlink: `product = env['product.product'].create({'name': 'Delete Me', 'default_code': 'DEL001'})
print('before:', product.exists().read())
product.unlink()
print('after:', product.exists().read())`,

  m2o: `order = env['sale.order'].search([('name', '=', 'SO001')])
print(order.partner_id.name)

line = order.order_line.sorted(key=lambda line: line.id).limit(1)
print(line.product_id.name)`,

  o2m: `order = env['sale.order'].search([('name', '=', 'SO001')])
for line in order.order_line:
    print(line.product_id.name, line.quantity, line.price_unit)`,

  revenue: `partners = env['res.partner'].search([])
for partner in partners:
    orders = env['sale.order'].search([('partner_id', '=', partner.id)])
    total = 0
    for order in orders:
        for line in order.order_line:
            total = total + line.quantity * line.price_unit
    print(partner.name, total)`,

  inventory: `products = env['product.product'].search([])
for product in products:
    lines = env['sale.order.line'].search([('product_id', '=', product.id)])
    sold_qty = sum(line.quantity for line in lines)
    print(product.name, 'sold quantity:', sold_qty)`,

  search_count: `count = env['product.product'].search_count([('list_price', '>=', 250)])
print('Products with price >= 250:', count)`,
};

document.querySelector("#runBtn").addEventListener("click", runCode);
document.querySelector("#resetBtn").addEventListener("click", loadState);
themeToggle.addEventListener("click", toggleTheme);

document.querySelectorAll(".example-btn").forEach((button) => {
  button.addEventListener("click", () => {
    editor.value = button.dataset.code;
    editor.focus();
  });
});

function loadExample(value) {
  if (!value || !selectExamples[value]) return;
  editor.value = selectExamples[value];
  editor.focus();
}

window.loadExample = loadExample;

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
loadState();
