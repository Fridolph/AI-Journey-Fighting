# Nginx

高性能的 HTTP 服务器和反向代理。在前端转全栈的开发场景里，Nginx 主要做三件事：**静态文件服务**、**反向代理**、**负载均衡**。

## 为什么需要

部署 NestJS 或 Next.js 应用时，不直接让 Node 进程暴露在公网。Nginx 在最前面接请求，转发给后面的 Node 服务——这样 Node 挂了不会直接暴露，HTTPS 证书配在 Nginx 上就行。

## 基础配置

### 静态文件

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        root /var/www/dist;
        index index.html;
        try_files $uri $uri/ /index.html;  # SPA 路由兜底
    }
}
```

### 反向代理

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

把 `api.example.com` 的请求转发到本地 3000 端口（NestJS 应用）。

### HTTPS

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location / {
        proxy_pass http://localhost:3000;
    }
}

# HTTP 自动跳转 HTTPS
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}
```

## Docker Compose 集成

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - nest-app
```

## 常用命令

```bash
nginx -t                    # 检查配置语法
nginx -s reload             # 热重载配置
docker exec nginx nginx -s reload  # 容器内重载
```

## 进阶

### 负载均衡

```nginx
upstream backend {
    server localhost:3000;
    server localhost:3001;
    server localhost:3002;
}

server {
    location / {
        proxy_pass http://backend;
    }
}
```

### Gzip 压缩

```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript;
gzip_min_length 1000;
```

### 缓存策略

```nginx
location /static/ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}

location /api/ {
    proxy_pass http://localhost:3000;
    add_header Cache-Control "no-store";
}
```

### 常见问题

| 问题 | 修复 |
|------|------|
| 502 Bad Gateway | 后端服务没起或端口不对 |
| 413 Request Entity Too Large | 加 `client_max_body_size 50m;` |
| CORS 跨域 | 在 Nginx 层加 `add_header Access-Control-Allow-Origin *;` |
| WebSocket 不通 | 加 `proxy_set_header Upgrade $http_upgrade;` |

---

## 参考资源

- [Nginx 官方文档](https://nginx.org/en/docs/)
- [Nginx 配置指南](https://www.digitalocean.com/community/tools/nginx)

