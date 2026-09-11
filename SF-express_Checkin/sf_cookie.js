/*
 * 顺丰签到 Cookie 捕获
 * Loon HTTP Request Script
 *
 * 只负责：
 * 1. 从 Request Cookie 获取 sessionId
 * 2. 保存到 Loon 持久化存储
 * 3. sessionId 变化时通知
 *
 * 不修改任何请求内容
 */

const KEY = "sfexpress_sessionid";

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

function getCookieValue(cookie, name) {
    if (!cookie) return "";

    const regex = new RegExp(
        "(?:^|;\\s*)" + name + "=([^;]+)",
        "i"
    );

    const match = cookie.match(regex);

    return match ? match[1] : "";
}

try {

    /*
     * 读取 Request Cookie
     */

    const cookie = getHeader(
        $request.headers,
        "Cookie"
    );

    if (!cookie) {

        console.log(
            "[SF] 当前请求没有 Cookie"
        );

        $done({});

    } else {

        /*
         * 提取 sessionId
         */

        const sessionId = getCookieValue(
            cookie,
            "sessionId"
        );

        if (!sessionId) {

            console.log(
                "[SF] 当前 Cookie 中没有 sessionId"
            );

            $done({});

        } else {

            /*
             * 读取旧值
             */

            const oldSessionId =
                $persistentStore.read(KEY) || "";

            /*
             * sessionId 没变化
             */

            if (oldSessionId === sessionId) {

                console.log(
                    "[SF] sessionId 无变化"
                );

                $done({});

            } else {

                /*
                 * 保存新 sessionId
                 */

                const success =
                    $persistentStore.write(
                        sessionId,
                        KEY
                    );

                if (success) {

                    console.log(
                        "[SF] sessionId 已更新"
                    );

                    $notification.post(
                        "顺丰签到",
                        "登录状态已更新",
                        "已获取新的 sessionId"
                    );

                } else {

                    console.log(
                        "[SF] sessionId 保存失败"
                    );
                }

                $done({});
            }
        }
    }

} catch (error) {

    console.log(
        "[SF] Cookie捕获异常：" +
        String(error)
    );

    /*
     * 即使脚本异常，也不修改/阻断顺丰原始请求
     */

    $done({});
}