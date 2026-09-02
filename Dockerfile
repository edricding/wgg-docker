FROM m.daocloud.io/docker.io/library/nginx:alpine

COPY nginx-gzip.conf /etc/nginx/conf.d/00-gzip.conf

COPY nginx/default.conf /etc/nginx/site-templates/bootstrap.conf
COPY nginx/http-redirect.conf /etc/nginx/site-templates/http-redirect.conf
COPY nginx/https.conf /etc/nginx/site-templates/https.conf
COPY nginx/20-enable-https.sh /docker-entrypoint.d/20-enable-https.sh
RUN chmod 755 /docker-entrypoint.d/20-enable-https.sh
COPY frontend/ /usr/share/nginx/html/
COPY wedding/ /usr/share/nginx/wedding/
COPY admin/ /usr/share/nginx/admin/

EXPOSE 80 443

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
