# Bespin local development

The local feed app uses the newer MariaDB pod on Bespin.

- Bespin pod: `wcarankings-sql-mariadb`
- Bespin MariaDB port: `127.0.0.1:3307` on Bespin
- Local relay: `127.0.0.1:13312`
- App: `http://localhost:3000`

The local app reaches the pod through an SSH relay. Docker Desktop is not the
database source for this workflow. Do not refresh or change the Bespin data
when starting the app.
