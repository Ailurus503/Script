/*
 * Vae+ 签到鉴权捕获器 - Final
 * 适用：Loon
 *
 * 功能：
 * 1. 监听 api1.starfans.com/auth/
 * 2. 从响应 requestVar 中识别 /USER_HOME/getRecord.json
 * 3. 只保存真正与签到相关的请求
 * 4. 保存完整请求模板，供后续定时签到脚本使用
 * 5. 保存 userId / uvsign / uvkey / registrationId 等参数
 * 6. 首次捕获或数据变化时发送 Loon 通知
 *
 * Persistent Store:
 * VAE_SIGN_REQUEST
 * VAE_SIGN_AUTH
 * VAE_SIGN_FP
 */

const KEY_REQUEST = "VAE_SIGN_REQUEST";
const KEY_AUTH    = "VAE_SIGN_AUTH";
const KEY_FP      = "VAE_SIGN_FP";

const TARGET_ACTION = "/USER_HOME/getRecord.json";

function log(msg) {
    console.log("[Vae+] " + msg);
}

function notify(title, subtitle, body) {
    try {
        $notification.post(title, subtitle || "", body || "");
    } catch (e) {
        log("通知发送失败: " + e);
    }
}

function safeJson(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}

function decode(str) {
    if (!str) return "";

    try {
        return decodeURIComponent(
            String(str).replace(/\+/g, "%20")
        );
    } catch (e) {
        return String(str);
    }
}

function parseForm(str) {
    const result = {};

    if (!str) return result;

    String(str).split("&").forEach(item => {
        const index = item.indexOf("=");

        if (index === -1) {
            if (item) result[decode(item)] = "";
            return;
        }

        const key = decode(item.substring(0, index));
        const val = decode(item.substring(index + 1));

        result[key] = val;
    });

    return result;
}

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

function cleanHeaders(headers) {
    const result = {};

    if (!headers) return result;

    /*
     * 保存真正可能影响重放的 Header。
     * Content-Length 不保存，让 Loon 自动计算。
     */
    const allow = [
        "user-agent",
        "content-type",
        "cookie",
        "authorization",
        "accept",
        "accept-language"
    ];

    for (const key in headers) {
        const lower = key.toLowerCase();

        if (allow.includes(lower)) {
            result[key] = headers[key];
        }
    }

    return result;
}

function parseRequestVar(requestVar) {
    const result = {
        raw: requestVar || ""
    };

    if (!requestVar) return result;

    const params = parseForm(requestVar);

    result.uri = params.uri || "";
    result.userId = params.userId || "";
    result.registrationId = params.registrationId || "";
    result.action = params.action || "";

    /*
     * data 本身通常是 JSON
     */
    if (params.data) {
        const dataText = decode(params.data);
        const dataJson = safeJson(dataText);

        if (dataJson) {
            result.data = dataJson;

            result.userId =
                dataJson.userId ||
                dataJson.self_userid ||
                result.userId ||
                "";

            result.uvsign =
                dataJson.uvsign ||
                "";

            result.uvkey =
                dataJson.uvkey ||
                "";

            result.registrationId =
                dataJson.registrationId ||
                result.registrationId ||
                "";

            result.sysModel =
                dataJson.sysModel ||
                "";

            result.sysVersion =
                dataJson.sys_v ||
                dataJson.sysVersion ||
                "";

            result.appVersion =
                dataJson.app_v ||
                "";

            result.terminal =
                dataJson.terminal ||
                "";
        }
    }

    return result;
}

function fingerprint(obj) {
    /*
     * 不需要密码学哈希。
     * 只用于判断捕获模板有没有变化。
     */
    const text = JSON.stringify(obj);

    let hash = 0;

    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }

    return String(hash);
}

try {

    if (!$request || !$response) {
        log("缺少 request/response 对象");
        $done({});
        return;
    }

    const responseBody = $response.body || "";
    const json = safeJson(responseBody);

    if (!json) {
        log("响应不是可解析 JSON，跳过");
        $done({});
        return;
    }

    /*
     * HAR 已确认 Vae+ auth 响应中会返回 requestVar，
     * 真实 action 就在这里。
     */
    const requestVar = json.requestVar || "";

    if (!requestVar) {
        log("当前 auth 响应没有 requestVar，跳过");
        $done({});
        return;
    }

    const auth = parseRequestVar(requestVar);

    /*
     * 只捕获真正的签到记录请求。
     */
    if (
        auth.action !== TARGET_ACTION &&
        !requestVar.includes(TARGET_ACTION)
    ) {
        log("非签到请求: " + (auth.action || auth.uri || "unknown"));
        $done({});
        return;
    }

    /*
     * 提取 q。
     * GET: /auth/?q=...
     * POST: body q=...
     */
    let q = "";

    try {
        const url = $request.url || "";

        if (url.includes("?")) {
            const query = url.substring(url.indexOf("?") + 1);
            const params = parseForm(query);

            if (params.q) {
                q = params.q;
            }
        }
    } catch (e) {}

    if (!q && $request.body) {
        try {
            const bodyParams = parseForm($request.body);

            if (bodyParams.q) {
                q = bodyParams.q;
            }
        } catch (e) {}
    }

    const requestTemplate = {
        version: 1,

        url: $request.url || "",
        method: ($request.method || "GET").toUpperCase(),

        headers: cleanHeaders($request.headers),

        body: $request.body || "",

        q: q,

        action: auth.action,

        capturedAt: new Date().toISOString()
    };

    const authData = {
        version: 1,

        action: auth.action || TARGET_ACTION,

        userId: auth.userId || "",
        uvsign: auth.uvsign || "",
        uvkey: auth.uvkey || "",
        registrationId: auth.registrationId || "",

        sysModel: auth.sysModel || "",
        sysVersion: auth.sysVersion || "",
        appVersion: auth.appVersion || "",
        terminal: auth.terminal || "",

        cookie: getHeader($request.headers, "Cookie"),
        userAgent: getHeader($request.headers, "User-Agent"),

        requestVar: requestVar,

        capturedAt: new Date().toISOString()
    };

    /*
     * 用核心字段判断是否真的变化。
     * capturedAt 不参与 fingerprint，否则每次都会认为变化。
     */
    const fpData = {
        method: requestTemplate.method,
        url: requestTemplate.url,
        body: requestTemplate.body,
        q: requestTemplate.q,

        userId: authData.userId,
        uvsign: authData.uvsign,
        uvkey: authData.uvkey,
        registrationId: authData.registrationId,
        cookie: authData.cookie
    };

    const newFP = fingerprint(fpData);
    const oldFP = $persistentStore.read(KEY_FP) || "";

    const ok1 = $persistentStore.write(
        JSON.stringify(requestTemplate),
        KEY_REQUEST
    );

    const ok2 = $persistentStore.write(
        JSON.stringify(authData),
        KEY_AUTH
    );

    const ok3 = $persistentStore.write(
        newFP,
        KEY_FP
    );

    if (!ok1 || !ok2 || !ok3) {
        throw new Error("persistentStore 写入失败");
    }

    log("已捕获签到请求");
    log("action = " + authData.action);
    log("userId = " + (authData.userId || "未解析"));
    log("method = " + requestTemplate.method);

    /*
     * 第一次捕获，或者鉴权发生变化时才通知。
     * 避免每次进入页面连续弹几十个通知。
     */
    if (!oldFP) {

        notify(
            "Vae+",
            "签到鉴权获取成功",
            authData.userId
                ? "账号 " + authData.userId + " 已完成持久化"
                : "签到请求模板已完成持久化"
        );

    } else if (oldFP !== newFP) {

        notify(
            "Vae+",
            "签到鉴权已更新",
            "新的签到请求模板已自动保存"
        );

    } else {

        /*
         * 数据完全没变化，不弹窗。
         */
        log("签到鉴权未变化，不重复通知");
    }

} catch (e) {

    log("捕获失败: " + e);

    notify(
        "Vae+",
        "鉴权捕获失败",
        String(e)
    );
}

$done({});