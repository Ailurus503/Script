const KEY = "sfexpress_cookie";

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

try {
  const cookie = getHeader($request.headers, "Cookie");

  if (!cookie) {
    console.log("[SF] 当前请求没有 Cookie");
    $done({});
    return;
  }

  const oldCookie = $persistentStore.read(KEY) || "";

  if (oldCookie === cookie) {
    console.log("[SF] 顺丰 Cookie 无变化");
  } else {
    const ok = $persistentStore.write(cookie, KEY);

    if (ok) {
      console.log("[SF] 顺丰 Cookie 已更新");

      $notification.post(
        "顺丰签到",
        "登录状态已更新",
        "已获取最新 Cookie"
      );
    } else {
      console.log("[SF] Cookie 保存失败");
    }
  }

  $done({});

} catch (e) {
  console.log("[SF] Cookie 捕获异常：" + e);
  $done({});
}