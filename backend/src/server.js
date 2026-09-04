import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import { promisify } from "node:util";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";

const port = Number(process.env.PORT || 3000);
const databaseName = process.env.DB_NAME || "wgg_wedding";
const databasePassword = readFileSync(process.env.DB_PASSWORD_FILE || "/run/secrets/mysql_app_password", "utf8").trim();
const adminBootstrapPassword = readFileSync(process.env.ADMIN_BOOTSTRAP_PASSWORD_FILE || "/run/secrets/admin_password", "utf8").trim();
const adminBootstrapUsername = String(process.env.ADMIN_BOOTSTRAP_USERNAME || "admin").trim().toLowerCase();
const smtpUser = process.env.SMTP_USER || "d.singine@gmail.com";
const notificationEmail = process.env.NOTIFICATION_EMAIL || smtpUser;
const smtpPassword = readFileSync(process.env.SMTP_PASSWORD_FILE || "/run/secrets/gmail_app_password", "utf8").replace(/\s/g, "");
const scrypt = promisify(scryptCallback);
const sessionCookieName = "wgg_admin_session";
const sessionLifetimeSeconds = 8 * 60 * 60;

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

const mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: { user: smtpUser, pass: smtpPassword },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
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

function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
}

function parseCookies(request) {
    return String(request.headers.cookie || "").split(";").reduce((cookies, part) => {
        const separator = part.indexOf("=");
        if (separator < 0) return cookies;
        const key = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        if (key) {
            try {
                cookies[key] = decodeURIComponent(value);
            } catch {
                cookies[key] = value;
            }
        }
        return cookies;
    }, Object.create(null));
}

function sessionTokenHash(token) {
    return createHash("sha256").update(token).digest("hex");
}

async function derivePassword(password, salt) {
    return scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

async function createPasswordRecord(password) {
    const salt = randomBytes(16).toString("hex");
    const derivedKey = await derivePassword(password, salt);
    return { salt, hash: derivedKey.toString("hex") };
}

async function verifyPassword(password, salt, expectedHash) {
    const derivedKey = await derivePassword(password, salt);
    const expected = Buffer.from(expectedHash, "hex");
    return expected.length === derivedKey.length && timingSafeEqual(expected, derivedKey);
}

async function findAuthenticatedUser(request) {
    const token = parseCookies(request)[sessionCookieName];
    if (!token || token.length > 128) return null;
    const [rows] = await pool.execute(`SELECT users.id, users.username
        FROM admin_sessions
        INNER JOIN users ON users.id = admin_sessions.user_id
        WHERE admin_sessions.token_hash = ?
          AND admin_sessions.expires_at > CURRENT_TIMESTAMP
          AND users.is_active = TRUE
        LIMIT 1`, [sessionTokenHash(token)]);
    return rows[0] || null;
}

async function requireAdmin(request, response) {
    const user = await findAuthenticatedUser(request);
    if (user) return user;
    sendJson(response, 401, { error: "登录已过期，请重新登录。" });
    return null;
}

function sessionCookie(token, maxAge = sessionLifetimeSeconds) {
    return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function login(request, response) {
    const body = await readJson(request);
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");
    if (!username || !password || username.length > 64 || password.length > 256) {
        return sendJson(response, 401, { error: "用户名或密码不正确。" });
    }

    const [rows] = await pool.execute(`SELECT id, username, password_hash, password_salt
        FROM users WHERE username = ? AND is_active = TRUE LIMIT 1`, [username]);
    const user = rows[0];
    const validHash = user?.password_hash || "0".repeat(128);
    const validSalt = user?.password_salt || "0".repeat(32);
    const valid = await verifyPassword(password, validSalt, validHash);
    if (!user || !valid) return sendJson(response, 401, { error: "用户名或密码不正确。" });

    const token = randomBytes(32).toString("base64url");
    await pool.execute(`INSERT INTO admin_sessions (user_id, token_hash, expires_at)
        VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND))`,
    [user.id, sessionTokenHash(token), sessionLifetimeSeconds]);
    await pool.execute("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);
    await pool.query("DELETE FROM admin_sessions WHERE expires_at <= CURRENT_TIMESTAMP");
    sendJson(response, 200, { user: { id: String(user.id), username: user.username } }, { "Set-Cookie": sessionCookie(token) });
}

async function logout(request, response) {
    const token = parseCookies(request)[sessionCookieName];
    if (token && token.length <= 128) {
        await pool.execute("DELETE FROM admin_sessions WHERE token_hash = ?", [sessionTokenHash(token)]);
    }
    sendJson(response, 200, { success: true }, { "Set-Cookie": sessionCookie("", 0) });
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

async function sendSubmissionNotification({ id, name, phone, attendance, guestCount }) {
    const submittedAt = new Date().toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false
    });
    const displayId = formatDisplayId(id, new Date().toISOString());
    const attendanceText = attendance === "yes" ? "确认出席" : "无法出席";
    const text = [
        "收到一条新的婚礼登记信息。",
        "",
        `编号：${displayId}`,
        `姓名：${name}`,
        `手机号：${phone}`,
        `出席状态：${attendanceText}`,
        `出席人数：${guestCount} 人`,
        `提交时间：${submittedAt}`,
        "",
        "请登录管理后台查看和确认：",
        "https://db.wagaga.top/"
    ].join("\n");

    const result = await mailer.sendMail({
        from: `WAGAGA 婚礼登记 <${smtpUser}>`,
        to: notificationEmail,
        subject: "新的婚礼登记通知",
        text
    });
    console.log(`Submission notification sent: ${result.messageId}`);
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

    await pool.query(`CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        username VARCHAR(64) NOT NULL,
        password_hash CHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        password_salt CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_username (username)
    ) ENGINE=InnoDB`);

    await pool.query(`CREATE TABLE IF NOT EXISTS admin_sessions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_admin_sessions_token_hash (token_hash),
        INDEX idx_admin_sessions_expires_at (expires_at),
        INDEX idx_admin_sessions_user_id (user_id),
        CONSTRAINT fk_admin_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    const [adminRows] = await pool.query("SELECT id FROM users LIMIT 1");
    if (adminRows.length === 0) {
        if (!/^[a-z0-9_.-]{3,64}$/.test(adminBootstrapUsername) || adminBootstrapPassword.length < 8) {
            throw new Error("Admin bootstrap credentials are invalid.");
        }
        const passwordRecord = await createPasswordRecord(adminBootstrapPassword);
        await pool.execute("INSERT INTO users (username, password_hash, password_salt) VALUES (?, ?, ?)", [
            adminBootstrapUsername,
            passwordRecord.hash,
            passwordRecord.salt
        ]);
        console.log(`Created initial database admin user: ${adminBootstrapUsername}`);
    }
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

    let notificationSent = false;
    try {
        await sendSubmissionNotification({ id: result.insertId, name, phone, attendance, guestCount });
        notificationSent = true;
    } catch (error) {
        console.error(`Failed to send submission notification for id ${result.insertId}: ${error.message}`);
    }

    sendJson(response, 201, { success: true, id: String(result.insertId), notificationSent });
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

    if (request.method === "POST" && url.pathname === "/admin/login") return login(request, response);
    if (request.method === "POST" && url.pathname === "/admin/logout") return logout(request, response);

    const adminUser = url.pathname.startsWith("/admin/") ? await requireAdmin(request, response) : null;
    if (url.pathname.startsWith("/admin/") && !adminUser) return;
    if (request.method === "GET" && url.pathname === "/admin/session") {
        return sendJson(response, 200, { user: { id: String(adminUser.id), username: adminUser.username } });
    }
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
        mailer.close();
        await pool.end();
        process.exit(0);
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

await migrateDatabase();
server.listen(port, "0.0.0.0", () => console.log(`Wedding API listening on port ${port}.`));
