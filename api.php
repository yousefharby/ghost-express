<?php
/*
 * Ghost Express — tiny JSON API for the website (no database needed).
 * Stores sign-up requests, contact messages, prices and site settings as
 * JSON inside data/*.php files (each starts with an exit guard, so the
 * files can't be read from the browser even without .htaccess).
 */
declare(strict_types=1);

require __DIR__ . '/config.php';

const DATA_DIR = __DIR__ . '/data';
const KINDS = ['registrations', 'messages'];
const GUARD = "<?php http_response_code(404); exit; ?>\n";

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

/* Sessions only for the admin, so normal visitors get no cookie. */
function sess(): void
{
    static $started = false;
    if ($started) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('gx_admin');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
    $started = true;
}

/* ---------- helpers ---------- */
function out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode(['ok' => $code < 400] + $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $msg, int $code = 400, string $err = 'error'): void
{
    out(['error' => $msg, 'code' => $err], $code);
}
function body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > 200000) fail('البيانات أكبر من المسموح.', 413);
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}
function path_of(string $name): string
{
    return DATA_DIR . '/' . $name . '.php';
}
function load(string $name, $default)
{
    $f = path_of($name);
    if (!is_file($f)) return $default;
    $raw = (string) file_get_contents($f);
    $json = strpos($raw, GUARD) === 0 ? substr($raw, strlen(GUARD)) : $raw;
    $v = json_decode($json, true);
    return $v === null ? $default : $v;
}
function save(string $name, $value): void
{
    if (!is_dir(DATA_DIR) && !mkdir(DATA_DIR, 0755, true)) fail('مش قادرين ننشئ فولدر data على السيرفر.', 500);
    $f = path_of($name);
    $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if (file_put_contents($tmp, GUARD . $json, LOCK_EX) === false || !rename($tmp, $f)) {
        @unlink($tmp);
        fail('مش قادرين نحفظ على السيرفر. اتأكد إن فولدر data ليه صلاحية كتابة.', 500);
    }
}
/* Serialize read-modify-write on the data files. */
function locked(callable $fn)
{
    if (!is_dir(DATA_DIR)) @mkdir(DATA_DIR, 0755, true);
    $h = fopen(DATA_DIR . '/.lock', 'c');
    if ($h === false) return $fn();
    flock($h, LOCK_EX);
    try { return $fn(); } finally { flock($h, LOCK_UN); fclose($h); }
}
function clean($v, int $max = 300): string
{
    $s = is_scalar($v) ? (string) $v : '';
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
    $s = trim(strip_tags($s));
    return mb_substr($s, 0, $max);
}
function digits(string $s): string
{
    $s = strtr($s, ['٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9']);
    return preg_replace('/\D/', '', $s) ?? '';
}
function mobile(string $s): string
{
    $d = digits($s);
    if (strpos($d, '0020') === 0) $d = '0' . substr($d, 4);
    elseif (strpos($d, '20') === 0 && strlen($d) === 12) $d = '0' . substr($d, 2);
    return preg_match('/^01[0125]\d{8}$/', $d) ? $d : '';
}
function url_ok(string $u): string
{
    $u = trim($u);
    if ($u === '') return '';
    return preg_match('#^https?://[^\s<>"\'`]+$#i', $u) ? mb_substr($u, 0, 500) : '';
}
function ip(): string
{
    return substr(hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '0') . __DIR__), 0, 24);
}
function throttle(string $bucket, int $limit, int $window): bool
{
    return locked(function () use ($bucket, $limit, $window) {
        $all = load('throttle', []);
        $now = time();
        foreach ($all as $k => $times) {
            $all[$k] = array_values(array_filter((array) $times, fn($t) => $t > $now - 3600));
            if (!$all[$k]) unset($all[$k]);
        }
        $key = $bucket . ':' . ip();
        $recent = array_filter($all[$key] ?? [], fn($t) => $t > $now - $window);
        if (count($recent) >= $limit) { save('throttle', $all); return false; }
        $all[$key][] = $now;
        save('throttle', $all);
        return true;
    });
}
function is_admin(): bool
{
    if (empty($_COOKIE['gx_admin'])) return false;
    sess();
    return !empty($_SESSION['gx_admin']);
}
function require_admin(bool $write = false): void
{
    if (!is_admin()) fail('لازم تدخل كلمة المرور الأول.', 401, 'auth');
    if ($write) {
        $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($sent) || !hash_equals($_SESSION['csrf'] ?? '', $sent)) fail('الجلسة خلصت. ادخل كلمة المرور تاني.', 401, 'auth');
    }
}
function check_password(string $p): bool
{
    $auth = load('auth', null);
    if (is_array($auth) && !empty($auth['hash'])) return password_verify($p, $auth['hash']);
    return hash_equals(ADMIN_PASSWORD, $p);
}

/* ---------- validation of saved content ---------- */
const SETTING_KEYS = ['phone', 'whatsapp', 'email', 'address', 'mapsUrl', 'hours', 'facebook', 'instagram', 'tiktok', 'systemUrl', 'trackUrl', 'androidUrl', 'iosUrl', 'courierUrl'];
const URL_KEYS = ['mapsUrl', 'facebook', 'instagram', 'tiktok', 'systemUrl', 'trackUrl', 'androidUrl', 'iosUrl', 'courierUrl'];
const TIERS = ['bronze', 'silver', 'gold', 'ghost'];
const ZONES = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'];

function clean_settings($in): array
{
    $in = is_array($in) ? $in : [];
    $s = [];
    foreach (SETTING_KEYS as $k) {
        $v = clean($in[$k] ?? '', 500);
        if (in_array($k, URL_KEYS, true)) $v = url_ok($v);
        if ($k === 'phone') $v = preg_replace('/[^\d+]/', '', strtr($v, ['٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9'])) ?? '';
        if ($k === 'whatsapp') $v = mobile($v);
        if ($k === 'email' && $v !== '' && !filter_var($v, FILTER_VALIDATE_EMAIL)) $v = '';
        $s[$k] = $v;
    }
    $s['stats'] = [];
    foreach (array_slice(is_array($in['stats'] ?? null) ? $in['stats'] : [], 0, 4) as $st) {
        $s['stats'][] = ['value' => clean($st['value'] ?? '', 30), 'label' => clean($st['label'] ?? '', 80)];
    }
    return $s;
}
function clean_prices($in): array
{
    $in = is_array($in) ? $in : [];
    $tiers = [];
    foreach ((array) ($in['tiers'] ?? []) as $t) {
        if (!is_array($t) || !in_array($t['id'] ?? '', TIERS, true)) continue;
        $tiers[] = ['id' => $t['id'], 'name' => clean($t['name'] ?? '', 40), 'range' => clean($t['range'] ?? '', 60)];
    }
    $zones = [];
    foreach ((array) ($in['zones'] ?? []) as $z) {
        if (!is_array($z) || !in_array($z['id'] ?? '', ZONES, true)) continue;
        $prices = [];
        foreach (TIERS as $tid) {
            $v = $z['prices'][$tid] ?? null;
            if (is_numeric($v) && $v >= 0 && $v < 100000) $prices[$tid] = round((float) $v, 2);
        }
        $zones[] = ['id' => $z['id'], 'name' => clean($z['name'] ?? '', 60), 'time' => clean($z['time'] ?? '', 40), 'prices' => $prices];
    }
    $notes = [];
    foreach (array_slice((array) ($in['notes'] ?? []), 0, 12) as $n) {
        $n = clean($n, 300);
        if ($n !== '') $notes[] = $n;
    }
    if (count($tiers) !== count(TIERS) || count($zones) !== count(ZONES)) fail('بيانات الأسعار ناقصة.');
    return ['tiers' => $tiers, 'zones' => $zones, 'notes' => $notes];
}
function clean_submission(string $kind, $d): array
{
    $d = is_array($d) ? $d : [];
    if ($kind === 'registrations') {
        $item = [
            'name' => clean($d['name'] ?? '', 120),
            'phone' => mobile((string) ($d['phone'] ?? '')),
            'whatsapp' => mobile((string) ($d['whatsapp'] ?? '')),
            'email' => clean($d['email'] ?? '', 160),
            'store' => clean($d['store'] ?? '', 160),
            'page' => clean($d['page'] ?? '', 300),
            'volume' => clean($d['volume'] ?? '', 80),
            'category' => clean($d['category'] ?? '', 80),
            'governorate' => clean($d['governorate'] ?? '', 80),
            'area' => clean($d['area'] ?? '', 120),
            'address' => clean($d['address'] ?? '', 300),
            'notes' => clean($d['notes'] ?? '', 1500),
        ];
        if ($item['email'] !== '' && !filter_var($item['email'], FILTER_VALIDATE_EMAIL)) $item['email'] = '';
        if ($item['name'] === '' || $item['phone'] === '' || $item['store'] === '') fail('اكتب الاسم ورقم موبايل صحيح واسم المتجر.');
    } else {
        $item = [
            'name' => clean($d['name'] ?? '', 120),
            'phone' => mobile((string) ($d['phone'] ?? '')),
            'type' => clean($d['type'] ?? '', 80),
            'message' => clean($d['message'] ?? '', 3000),
        ];
        if ($item['name'] === '' || $item['phone'] === '' || mb_strlen($item['message']) < 5) fail('اكتب الاسم ورقم موبايل صحيح والرسالة.');
    }
    return $item;
}

/* ---------- routes ---------- */
$action = (string) ($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'POST' && stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) fail('Content-Type غير مدعوم.', 415);

switch ($action) {
    case 'config':
        out(['settings' => load('settings', null), 'prices' => load('prices', null)]);

    case 'submit':
        if ($method !== 'POST') fail('Method not allowed', 405);
        $b = body();
        if (!empty($b['website'])) out(['id' => 'ok']); // honeypot: pretend success
        $kind = (string) ($b['kind'] ?? '');
        if (!in_array($kind, KINDS, true)) fail('نوع الطلب مش معروف.');
        $item = clean_submission($kind, $b['data'] ?? []);
        if (!throttle('submit', SUBMIT_LIMIT, 600)) fail('بعت طلبات كتير ورا بعض. استنى شوية وجرب تاني، أو كلمنا على واتساب.', 429, 'rate');
        $id = date('ymd') . '-' . bin2hex(random_bytes(4));
        locked(function () use ($kind, $item, $id) {
            $items = load($kind, []);
            array_unshift($items, ['id' => $id, 'createdAt' => gmdate('c'), 'status' => 'new'] + $item);
            save($kind, array_slice($items, 0, 5000));
        });
        out(['id' => $id]);

    case 'login':
        if ($method !== 'POST') fail('Method not allowed', 405);
        if (!throttle('login', LOGIN_LIMIT, 900)) fail('محاولات كتير غلط. استنى 15 دقيقة وجرب تاني.', 429, 'rate');
        $p = (string) (body()['password'] ?? '');
        if ($p === '' || !check_password($p)) fail('كلمة المرور مش صحيحة.', 401, 'bad_password');
        sess();
        session_regenerate_id(true);
        $_SESSION['gx_admin'] = true;
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
        out(['csrf' => $_SESSION['csrf']]);

    case 'me':
        out(['admin' => is_admin(), 'csrf' => is_admin() ? ($_SESSION['csrf'] ?? null) : null]);

    case 'logout':
        if (!empty($_COOKIE['gx_admin'])) {
            sess();
            $_SESSION = [];
            session_destroy();
            setcookie('gx_admin', '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict']);
        }
        out([]);

    case 'list':
        require_admin();
        $kind = (string) ($_GET['kind'] ?? '');
        if (!in_array($kind, KINDS, true)) fail('نوع مش معروف.');
        out(['items' => load($kind, [])]);

    case 'update':
        require_admin(true);
        $b = body();
        $kind = (string) ($b['kind'] ?? '');
        $id = (string) ($b['id'] ?? '');
        $status = (string) ($b['patch']['status'] ?? '');
        $allowed = $kind === 'registrations' ? ['new', 'contacted', 'active', 'rejected'] : ['new', 'read', 'done'];
        if (!in_array($kind, KINDS, true) || !in_array($status, $allowed, true)) fail('تحديث مش صحيح.');
        $found = locked(function () use ($kind, $id, $status) {
            $items = load($kind, []);
            $found = false;
            foreach ($items as &$it) {
                if (($it['id'] ?? '') === $id) { $it['status'] = $status; $it['updatedAt'] = gmdate('c'); $found = true; }
            }
            unset($it);
            if ($found) save($kind, $items);
            return $found;
        });
        if (!$found) fail('العنصر مش موجود. اعمل تحديث للصفحة.', 404);
        out([]);

    case 'delete':
        require_admin(true);
        $b = body();
        $kind = (string) ($b['kind'] ?? '');
        $id = (string) ($b['id'] ?? '');
        if (!in_array($kind, KINDS, true)) fail('نوع مش معروف.');
        locked(function () use ($kind, $id) {
            $items = array_values(array_filter(load($kind, []), fn($it) => ($it['id'] ?? '') !== $id));
            save($kind, $items);
        });
        out([]);

    case 'save_settings':
        require_admin(true);
        $s = clean_settings(body()['settings'] ?? []);
        if (!preg_match('/^\+?\d{8,13}$/', $s['phone'])) fail('رقم التليفون مش صحيح.');
        locked(fn() => save('settings', $s));
        out(['settings' => $s]);

    case 'save_prices':
        require_admin(true);
        $p = clean_prices(body()['prices'] ?? []);
        locked(fn() => save('prices', $p));
        out(['prices' => $p]);

    case 'password':
        require_admin(true);
        $b = body();
        $cur = (string) ($b['current'] ?? '');
        $next = (string) ($b['next'] ?? '');
        if (!check_password($cur)) fail('كلمة المرور الحالية مش صحيحة.', 400, 'bad_password');
        if (mb_strlen($next) < 8) fail('كلمة المرور الجديدة لازم تبقى 8 حروف أو أرقام على الأقل.');
        locked(fn() => save('auth', ['hash' => password_hash($next, PASSWORD_DEFAULT), 'changedAt' => gmdate('c')]));
        out([]);

    default:
        fail('Unknown action', 404);
}
