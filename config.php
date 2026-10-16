<?php
/*
 * Ghost Express — server settings.
 *
 * ADMIN_PASSWORD is the first password for admin.html.
 * Change it here BEFORE uploading the site. After the first login you can
 * change it from the admin panel (كلمة المرور); the new one is stored hashed
 * in data/auth.php and this value is no longer used.
 */
const ADMIN_PASSWORD = 'GhostAdmin@2026';

/* Max submissions per visitor (IP) in 10 minutes — basic spam protection. */
const SUBMIT_LIMIT = 6;

/* Max wrong admin passwords per IP in 15 minutes before a short lock. */
const LOGIN_LIMIT = 8;
