/*
 * 顺丰会员签到 - sessionId 自动捕获
 * 仅保存 mcs-mimp-web.sf-express.com 的 sessionId。
 */

const KEY = "sfexpress_sessionid";

function getHeader(headers, name) {
  if (!headers) return "";
  const target = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) return String(headers[k] || "");
  }
  return "";
}

function getCookieValue(cookie, name) {
  const m = String(cookie || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)", "i"));
  return m ? m[1] : "";
}

try {
  const cookie = getHeader($request.headers, "Cookie");
  const sid = getCookieValue(cookie, "sessionId");

  if (!sid) {
    console.log("[SF] 未在本次请求中发现 sessionId");
    $done({});
  } else {
    const old = $persistentStore.read(KEY) || "";
    const ok = $persistentStore.write(sid, KEY);

    if (ok && sid !== old) {
      console.log("[SF] sessionId 已更新");
      $notification.post("顺丰签到", "登录凭据已更新", "已捕获新的 sessionId");
    } else if (ok) {
      console.log("[SF] sessionId 未变化");
    } else {
      console.log("[SF] sessionId 保存失败");
    }
    $done({});
  }
} catch (e) {
  console.log("[SF] 捕获异常: " + e);
  $done({});
}
