# wagaga.top

`wagaga.top` 的 Docker 化静态网站。当前版本提供一个 Nginx 发布页，并支持在 Alibaba Cloud Linux 3/4 上一键安装、拉取更新和部署。

## 目录结构

```text
.
├── frontend/
│   └── index.html
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
