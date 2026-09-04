# wagaga.top

`wagaga.top` 的 Docker 化网站。当前版本包含三个站点、婚礼登记 API、MySQL 数据库、受登录保护的管理后台和 HTTPS。

## 目录结构

```text
.
├── frontend/
│   └── index.html
├── wedding/
│   └── index.html
├── admin/
│   ├── index.html
│   └── assets/
├── database/
│   └── init/
├── backend/                 # Node.js + MySQL API
├── certbot/                 # Let's Encrypt 证书（不进入 Git）
├── secrets/                 # 仅保留占位文件，真实密码不会进入 Git
├── nginx/
│   └── default.conf
├── scripts/
│   ├── bootstrap-alibaba-linux.sh
│   ├── setup-database-secrets.sh
│   ├── setup-email-secret.sh
│   ├── setup-https.sh
│   └── renew-https.sh
├── deploy.sh
├── docker-compose.yml
└── Dockerfile
```

Nginx 当前提供三个站点：

- `wagaga.top`：`frontend/` 目录。
- `wedding.wagaga.top`：`wedding/` 目录。
- `db.wagaga.top`：`admin/` 目录，显示数据库中的真实提交，并支持人工确认和取消确认。

在阿里云 DNS 中为 `wagaga.top` 添加 A 记录，主机记录分别填写 `wedding` 和 `db`，记录值均填写服务器公网 IP，即可访问婚礼子站与管理后台。

管理后台使用 HTTPS 登录页和数据库会话身份验证。婚礼站只开放提交接口，读取和修改记录必须先登录后台。

## MySQL 数据库

项目使用 DaoCloud 国内代理提供的 MySQL 8.4 LTS Docker Official Image，数据库数据保存在 Docker 命名卷 `mysql_data` 中。MySQL 的宿主机端口仅绑定到 `127.0.0.1:3306`，不要在阿里云安全组中开放公网 3306。

首次启用数据库和后台时，在服务器执行：

```bash
cd /opt/wgg-docker
sudo git pull --ff-only origin main
sudo bash scripts/setup-database-secrets.sh
sudo bash scripts/setup-email-secret.sh
sudo CERTBOT_EMAIL=YOUR_EMAIL@example.com bash scripts/setup-https.sh
sudo bash deploy.sh
```

初始化后的数据库信息：

- 数据库：`wgg_wedding`
- 应用用户：`wgg_app`
- 应用密码：保存在服务器 `/opt/wgg-docker/secrets/mysql_app_password.txt`
- 数据表：`guest_submissions`、`users`、`admin_sessions`
- 后台用户名：`admin`
- 初始后台密码：服务器 `/opt/wgg-docker/secrets/admin_password.txt` 中的密码（首次启动时会以 `scrypt` 哈希写入 `users` 表）
- Gmail 应用专用密码：保存在服务器 `/opt/wgg-docker/secrets/gmail_app_password.txt`

查看应用密码：

```bash
sudo cat /opt/wgg-docker/secrets/mysql_app_password.txt
sudo cat /opt/wgg-docker/secrets/admin_password.txt
```

Navicat 使用 SSH 隧道连接：

- MySQL 主机：`127.0.0.1`
- MySQL 端口：`3306`
- MySQL 用户：`wgg_app`
- SSH 主机：服务器公网 IP
- SSH 端口：`22`
- SSH 用户：服务器登录用户（当前一般为 `root`）

数据库密码文件和 Docker 数据卷都不会被 `git pull` 覆盖。不要执行 `docker compose down -v`，其中的 `-v` 会删除 MySQL 数据卷。

后台密码不会以明文写入数据库。`admin_password.txt` 只用于在 `users` 表为空时创建第一个 `admin` 账号；以后重启或部署不会覆盖数据库中的用户。登录成功后使用仅限 HTTPS、不可被 JavaScript 读取且 8 小时失效的会话 Cookie。

新增或重置后台用户时，在服务器执行以下命令，并按提示输入密码（输入时终端不会显示密码）：

```bash
cd /opt/wgg-docker
sudo docker compose exec -it api npm run admin:user -- dzh
```

命令会使用随机盐和 `scrypt` 生成密码哈希后写入 `users` 表；如果用户名已经存在，则更新其密码、重新启用账号并注销该账号已有的登录会话。不要直接在 Navicat 中填写明文 `password_hash`。

## 新提交邮件通知

宾客登记成功写入数据库后，API 会通过 `d.singine@gmail.com` 向同一邮箱发送纯文本通知。邮件失败不会回滚数据库记录，也不会要求宾客重复提交；失败原因会写入 `wgg-api` 日志。

Gmail SMTP 需要 Google 应用专用密码，不能使用普通账号密码。请先为该账号开启两步验证、创建一个 16 位应用专用密码，然后在服务器执行：

```bash
cd /opt/wgg-docker
sudo bash scripts/setup-email-secret.sh
```

脚本会在终端中隐藏输入内容，并把密码保存为仅 root 可读的 Docker Secret。不要把应用专用密码写入 Git、`.env` 或聊天消息。

## 新服务器首次部署

前提：

- 系统为 Alibaba Cloud Linux 3 或 4（RPM 版）。
- 域名 `wagaga.top` 已解析到服务器公网 IP。
- `wagaga.top`、`wedding.wagaga.top`、`db.wagaga.top` 均已解析到服务器公网 IP。
- 阿里云安全组已放行入方向 TCP 80 和 443。
- GitHub 仓库可由服务器读取；私有仓库需先配置 Deploy Key 或访问令牌。

SSH 登录服务器后执行：

```bash
sudo dnf -y install git
sudo git clone https://github.com/edricding/wgg-docker.git /opt/wgg-docker
sudo bash /opt/wgg-docker/scripts/bootstrap-alibaba-linux.sh
```

初始化脚本会安装 Docker Engine、Docker Compose 插件，设置 Docker 开机启动，并启动网站。
它还会自动配置项目使用的阿里云 ACR 镜像加速地址，避免服务器无法访问 Docker Hub。

## 以后更新网站

每次把改动推送到 GitHub 后，在服务器执行：

```bash
cd /opt/wgg-docker
sudo bash deploy.sh
```

部署脚本会依次执行：

1. 检查服务器工作区是否干净。
2. 从 `origin/main` 执行 fast-forward 更新。
3. 重新构建并启动容器。
4. 验证 MySQL、API、HTTPS 网站、后台登录页和未登录接口保护。

如果以后使用其他分支：

```bash
sudo DEPLOY_BRANCH=staging bash deploy.sh
```

## 常用维护命令

```bash
cd /opt/wgg-docker
sudo docker compose ps
sudo docker compose logs -f --tail=100 web api database
sudo docker compose restart web
```

## HTTPS 续期

手动检查并续期证书：

```bash
cd /opt/wgg-docker
sudo bash scripts/renew-https.sh
```

建议用 root 的 cron 每月运行一次该脚本。Certbot 只会在证书接近到期时真正续期。
