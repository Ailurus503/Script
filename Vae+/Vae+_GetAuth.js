/*
 * Vae+ 签到请求捕获脚本
 * Vae_GetAuth.js
 *
 * 类型：http-response
 *
 * URL 正则：
 * ^https:\/\/api1\.starfans\.com\/auth\/
 *
 * 必须开启：
 * - 需要响应 Body
 *
 * 功能：
 * 1. 捕获 /USER_HOME/getRecord.json
 *    保存为 VAE_STATUS_REQUEST
 *
 * 2. 捕获 /USER_HOME/getRecordByMonth.json
 *    保存为 VAE_SIGN_REQUEST
 *
 * 自动签到脚本会使用这两个请求模板。
 */

const STATUS_KEY = "VAE_STATUS_REQUEST";
const SIGN_KEY = "VAE_SIGN_REQUEST";

function log(msg) {
    console.log("[Vae+ Auth] " + msg);
}

function notify(title, subtitle, body) {
    if (typeof $notification !== "undefined") {
        $notification.post(
            title || "",
            subtitle || "",
            body || ""
        );
    }
}

function parseJSON(text) {
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

function cleanHeaders(headers) {
    const result = {};

    if (!headers) return result;

    Object.keys(headers).forEach(function (key) {
        const lower = key.toLowerCase();

        // 这些 Header 由 Loon / 网络栈重新生成
        if (
            lower === "content-length" ||
            lower === "host" ||
            lower === "connection" ||
            lower === "accept-encoding"
        ) {
            return;
        }

        result[key] = headers[key];
    });

    return result;
}

function getResponseObject() {
    if (
        typeof $response === "undefined" ||
        !$response ||
        !$response.body
    ) {
        return null;
    }

    return parseJSON($response.body);
}

function getRequestVar(responseObject) {
    if (!responseObject) return "";

    if (typeof responseObject.requestVar === "string") {
        return responseObject.requestVar;
    }

    return "";
}

function detectAction(requestVar) {
    if (!requestVar) return null;

    if (
        requestVar.indexOf(
            "/USER_HOME/getRecordByMonth.json"
        ) !== -1
    ) {
        return "sign";
    }

    if (
        requestVar.indexOf(
            "/USER_HOME/getRecord.json"
        ) !== -1
    ) {
        return "status";
    }

    return null;
}

function buildRequestTemplate(action) {
    const request = $request || {};

    return {
        version: 2,

        action:
            action === "sign"
                ? "/USER_HOME/getRecordByMonth.json"
                : "/USER_HOME/getRecord.json",

        url: request.url || "",

        method:
            (request.method || "POST").toUpperCase(),

        headers: cleanHeaders(request.headers || {}),

        body:
            typeof request.body === "string"
                ? request.body
                : "",

        updateTime: Date.now()
    };
}

function saveRequest(key, data) {
    try {
        const text = JSON.stringify(data);

        const ok = $persistentStore.write(
            text,
            key
        );

        return ok !== false;
    } catch (e) {
        log("保存失败：" + e);
        return false;
    }
}

function main() {
    try {
        const responseObject = getResponseObject();

        if (!responseObject) {
            log("响应不是有效 JSON，跳过");
            return;
        }

        const requestVar =
            getRequestVar(responseObject);

        if (!requestVar) {
            log("响应中没有 requestVar，跳过");
            return;
        }

        const type = detectAction(requestVar);

        if (!type) {
            return;
        }

        if (type === "status") {
            const data =
                buildRequestTemplate("status");

            if (!data.url || !data.body) {
                log("状态查询请求数据不完整");
                return;
            }

            if (saveRequest(STATUS_KEY, data)) {
                log(
                    "已保存状态查询请求：" +
                    data.action
                );

                log(
                    "Body length: " +
                    data.body.length
                );
            }

            return;
        }

        if (type === "sign") {
            const data =
                buildRequestTemplate("sign");

            if (!data.url || !data.body) {
                log("签到请求数据不完整");
                return;
            }

            if (saveRequest(SIGN_KEY, data)) {
                log(
                    "已保存签到请求：" +
                    data.action
                );

                log(
                    "Body length: " +
                    data.body.length
                );

                notify(
                    "Vae+ 签到授权更新",
                    "签到请求已保存",
                    "getRecordByMonth 请求已完成持久化"
                );
            }

            return;
        }

    } catch (e) {
        log("脚本异常：" + e);
    }
}

main();

$done();