/** Env var *names* that look like they hold something sensitive - broad
 * and case-insensitive on purpose (a false positive just means one extra
 * click to reveal a harmless value; a false negative means a real secret
 * sits in the clear on screen by default). Matches on the key only, never
 * the value - a value can't un-look-sensitive a key named `API_TOKEN`. */
const SECRET_KEY_PATTERN = /PASSWORD|SECRET|TOKEN|KEY|SHA|CREDENTIAL/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

/** Env var names known to come from a base image's own build (interpreter/
 * package-manager provenance, build flags, install paths) rather than
 * something the image's own application config set - "Environnement
 * système" vs. "Config applicative" in the image detail view. Compiled
 * from the base images actually pulled/built in this project (busybox
 * base-image, python:3.12-alpine, mysql:8.0, phpmyadmin's php-apache
 * base) - inherently a whitelist, not a rule: extend it as other base
 * images show up, rather than trying to guess a general pattern. */
const SYSTEM_ENV_KEYS = new Set([
  "PATH",
  "LANG",
  "LANGUAGE",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "HOME",
  "HOSTNAME",
  "TZ",
  "container",
  // python:3.12-alpine
  "GPG_KEY",
  "PYTHON_VERSION",
  "PYTHON_SHA256",
  "PYTHON_PIP_VERSION",
  "PYTHON_GET_PIP_URL",
  "PYTHON_GET_PIP_SHA256",
  // mysql:8.0
  "GOSU_VERSION",
  "MYSQL_MAJOR",
  "MYSQL_VERSION",
  "MYSQL_SHELL_VERSION",
  // phpmyadmin (php-apache base + its own install script)
  "PHPIZE_DEPS",
  "PHP_INI_DIR",
  "PHP_CFLAGS",
  "PHP_CPPFLAGS",
  "PHP_LDFLAGS",
  "PHP_VERSION",
  "PHP_URL",
  "PHP_ASC_URL",
  "PHP_SHA256",
  "APACHE_CONFDIR",
  "APACHE_ENVVARS",
  "GPG_KEYS",
  "UPLOAD_PROGRESS_EXT_URL",
  "UPLOAD_PROGRESS_SHA256",
  "PMA_SSL_DIR",
  "MAX_EXECUTION_TIME",
  "MEMORY_LIMIT",
  "UPLOAD_LIMIT",
  "SESSION_SAVE_PATH",
  "VERSION",
  "SHA256",
  "URL",
]);

export function isSystemEnvKey(key: string): boolean {
  return SYSTEM_ENV_KEYS.has(key);
}
