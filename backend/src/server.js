import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import mysql from "mysql2/promise";

const port = Number(process.env.PORT || 3000);
const databaseName = process.env.DB_NAME || "wgg_wedding";
const databasePassword = readFileSync(process.env.DB_PASSWORD_FILE || "/run/secrets/mysql_app_password", "utf8").trim();
const adminPassword = readFileSync(process.env.ADMIN_PASSWORD_FILE || "/run/secrets/admin_password", "utf8").trim();
const adminUsername = process.env.ADMIN_USERNAME || "admin";

const pool = mysql.createPool({
    host: process.env.DB_HOST || "database",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "wgg_app",
    password: databasePassword,
    database: databaseName,
    charset: "utf8mb4",
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function sendJson(response, status, data, extraHeaders = {}) {
    const body = JSON.stringify(data);
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...extraHeaders
    });
    response.end(body);
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAdmin(request, response) {
    const authorization = request.headers.authorization || "";
    if (authorization.startsWith("Basic ")) {
        try {
            const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
            const separator = decoded.indexOf(":");
            const username = separator >= 0 ? decoded.slice(0, separator) : "";
            const password = separator >= 0 ? decoded.slice(separator + 1) : "";
            if (safeEqual(username, adminUsername) && safeEqual(password, adminPassword)) return true;
        } catch {
            // Invalid credentials are handled by the generic unauthorized response below.
        }
    }

    sendJson(response, 401, { error: "需要管理员身份验证。" }, { "WWW-Authenticate": "Basic realm=\"WAGAGA Admin\"" });
    return false;
}

function readJson(request, maxBytes = 16 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let rejected = false;

        request.on("data", (chunk) => {
            if (rejected) return;
            size += chunk.length;
            if (size > maxBytes) {
                rejected = true;
                reject(Object.assign(new Error("Request body is too large"), { status: 413 }));
                return;
            }
            chunks.push(chunk);
        });
        request.on("end", () => {
            if (rejected) return;
            try {
                const raw = Buffer.concat(chunks).toString("utf8");
                resolve(raw ? JSON.parse(raw) : {});
            } catch {
                reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
            }
        });
        request.on("error", reject);
    });
}

function normalizePhone(value) {
    return String(value || "").replace(/[\s-]/g, "");
}

function formatDisplayId(id, createdAt) {
    const date = String(createdAt || "").slice(0, 10).replaceAll("-", "") || "00000000";
    return `WG-${date}-${String(id).padStart(3, "0")}`;
}

function mapSubmission(row) {
    return {
        id: String(row.id),
        displayId: formatDisplayId(row.id, row.created_at),
        name: row.name,
        phone: row.phone,
        attendance: row.attendance,
        guestCount: Number(row.guest_count || 1),
        message: row.message || "",
        confirmed: Boolean(row.is_confirmed),
        confirmedAt: row.confirmed_at,
        submittedAt: row.created_at
    };
}

async function columnExists(columnName) {
    const [rows] = await pool.execute(
        "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'guest_submissions' AND COLUMN_NAME = ? LIMIT 1",
        [databaseName, columnName]
    );
    return rows.length > 0;
}

async function migrateDatabase() {
    await pool.query(`CREATE TABLE IF NOT EXISTS guest_submissions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(32) NOT NULL,
        attendance ENUM('yes', 'no', 'pending') NOT NULL DEFAULT 'pending',
        guest_count TINYINT UNSIGNED NOT NULL DEFAULT 1,
        message VARCHAR(1000) NULL,
        is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        confirmed_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_guest_submissions_created_at (created_at),
        INDEX idx_guest_submissions_attendance (attendance),
        INDEX idx_guest_submissions_is_confirmed (is_confirmed),
        CONSTRAINT chk_guest_count CHECK (guest_count BETWEEN 1 AND 20)
    ) ENGINE=InnoDB`);

    const hasConfirmed = await columnExists("is_confirmed");
    const hasRead = await columnExists("is_read");
    if (!hasConfirmed && hasRead) {
        await pool.query("ALTER TABLE guest_submissions CHANGE COLUMN is_read is_confirmed BOOLEAN NOT NULL DEFAULT FALSE");
    } else if (!hasConfirmed) {
        await pool.query("ALTER TABLE guest_submissions ADD COLUMN is_confirmed BOOLEAN NOT NULL DEFAULT FALSE AFTER message");
    }

    const hasConfirmedAt = await columnExists("confirmed_at");
    const hasReadAt = await columnExists("read_at");
    if (!hasConfirmedAt && hasReadAt) {
        await pool.query("ALTER TABLE guest_submissions CHANGE COLUMN read_at confirmed_at DATETIME NULL");
    } else if (!hasConfirmedAt) {
        await pool.query("ALTER TABLE guest_submissions ADD COLUMN confirmed_at DATETIME NULL AFTER is_confirmed");
    }

    await pool.query("UPDATE guest_submissions SET guest_count = 1 WHERE guest_count IS NULL OR guest_count < 1");
    await pool.query("ALTER TABLE guest_submissions MODIFY COLUMN guest_count TINYINT UNSIGNED NOT NULL DEFAULT 1");
}

async function listSubmissions(response) {
    const [rows] = await pool.query(`SELECT id, name, phone, attendance, guest_count, message,
        is_confirmed, confirmed_at, created_at
        FROM guest_submissions
        ORDER BY created_at DESC, id DESC
        LIMIT 1000`);
    sendJson(response, 200, { submissions: rows.map(mapSubmission) });
}

async function createSubmission(request, response) {
    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const phone = normalizePhone(body.phone);
    const attendance = String(body.attendance || "");
    const parsedGuestCount = Number.parseInt(body.guestCount, 10);
    const guestCount = Number.isInteger(parsedGuestCount) && parsedGuestCount >= 1 && parsedGuestCount <= 20 ? parsedGuestCount : 1;
    const message = String(body.message || "").trim();

    if (!name || name.length > 100) return sendJson(response, 422, { error: "请填写正确的姓名。" });
    if (!/^1\d{10}$/.test(phone)) return sendJson(response, 422, { error: "请填写正确的 11 位手机号。" });
    if (!new Set(["yes", "no"]).has(attendance)) return sendJson(response, 422, { error: "请选择是否出席。" });
    if (message.length > 1000) return sendJson(response, 422, { error: "留言内容不能超过 1000 个字符。" });

    const [result] = await pool.execute(
        "INSERT INTO guest_submissions (name, phone, attendance, guest_count, message) VALUES (?, ?, ?, ?, ?)",
        [name, phone, attendance, guestCount, message || null]
    );
    sendJson(response, 201, { success: true, id: String(result.insertId) });
}

async function updateConfirmation(request, response, id) {
    const body = await readJson(request);
    if (typeof body.confirmed !== "boolean") return sendJson(response, 422, { error: "确认状态无效。" });

    const [result] = await pool.execute(
        "UPDATE guest_submissions SET is_confirmed = ?, confirmed_at = IF(?, CURRENT_TIMESTAMP, NULL) WHERE id = ?",
        [body.confirmed, body.confirmed, id]
    );
    if (result.affectedRows === 0) return sendJson(response, 404, { error: "没有找到这条提交记录。" });

    const [rows] = await pool.execute(`SELECT id, name, phone, attendance, guest_count, message,
        is_confirmed, confirmed_at, created_at FROM guest_submissions WHERE id = ? LIMIT 1`, [id]);
    sendJson(response, 200, { submission: mapSubmission(rows[0]) });
}

async function handleRequest(request, response) {
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET" && url.pathname === "/healthz") {
        await pool.query("SELECT 1");
        return sendJson(response, 200, { status: "ok" });
    }
    if (request.method === "POST" && url.pathname === "/submissions") return createSubmission(request, response);

    if (url.pathname.startsWith("/admin/") && !requireAdmin(request, response)) return;
    if (request.method === "GET" && url.pathname === "/admin/submissions") return listSubmissions(response);

    const confirmationMatch = url.pathname.match(/^\/admin\/submissions\/(\d+)\/confirmation$/);
    if (request.method === "PATCH" && confirmationMatch) return updateConfirmation(request, response, confirmationMatch[1]);

    sendJson(response, 404, { error: "Not found" });
}

const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
        const status = Number(error.status) || 500;
        if (status >= 500) console.error(error);
        if (!response.headersSent) sendJson(response, status, { error: status >= 500 ? "服务器暂时无法处理请求，请稍后重试。" : error.message });
    });
});

async function shutdown(signal) {
    console.log(`Received ${signal}, shutting down.`);
    server.close(async () => {
        await pool.end();
        process.exit(0);
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

await migrateDatabase();
server.listen(port, "0.0.0.0", () => console.log(`Wedding API listening on port ${port}.`));
