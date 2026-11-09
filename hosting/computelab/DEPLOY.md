# Host Compute Lab on your own site

This is a guide for later. Nothing in this repository uploads files or creates a database.

The coordinator is PHP 8 plus MySQL or MariaDB, which is the shared-hosting baseline. It does not need a Node process on the server. Workers on Windows and Linux open outbound HTTPS themselves, so a home router does not need a port forward.

Use a subpath such as `https://zaga.info/computelab/`. The existing site outside that folder is not part of this app. `base_path` in `config.php` must match the folder name. To use a subdomain later, set `base_path` to an empty string and point that host’s document root at `public/`.

## Files

1. In hPanel, create a MySQL database and a user that can use only that database. Note the host (often `localhost`), database name, user, and password.
2. On your computer, copy `hosting/computelab/private/config.example.php` to `config.php` inside `private/`. Set `driver` to `mysql` and fill in the database fields. Set `base_path` to `/computelab`.
3. Upload the `private` directory to the account home, **not** inside `public_html`. Example: `/home/USER/computelab-private/`.
4. Upload the **contents** of `public/` into `public_html/computelab/` so `index.php` and `.htaccess` land in that folder. Do not replace `public_html/index.html` or any other existing page.
5. Copy `spikefoundry/engine.js` and `spikefoundry/lab.html` onto the server and set `engine_js` and `lab_html` in `config.php` to those absolute paths (keep them next to `private`, not in `public_html`, if you can).
6. Create `public_html/computelab/coord-home.txt` containing one line: the absolute path of `computelab-private`. `.htaccess` denies downloads of that file. PHP can still read it.
7. From a machine with PHP and the private directory:

```
set COORD_OWNER_PASSWORD=a-long-password
php private/bin/install.php --username yourname
```

On Windows PowerShell, `$env:COORD_OWNER_PASSWORD = 'a-long-password'` before the same `php` command.

8. Open `https://zaga.info/computelab/explore` (the lab, no account), `/computelab/join` (consent and a worker token), and `/computelab/owner/login`.

If the host will not run files outside `public_html`, put `private/` at `public_html/computelab/private/` and leave `coord-home.txt` out. The front controller then uses the sibling `private` folder. The `private/.htaccess` file denies web access. Prefer the home-directory location when the plan allows it.

## What this does not need

No Node.js on the web server, no extra paid host, and no GitHub token on a volunteer machine. The plan type was not read from the Hostinger API (it was timing out). PHP 8 and MySQL are the features this uses. Pretty URLs need `AllowOverride` so `.htaccess` rewrite rules run; if rewrite is off, the explore page can still be opened as `index.php` only after the host enables rewrite for that folder.

## Worker on Windows or Linux

The git queue still runs when `BB_COORDINATOR_URL` is unset.

To use the website instead, after joining:

```
mkdir -p ~/.bugbrain
umask 077
printf '%s\n' 'THE-TOKEN-SHOWN-ONCE' > ~/.bugbrain/coordinator-token
```

Windows: save that file as `%USERPROFILE%\.bugbrain\coordinator-token`.

Set the user environment variables and restart the worker:

- `BB_COORDINATOR_URL` = `https://zaga.info/computelab`
- `BB_COORDINATOR_TOKEN_FILE` = the token file path

`run/supervisor.js` then runs `run/coord.js` instead of `run/dq.js`. The process only polls outward. It will run `spikefoundry/run.js`, `run/r42.js`, or `run/gen.js` when the template says so, and it refuses any other runner.

## Bring across old BugBrain queue rows

On a checkout of the `queue` branch, after install:

```
php private/bin/import-queue.php --dir /path/to/queue-checkout
```

Finished jobs become history. Unfinished files are marked held and are not handed to volunteers, because those files were not created from an approved template. Queue new work from the owner page.

## Local check before upload

```
php hosting/computelab/tests/api_test.php
```
