# wagaga.top

`wagaga.top` 的 Docker 化静态网站。当前版本提供一个 Nginx 发布页，并支持在 Alibaba Cloud Linux 3/4 上一键安装、拉取更新和部署。

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
├── secrets/                 # 仅保留占位文件，真实密码不会进入 Git
├── nginx/
│   └── default.conf
├── scripts/
│   └── bootstrap-alibaba-linux.sh
├── deploy.sh
├── docker-compose.yml
└── Dockerfile
```

## 本地启动

```bash
docker compose up -d --build
```

访问 <http://localhost>，停止服务使用：

```bash
docker compose down
```

Nginx 当前提供三个站点：

- `wagaga.top`：`frontend/` 目录。
- `wedding.wagaga.top`：`wedding/` 目录。
- `db.wagaga.top`：`admin/` 目录，当前为留言管理前端演示页。

在阿里云 DNS 中为 `wagaga.top` 添加 A 记录，主机记录分别填写 `wedding` 和 `db`，记录值均填写服务器公网 IP，即可访问婚礼子站与管理后台。

> `db.wagaga.top` 当前只包含演示数据，没有连接数据库。接入真实宾客信息前必须增加登录鉴权并启用 HTTPS，避免手机号和留言被公开访问。

## MySQL 数据库

项目使用 DaoCloud 国内代理提供的 MySQL 8.4 LTS Docker Official Image，数据库数据保存在 Docker 命名卷 `mysql_data` 中。MySQL 的宿主机端口仅绑定到 `127.0.0.1:3306`，不要在阿里云安全组中开放公网 3306。

首次启用数据库时，在服务器执行：

```bash
cd /opt/wgg-docker
sudo git pull --ff-only origin main
sudo bash scripts/setup-database-secrets.sh
sudo bash deploy.sh
```

初始化后的数据库信息：

- 数据库：`wgg_wedding`
- 应用用户：`wgg_app`
- 应用密码：保存在服务器 `/opt/wgg-docker/secrets/mysql_app_password.txt`
- 数据表：`guest_submissions`

查看应用密码：

```bash
sudo cat /opt/wgg-docker/secrets/mysql_app_password.txt
```

Navicat 使用 SSH 隧道连接：

- MySQL 主机：`127.0.0.1`
- MySQL 端口：`3306`
- MySQL 用户：`wgg_app`
- SSH 主机：服务器公网 IP
- SSH 端口：`22`
- SSH 用户：服务器登录用户（当前一般为 `root`）

数据库密码文件和 Docker 数据卷都不会被 `git pull` 覆盖。不要执行 `docker compose down -v`，其中的 `-v` 会删除 MySQL 数据卷。

## 新服务器首次部署

前提：

- 系统为 Alibaba Cloud Linux 3 或 4（RPM 版）。
- 域名 `wagaga.top` 已解析到服务器公网 IP。
- 阿里云安全组已放行入方向 TCP 80。
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
4. 请求 `http://127.0.0.1/healthz` 验证网站。

如果以后使用其他分支：

```bash
sudo DEPLOY_BRANCH=staging bash deploy.sh
```

## 常用维护命令

```bash
cd /opt/wgg-docker
sudo docker compose ps
sudo docker compose logs -f --tail=100 web
sudo docker compose restart web
```

## 下一阶段

当前只启用 HTTP。准备启用 HTTPS 时，可以在现有结构中加入 Certbot，或者改用 Caddy 自动签发和续期证书。
