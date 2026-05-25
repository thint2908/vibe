const sqlEditor = document.querySelector("#sqlEditor");
const sqlHighlight = document.querySelector("#sqlHighlight code");
const sqlHighlightFrame = document.querySelector("#sqlHighlight");
const runSqlBtn = document.querySelector("#runSqlBtn");
const sqlResult = document.querySelector("#sqlResult");
const changeSummary = document.querySelector("#changeSummary");
const sqlLog = document.querySelector("#sqlLog");
const statusBadge = document.querySelector("#statusBadge");
const tableList = document.querySelector("#tableList");
const tableRows = document.querySelector("#tableRows");
const schemaView = document.querySelector("#schemaView");
const sqlLessonsView = document.querySelector("#sqlLessonsView");
const sqlCheatsheet = document.querySelector("#sqlCheatsheet");
const queryHistory = document.querySelector("#queryHistory");
const sqlExampleSelect = document.querySelector("#sqlExampleSelect");
const sqlExampleList = document.querySelector("#sqlExampleList");
const themeToggle = document.querySelector("#themeToggle");
const resetBtn = document.querySelector("#resetBtn");

let state = { db: {}, models: [] };
let activeTable = null;
let history = [];

const sqlExamples = [
  {
    key: "select_products",
    group: "Read data",
    title: "Select products",
    sql: `SELECT id, name, default_code, list_price
FROM product_product
ORDER BY list_price DESC;`,
  },
  {
    key: "where_limit",
    group: "Read data",
    title: "WHERE + LIMIT",
    sql: `SELECT id, name, list_price
FROM product_product
WHERE list_price >= 250
ORDER BY list_price DESC
LIMIT 2;`,
  },
  {
    key: "join_order_customer",
    group: "Relations",
    title: "Join order to customer",
    sql: `SELECT so.name AS order_name, rp.name AS customer
FROM sale_order AS so
JOIN res_partner AS rp ON rp.id = so.partner_id
ORDER BY so.id;`,
  },
  {
    key: "join_lines",
    group: "Relations",
    title: "Order lines with products",
    sql: `SELECT so.name AS order_name,
       p.name AS product,
       sol.quantity,
       sol.price_unit,
       sol.quantity * sol.price_unit AS subtotal
FROM sale_order_line AS sol
JOIN sale_order AS so ON so.id = sol.order_id
JOIN product_product AS p ON p.id = sol.product_id
ORDER BY so.name, sol.id;`,
  },
  {
    key: "many2many",
    group: "Relations",
    title: "Many2many tags",
    sql: `SELECT p.name AS product, t.name AS tag
FROM product_product AS p
JOIN product_product_tag_rel AS rel ON rel.product_id = p.id
JOIN product_tag AS t ON t.id = rel.tag_id
ORDER BY p.name, t.name;`,
  },
  {
    key: "revenue_customer",
    group: "Reports",
    title: "Revenue by customer",
    sql: `SELECT rp.name AS customer,
       SUM(sol.quantity * sol.price_unit) AS revenue
FROM res_partner AS rp
JOIN sale_order AS so ON so.partner_id = rp.id
JOIN sale_order_line AS sol ON sol.order_id = so.id
GROUP BY rp.id, rp.name
ORDER BY revenue DESC;`,
  },
  {
    key: "insert_product",
    group: "Write data",
    title: "INSERT product",
    sql: `INSERT INTO product_product (name, default_code, list_price, categ_id)
VALUES ('Keyboard', 'KEY001', 45, 1)
RETURNING id, name, default_code, list_price;`,
  },
  {
    key: "update_product",
    group: "Write data",
    title: "UPDATE product",
    sql: `UPDATE product_product
SET list_price = 1150
WHERE default_code = 'LAP001'
RETURNING id, name, list_price;`,
  },
  {
    key: "delete_product",
    group: "Write data",
    title: "DELETE safely",
    sql: `INSERT INTO product_product (name, default_code, list_price)
VALUES ('Delete Me', 'DEL001', 1);

DELETE FROM product_product
WHERE default_code = 'DEL001'
RETURNING id, name;`,
  },
  {
    key: "transaction",
    group: "Transactions",
    title: "Transaction",
    sql: `BEGIN;

UPDATE product_product
SET list_price = list_price * 1.10
WHERE categ_id = 1;

SELECT id, name, list_price
FROM product_product
WHERE categ_id = 1;

COMMIT;`,
  },
  {
    key: "explain",
    group: "Performance",
    title: "EXPLAIN plan",
    sql: `EXPLAIN QUERY PLAN
SELECT id, name
FROM product_product
WHERE categ_id = 1;`,
  },
];

const sqlLessons = [
  {
    title: "Tables, rows, columns",
    summary: "The ORM model product.product maps to the SQL table product_product.",
    sql: `SELECT id, name, list_price
FROM product_product;`,
    expected: "Rows from the product table. Each row is one product record.",
  },
  {
    title: "Filter with WHERE",
    summary: "WHERE reduces rows before they are returned.",
    sql: `SELECT id, name, list_price
FROM product_product
WHERE list_price >= 250;`,
    expected: "Only products with price greater than or equal to 250.",
  },
  {
    title: "Sort and limit",
    summary: "ORDER BY controls result order. LIMIT keeps the result small.",
    sql: `SELECT id, name, list_price
FROM product_product
ORDER BY list_price DESC
LIMIT 2;`,
    expected: "The two most expensive products.",
  },
  {
    title: "Many2one join",
    summary: "A Many2one relation is usually a foreign key column.",
    sql: `SELECT p.name AS product, c.name AS category
FROM product_product AS p
LEFT JOIN product_category AS c ON c.id = p.categ_id;`,
    expected: "Each product with its category name.",
  },
  {
    title: "One2many from SQL",
    summary: "One2many is the reverse of a foreign key; sale_order_line.order_id points to sale_order.id.",
    sql: `SELECT so.name AS order_name, COUNT(sol.id) AS line_count
FROM sale_order AS so
LEFT JOIN sale_order_line AS sol ON sol.order_id = so.id
GROUP BY so.id, so.name;`,
    expected: "One row per order with the number of order lines.",
  },
  {
    title: "Many2many join table",
    summary: "Many2many needs a relation table containing both IDs.",
    sql: `SELECT p.name AS product, t.name AS tag
FROM product_product AS p
JOIN product_product_tag_rel AS rel ON rel.product_id = p.id
JOIN product_tag AS t ON t.id = rel.tag_id;`,
    expected: "Product-tag pairs from the relation table.",
  },
  {
    title: "Aggregation",
    summary: "Use SUM, COUNT, AVG, MIN, and MAX to build reports.",
    sql: `SELECT p.name, SUM(sol.quantity) AS sold_qty
FROM product_product AS p
LEFT JOIN sale_order_line AS sol ON sol.product_id = p.id
GROUP BY p.id, p.name
ORDER BY sold_qty DESC;`,
    expected: "Sold quantity grouped by product.",
  },
  {
    title: "Write and inspect",
    summary: "RETURNING is PostgreSQL syntax. SQLite supports it here too, so it is useful for learning.",
    sql: `UPDATE product_product
SET list_price = list_price + 10
WHERE default_code = 'MON001'
RETURNING id, name, list_price;`,
    expected: "The changed monitor row, plus a before/after change summary.",
  },
];

const cheatSections = [
  {
    title: "SELECT",
    code: `SELECT column1, column2
FROM table_name
WHERE condition
ORDER BY column1 DESC
LIMIT 10;`,
  },
  {
    title: "JOIN",
    code: `SELECT a.name, b.name
FROM table_a AS a
JOIN table_b AS b ON b.id = a.b_id;`,
  },
  {
    title: "GROUP BY",
    code: `SELECT customer_id, SUM(amount) AS total
FROM sale
GROUP BY customer_id
HAVING SUM(amount) > 0;`,
  },
  {
    title: "Writes",
    code: `INSERT INTO table_name (name) VALUES ('New');
UPDATE table_name SET name = 'Changed' WHERE id = 1;
DELETE FROM table_name WHERE id = 1;`,
  },
  {
    title: "PostgreSQL notes",
    code: `ILIKE      case-insensitive LIKE in PostgreSQL
RETURNING  show rows changed by INSERT/UPDATE/DELETE
EXPLAIN    show the query plan
jsonb      PostgreSQL JSON storage type`,
  },
  {
    title: "Safety habit",
    code: `-- First check target rows.
SELECT * FROM product_product WHERE default_code = 'LAP001';

-- Then update with the same WHERE.
UPDATE product_product
SET list_price = 1150
WHERE default_code = 'LAP001';`,
  },
];

runSqlBtn.addEventListener("click", runSql);
resetBtn.addEventListener("click", resetState);
themeToggle.addEventListener("click", toggleTheme);
sqlEditor.addEventListener("input", syncSqlHighlight);
sqlEditor.addEventListener("scroll", syncSqlScroll);
sqlExampleSelect.addEventListener("change", () => {
  const example = sqlExamples.find((item) => item.key === sqlExampleSelect.value);
  if (example) loadSql(example.sql);
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#tab-${button.dataset.tab}`).classList.add("active");
  });
});

function loadSql(sql) {
  sqlEditor.value = sql;
  syncSqlHighlight();
  sqlEditor.focus();
}

async function loadState() {
  const response = await fetch("/api/state");
  state = await response.json();
  activeTable = activeTable || Object.keys(state.db)[0];
  renderDb();
  renderSchema();
}

async function resetState() {
  const response = await fetch("/api/reset", { method: "POST" });
  state = await response.json();
  activeTable = Object.keys(state.db)[0];
  history = [];
  renderDb();
  renderSchema();
  renderHistory();
  sqlResult.className = "pretty-output empty";
  sqlResult.textContent = "Database reset to seed data.";
  changeSummary.className = "change-summary empty";
  changeSummary.textContent = "Run INSERT, UPDATE, DELETE, or DDL queries to see database changes.";
  sqlLog.textContent = "SQL statements will appear after running a query.";
  statusBadge.textContent = "Ready";
  statusBadge.className = "";
}

async function runSql() {
  statusBadge.textContent = "Running";
  statusBadge.className = "";
  sqlResult.className = "pretty-output empty";
  sqlResult.textContent = "Running...";
  changeSummary.className = "change-summary empty";
  changeSummary.textContent = "Running...";

  const response = await fetch("/api/sql/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql: sqlEditor.value }),
  });
  const data = await response.json();
  state.db = data.db;
  statusBadge.textContent = data.status === "ok" ? "OK" : "Error";
  statusBadge.className = data.status;
  renderSqlResult(data);
  renderChangeSummary(data);
  renderSqlLog(data);
  renderDb();
  renderSchema();
  addHistory(data);
}

function renderSqlResult(data) {
  if (data.error) {
    sqlResult.className = "pretty-output";
    sqlResult.innerHTML = `<div class="pretty-error">${escapeHtml(data.error)}</div>`;
    return;
  }
  if (!data.results?.length) {
    sqlResult.className = "pretty-output empty";
    sqlResult.textContent = "(No SQL statements found)";
    return;
  }
  sqlResult.className = "pretty-output";
  sqlResult.innerHTML = data.results.map(renderStatementResult).join("");
}

function renderStatementResult(result, index) {
  const title = `Statement ${index + 1}`;
  if (result.type === "rows") {
    return `
      <article class="pretty-card">
        <h3>${title} <span>${escapeHtml(result.row_count)} rows</span></h3>
        <div class="pretty-card-body">
          <pre class="statement-preview">${escapeHtml(result.statement)}</pre>
          ${result.rows.length ? renderTable(result.rows, result.columns) : `<div class="pretty-empty-list">No rows returned</div>`}
        </div>
      </article>
    `;
  }
  return `
    <article class="pretty-card">
      <h3>${title}</h3>
      <div class="pretty-card-body">
        <pre class="statement-preview">${escapeHtml(result.statement)}</pre>
        <div class="pretty-scalar">Affected rows: ${escapeHtml(formatRowCount(result.row_count))}</div>
      </div>
    </article>
  `;
}

function renderChangeSummary(data) {
  if (data.error) {
    changeSummary.className = "change-summary empty";
    changeSummary.textContent = "No database changes were saved because the SQL raised an error.";
    return;
  }
  const changes = data.changes || [];
  if (!changes.length) {
    changeSummary.className = "change-summary empty";
    changeSummary.textContent = "No tracked table rows changed.";
    return;
  }
  changeSummary.className = "change-summary";
  changeSummary.innerHTML = changes.map(renderTableChange).join("");
}

function renderTableChange(change) {
  const blocks = [];
  if (change.created?.length) blocks.push(renderChangedRows("Created rows", "created", change.created));
  if (change.updated?.length) blocks.push(renderUpdatedRows(change.updated));
  if (change.deleted?.length) blocks.push(renderChangedRows("Deleted rows", "deleted", change.deleted));
  return `
    <article class="change-card">
      <h3>${escapeHtml(change.table)}</h3>
      ${blocks.join("")}
    </article>
  `;
}

function renderChangedRows(title, type, rows) {
  return `
    <section class="change-block ${type}">
      <h4>${escapeHtml(title)}</h4>
      ${renderTable(rows)}
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

function renderSqlLog(data) {
  sqlLog.textContent = data.sql.map((entry) => entry.sql).join("\n\n");
}

function addHistory(data) {
  history.unshift({
    sql: sqlEditor.value,
    status: data.status,
    resultCount: data.results?.length || 0,
  });
  history = history.slice(0, 20);
  renderHistory();
}

function renderHistory() {
  if (!history.length) {
    queryHistory.className = "query-history empty";
    queryHistory.textContent = "Run SQL to build history.";
    return;
  }
  queryHistory.className = "query-history";
  queryHistory.innerHTML = history
    .map(
      (item, index) => `
        <article class="history-item">
          <div>
            <span class="level-pill ${item.status === "ok" ? "must" : "should"}">${escapeHtml(item.status)}</span>
            <strong>${escapeHtml(item.resultCount)} statements</strong>
          </div>
          <pre>${escapeHtml(item.sql)}</pre>
          <button type="button" data-history="${index}">Load</button>
        </article>
      `
    )
    .join("");
  queryHistory.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => loadSql(history[Number(button.dataset.history)].sql));
  });
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
    tableRows.textContent = "No tables found. Use Reset DB to rebuild the playground.";
    return;
  }
  tableRows.innerHTML = `
    <h3>${escapeHtml(activeTable)}</h3>
    <div class="table-wrap">${renderTable(info.rows, info.columns.map((column) => column.name))}</div>
  `;
}

function renderSchema() {
  schemaView.innerHTML = state.models
    .map(
      (model) => `
        <article class="model-card">
          <h3>${escapeHtml(model.table)}</h3>
          <p><strong>ORM model:</strong> ${escapeHtml(model.name)}</p>
          <table>
            <thead><tr><th>Column / Field</th><th>Type</th><th>Relation</th></tr></thead>
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
        </article>
      `
    )
    .join("");
}

function renderLessons() {
  sqlLessonsView.innerHTML = sqlLessons
    .map(
      (lesson, index) => `
        <article class="lesson-card">
          <div class="lesson-header">
            <div>
              <span class="lesson-number">${index + 1}</span>
              <h3>${escapeHtml(lesson.title)}</h3>
            </div>
            <button class="lesson-run" type="button" data-lesson="${index}">Load SQL</button>
          </div>
          <p>${escapeHtml(lesson.summary)}</p>
          <div class="lesson-columns">
            <section>
              <h4>Runnable SQL</h4>
              <pre>${escapeHtml(lesson.sql)}</pre>
            </section>
            <section>
              <h4>Expected result</h4>
              <pre>${escapeHtml(lesson.expected)}</pre>
            </section>
          </div>
        </article>
      `
    )
    .join("");
  sqlLessonsView.querySelectorAll(".lesson-run").forEach((button) => {
    button.addEventListener("click", () => {
      loadSql(sqlLessons[Number(button.dataset.lesson)].sql);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function renderCheatsheet() {
  sqlCheatsheet.innerHTML = cheatSections
    .map(
      (section) => `
        <article>
          <h3>${escapeHtml(section.title)}</h3>
          <pre>${escapeHtml(section.code)}</pre>
        </article>
      `
    )
    .join("");
}

function renderExamples() {
  const groups = [...new Set(sqlExamples.map((example) => example.group))];
  sqlExampleSelect.innerHTML = `<option value="">Choose SQL example</option>` + groups
    .map(
      (group) => `
        <optgroup label="${escapeHtml(group)}">
          ${sqlExamples
            .filter((example) => example.group === group)
            .map((example) => `<option value="${escapeHtml(example.key)}">${escapeHtml(example.title)}</option>`)
            .join("")}
        </optgroup>
      `
    )
    .join("");
  sqlExampleList.innerHTML = sqlExamples
    .map((example, index) => `<button class="example-btn" type="button" data-example="${escapeHtml(example.key)}">${index + 1}. ${escapeHtml(example.title)}</button>`)
    .join("");
  sqlExampleList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const example = sqlExamples.find((item) => item.key === button.dataset.example);
      if (example) loadSql(example.sql);
    });
  });
}

function renderTable(rows, columns = null) {
  const tableColumns = columns || [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (!tableColumns.length) return `<div class="pretty-empty-list">No columns</div>`;
  return `
    <table>
      <thead><tr>${tableColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
          .map((row) => `<tr>${tableColumns.map((column) => `<td>${escapeHtml(formatScalar(row[column]))}</td>`).join("")}</tr>`)
          .join("")}
      </tbody>
    </table>
  `;
}

function syncSqlHighlight() {
  sqlHighlight.innerHTML = highlightSql(sqlEditor.value);
  syncSqlScroll();
}

function syncSqlScroll() {
  sqlHighlightFrame.scrollTop = sqlEditor.scrollTop;
  sqlHighlightFrame.scrollLeft = sqlEditor.scrollLeft;
}

function highlightSql(source) {
  const keywords = new Set([
    "select", "from", "where", "join", "left", "right", "inner", "outer", "on", "group", "by",
    "having", "order", "limit", "offset", "insert", "into", "values", "update", "set", "delete",
    "returning", "create", "table", "index", "primary", "key", "foreign", "references", "unique",
    "check", "not", "null", "and", "or", "as", "begin", "commit", "rollback", "explain",
    "analyze", "case", "when", "then", "else", "end", "distinct", "in", "between", "like", "ilike",
  ]);
  let html = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "-" && source[index + 1] === "-") {
      const end = source.indexOf("\n", index);
      const token = source.slice(index, end === -1 ? source.length : end);
      html += wrapToken("comment", token);
      index += token.length;
      continue;
    }
    if (char === "'") {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === "'" && source[end + 1] === "'") {
          end += 2;
          continue;
        }
        if (source[end] === "'") {
          end += 1;
          break;
        }
        end += 1;
      }
      const token = source.slice(index, end);
      html += wrapToken("string", token);
      index = end;
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
      html += keywords.has(word.toLowerCase()) ? wrapToken("keyword", word) : escapeHtml(word);
      index += word.length;
      continue;
    }
    if (/[-+*/%=!<>|&:.,()[\]{};]/.test(char)) {
      html += wrapToken(/[-+*/%=!<>|&]/.test(char) ? "operator" : "punctuation", char);
      index += 1;
      continue;
    }
    html += escapeHtml(char);
    index += 1;
  }
  return html || "\n";
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

function formatRowCount(value) {
  return value === -1 || value === undefined || value === null ? "unknown" : value;
}

function formatScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "True" : "False";
  return String(value);
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
renderExamples();
renderLessons();
renderCheatsheet();
renderHistory();
syncSqlHighlight();
loadState();
