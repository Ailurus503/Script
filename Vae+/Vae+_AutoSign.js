/*
 * ========================================
 * Vae+ 自动签到 Final
 * 适用：Loon
 * ========================================
 *
 * 前置：
 * Vae_GetAuth.js 已成功捕获签到请求
 *
 * 读取：
 * VAE_SIGN_REQUEST
 *
 * 功能：
 * - 自动重放签到请求
 * - 判断今日签到状态
 * - 显示连续签到 / 累计签到 / 排名
 * - 鉴权失效提醒
 * - 网络及服务器异常提醒
 * - 支持 cron 定时执行
 */

const STORE_KEY = "VAE_SIGN_REQUEST";

function log(message) {
    console.log("[Vae+ AutoSign] " + message);
}

function notify(subtitle, message) {
    try {
        $notification.post(
            "Vae+",
            subtitle || "",
            message || ""
        );
    } catch (e) {
        log("通知失败：" + e);
    }
}

function parseJSON(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

function cleanHeaders(headers) {

    const result = {};

    if (!headers) {
        return result;
    }

    for (const key in headers) {

        const lower = key.toLowerCase();

        // 这些 Header 让 Loon 自动重新生成
        if (
            lower === "content-length" ||
            lower === "host" ||
            lower === "connection" ||
            lower === "accept-encoding"
        ) {
            continue;
        }

        result[key] = headers[key];
    }

    return result;
}

function findSignRecord(obj, depth) {

    depth = depth || 0;

    if (!obj || depth > 10) {
        return null;
    }

    if (typeof obj !== "object") {
        return null;
    }

    if (
        obj.signRecord &&
        typeof obj.signRecord === "object"
    ) {
        return obj.signRecord;
    }

    for (const key in obj) {

        const value = obj[key];

        if (
            value &&
            typeof value === "object"
        ) {

            const found = findSignRecord(
                value,
                depth + 1
            );

            if (found) {
                return found;
            }
        }
    }

    return null;
}

function shortText(text, maxLength) {

    text = String(text || "");

    maxLength = maxLength || 160;

    if (text.length <= maxLength) {
        return text;
    }

    return text.substring(0, maxLength) + "...";
}

function authExpired(reason) {

    notify(
        "签到鉴权失效 ⚠️",
        (reason || "服务器拒绝了签到请求") +
        "\n\n请打开一次 Vae+ → 发现 → 每日签到，脚本会自动刷新鉴权。"
    );
}

function handleResponse(response, body) {

    const status =
        response && response.status
            ? Number(response.status)
            : 0;

    log("HTTP Status: " + status);
    log("Response: " + shortText(body, 500));

    // HTTP 鉴权错误
    if (
        status === 401 ||
        status === 403
    ) {

        authExpired(
            "HTTP " + status
        );

        $done();
        return;
    }

    // HTTP 异常
    if (
        status < 200 ||
        status >= 300
    ) {

        notify(
            "自动签到请求异常 ❌",
            "HTTP " + status +
            "\n\n" +
            shortText(body)
        );

        $done();
        return;
    }

    const json = parseJSON(body);

    if (!json) {

        notify(
            "自动签到返回异常 ❌",
            "服务器返回内容无法解析\n\n" +
            shortText(body)
        );

        $done();
        return;
    }

    // Vae+ 网关返回失败
    if (json.state === false) {

        const message =
            json.errMsg ||
            json.message ||
            json.msg ||
            "服务器返回 state=false";

        const lower =
            String(message).toLowerCase();

        const authError =
            lower.includes("token") ||
            lower.includes("auth") ||
            lower.includes("login") ||
            lower.includes("session") ||
            lower.includes("expired") ||
            lower.includes("invalid") ||
            lower.includes("登录") ||
            lower.includes("鉴权") ||
            lower.includes("失效") ||
            lower.includes("过期");

        if (authError) {

            authExpired(message);

        } else {

            notify(
                "自动签到失败 ❌",
                message
            );
        }

        $done();
        return;
    }

    // 查找 signRecord
    const signRecord =
        findSignRecord(json);

    if (!signRecord) {

        notify(
            "签到请求已执行 ⚠️",
            "服务器已接受请求，但没有找到签到状态。\n\n" +
            shortText(body)
        );

        $done();
        return;
    }

    const signed =
        signRecord.signToday === true ||
        signRecord.signToday === 1 ||
        String(signRecord.signToday)
            .toLowerCase() === "true";

    const continuity =
        signRecord.continuity !== undefined
            ? signRecord.continuity
            : "未知";

    const total =
        signRecord.totalCount !== undefined
            ? signRecord.totalCount
            : "未知";

    const rank =
        signRecord.rank !== undefined
            ? signRecord.rank
            : "未知";

    if (signed) {

        notify(
            "自动签到成功 ✅",
            "今日状态：已签到\n" +
            "连续签到：" + continuity + " 天\n" +
            "累计签到：" + total + " 天\n" +
            "签到排名：" + rank
        );

        log(
            "签到成功 | 连续 " +
            continuity +
            " 天 | 累计 " +
            total +
            " 天"
        );

    } else {

        notify(
            "自动签到未完成 ⚠️",
            "服务器仍显示今日未签到\n\n" +
            "连续签到：" + continuity + " 天\n" +
            "累计签到：" + total + " 天"
        );

        log("服务器返回 signToday=false");
    }

    $done();
}

function start() {

    const stored =
        $persistentStore.read(STORE_KEY);

    if (!stored) {

        notify(
            "无法自动签到 ⚠️",
            "没有找到签到鉴权。\n\n" +
            "请先打开 Vae+ → 发现 → 每日签到。"
        );

        $done();
        return;
    }

    const request =
        parseJSON(stored);

    if (
        !request ||
        !request.url
    ) {

        notify(
            "签到模板异常 ⚠️",
            "持久化签到数据无法读取。\n\n" +
            "请重新打开 Vae+ 刷新鉴权。"
        );

        $done();
        return;
    }

    const method =
        String(
            request.method || "GET"
        ).toUpperCase();

    const options = {

        url: request.url,

        headers: cleanHeaders(
            request.headers || {}
        )
    };

    if (
        method === "POST" ||
        method === "PUT" ||
        method === "PATCH"
    ) {

        options.body =
            request.body || "";
    }

    log("开始执行自动签到");
    log("Method: " + method);
    log("URL: " + request.url);
    log(
        "Action: " +
        (request.action || "unknown")
    );

    const callback =
        function(error, response, body) {

            if (error) {

                log(
                    "网络请求失败：" +
                    error
                );

                notify(
                    "自动签到网络失败 ❌",
                    String(error)
                );

                $done();
                return;
            }

            handleResponse(
                response,
                body || ""
            );
        };

    if (method === "POST") {

        $httpClient.post(
            options,
            callback
        );

    } else {

        $httpClient.get(
            options,
            callback
        );
    }
}

try {

    start();

} catch (e) {

    log(
        "脚本异常：" +
        e
    );

    notify(
        "自动签到脚本异常 ❌",
        String(e)
    );

    $done();
}
