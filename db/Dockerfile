FROM postgres:16-alpine
COPY init-from-backup.sh /docker-entrypoint-initdb.d/init-from-backup.sh
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /docker-entrypoint-initdb.d/init-from-backup.sh /usr/local/bin/backup.sh
