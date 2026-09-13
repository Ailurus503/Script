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

  const oldCookie = $persistentStore.read(KEY);

  // 已经存在 Cookie，不再覆盖
  if (oldCookie) {
    console.log("[SF] 已存在 Cookie，本次不覆盖");
    $done({});
    return;
  }

  const ok = $persistentStore.write(cookie, KEY);

  if (ok) {
    console.log("[SF] 首次 Cookie 捕获成功");

    $notification.post(
      "顺丰签到",
      "Cookie 捕获成功",
      "已锁定首次有效登录状态"
    );
  } else {
    console.log("[SF] Cookie 保存失败");
  }

  $done({});

} catch (e) {
  console.log("[SF] Cookie 捕获异常：" + e);
  $done({});
}