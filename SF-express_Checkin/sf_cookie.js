/*
 * 顺丰签到 Cookie 捕获
 * Loon HTTP Request Script
 *
 * 仅建议匹配：
 * https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/
 * ~memberNonactivity~integralSignV2Service~...
 *
 * 功能：
 * - 保存该签到服务真实请求携带的完整 Cookie
 * - 不修改原始请求
 * - 不输出 Cookie 内容到日志
 */

const KEY = "sfexpress_cookie";

function getHeader(headers, name) {
    if (!headers) return "";

    const target = name.toLowerCase();

    for (const key in headers) {
        if (key.toLowerCase() === target) {
            return String(headers[key] || "");
        }
    }

    return "";
}

try {

    const cookie = getHeader(
        $request.headers,
        "Cookie"
    );

    if (!cookie) {

        console.log(
            "[SF] 当前签到请求没有 Cookie"
        );

        $done({});

    } else {

        const oldCookie =
            $persistentStore.read(KEY) || "";

        if (oldCookie === cookie) {

            console.log(
                "[SF] 顺丰签到 Cookie 无变化"
            );

        } else {

            const ok =
                $persistentStore.write(
                    cookie,
                    KEY
                );

            if (ok) {

                console.log(
                    "[SF] 顺丰签到 Cookie 已更新"
                );

                $notification.post(
                    "顺丰签到",
                    "登录状态已更新",
                    "已获取签到接口最新 Cookie"
                );

            } else {

                console.log(
                    "[SF] Cookie 保存失败"
                );
            }
        }

        $done({});
    }

} catch (e) {

    console.log(
        "[SF] Cookie捕获异常：" +
        String(e)
    );

    $done({});
}