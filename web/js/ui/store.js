// 브라우저에만 남기는 설정. 저장이 막힌 곳(사생활 보호 창 등)에서도 앱은 그대로 돈다.

const PREFIX = "grid.";

export function load(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 저장 못 해도 괜찮다 */
  }
}
