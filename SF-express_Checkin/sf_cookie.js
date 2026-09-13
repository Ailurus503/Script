const COOKIE_KEY = "sfexpress_cookie";
const SESSION_KEY = "sfexpress_sessionid";

function getHeader(headers, name) {
  if (!headers) return "";

  const target = name.toLowerCase();

  for (const key in headers) {
    if (key.toLowerCase() === target) {
      return headers[key];
    }
  }

  return "";
}

function getCookieValue(cookie, name) {
  if (!cookie) return "";

  const parts = cookie.split(";");

  for (let i = 0; i < parts.length; i++) {
    const item = parts[i].trim();
    const pos = item.indexOf("=");

    if (pos === -1) continue;

    const key = item.substring(0, pos).trim();
    const value = item.substring(pos + 1).trim();

    if (key === name) {
      return value;
    }
  }

  return "";
}

try {
  const cookie = getHeader($request.headers, "Cookie");

  if (!cookie) {
    $done({});
    return;
  }

  const sessionId = getCookieValue(cookie, "sessionId");

  // 没有 sessionId 的请求不作为有效登录状态
  if (!sessionId) {
    $done({});
    return;
  }

  const oldSessionId =
    $persistentStore.read(SESSION_KEY) || "";

  // 始终保存最新完整 Cookie
  $persistentStore.write(cookie, COOKIE_KEY);

  // sessionId 没变化：静默更新，不通知
  if (oldSessionId === sessionId) {
    console.log("[SF] Cookie 已同步，sessionId 无变化");
    $done({});
    return;
  }

  // sessionId 真正变化
  $persistentStore.write(sessionId, SESSION_KEY);

  console.log("[SF] 新登录会话已捕获");

  $notification.post(
    "顺丰签到",
    "登录状态已更新",
    "已获取新的顺丰会员登录会话"
  );

  $done({});

} catch (e) {
  console.log("[SF] Cookie 捕获异常：" + e);
  $done({});
}