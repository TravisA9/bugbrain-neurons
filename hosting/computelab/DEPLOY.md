# Host Compute Lab on your own site

This is a guide for later. Nothing in this repository uploads files or creates a database.

The coordinator is PHP plus MySQL or MariaDB. The live site is PHP 7.4.33, and this code stays compatible with that version. It does not need a Node process on the server. Workers on Windows and Linux open outbound HTTPS themselves, so a home router does not need a port forward.

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

## Update an existing database

Tables that are already on the server stay in place. The first page or API request runs the upgrade, and you can run the same step by hand from the private directory:

```
php bin/upgrade.php
```

That adds missing columns and does not delete rows. Running it again is safe. The columns are `attempts`, `last_error`, `not_before`, and `last_worker` on `jobs`; `family` on `projects`; `participant_id` on `workers`; `started_at` and `progress` on `leases`; and `seconds` on `results`. In `config.php`, `max_attempts` defaults to 3 when the key is omitted: after that many errors or expired leases the job is held on the owner page until you requeue it. `public_url` is the address written into the setup download. `worker_ref` is the git branch that download fetches. It must contain `run/coord.js`.

Copy the updated files under `private/` and `public/index.php` before that first request, so this version is what performs the upgrade. `public/index.php` belongs in `public_html/computelab/`. Everything else under `private/` belongs in the private directory (`public_html/computelab/private/` when that is where the app lives).

If the host will not run files outside `public_html`, put `private/` at `public_html/computelab/private/` and leave `coord-home.txt` out. The front controller then uses the sibling `private` folder. The `private/.htaccess` file denies web access. Prefer the home-directory location when the plan allows it.

## What this does not need

No Node.js on the web server, no extra paid host, and no GitHub token on a volunteer machine. The plan type was not read from the Hostinger API (it was timing out). PHP 7.4 and MySQL are the features this uses. Pretty URLs need `AllowOverride` so `.htaccess` rewrite rules run; if rewrite is off, the explore page can still be opened as `index.php` only after the host enables rewrite for that folder.

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

`run/supervisor.js` then runs `run/coord.js` instead of `run/dq.js`. The process only polls outward. It will run `spikefoundry/run.js`, `run/r42.js`, or `run/gen.js` when the template says so, and it refuses any other runner. While a job runs it sends a heartbeat about every 60 seconds, inside the 900 second lease, so a long job stays with that computer. Pause lets the current job finish and then takes nothing new. A revoked token or a lost lease stops the job and does not submit a result. A network error or an HTTP 500 waits and retries, with the wait doubling up to about 5 minutes, and the process stays up.

Update the worker checkout when you deploy this coordinator. The heartbeat behavior lives in `run/coord.js` on the computer, not only on the server.

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
