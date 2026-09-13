const KEY = "sfexpress_cookie";
const UPDATE_KEY = "sfexpress_cookie_update_time";

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

function hasUsefulCookie(cookie) {
  if (!cookie) return false;

  return (
    cookie.indexOf("sessionId=") !== -1 ||
    cookie.indexOf("JSESSIONID=") !== -1
  );
}

try {
  const cookie = getHeader($request.headers, "Cookie");

  if (!hasUsefulCookie(cookie)) {
    $done({});
    return;
  }

  const oldCookie = $persistentStore.read(KEY) || "";

  if (oldCookie === cookie) {
    console.log("[SF] Cookie 无变化");
    $done({});
    return;
  }

  const ok = $persistentStore.write(cookie, KEY);

  if (!ok) {
    console.log("[SF] Cookie 保存失败");
    $done({});
    return;
  }

  const now = String(Date.now());
  $persistentStore.write(now, UPDATE_KEY);

  console.log("[SF] Cookie 已更新");

  $notification.post(
    "顺丰签到",
    "登录状态已更新",
    "已获取新的顺丰会员登录状态"
  );

  $done({});

} catch (e) {
  console.log("[SF] Cookie 捕获异常：" + e);
  $done({});
}