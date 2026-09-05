/*
 * Vae+ 自动签到
 * Vae_AutoSign.js
 *
 * 流程：
 *
 * 1. getRecord
 *    查询今日签到状态
 *
 * 2. signToday == true
 *    → 今日已签到
 *
 * 3. signToday == false
 *    → 请求 getRecordByMonth
 *
 * 4. 再请求 getRecord
 *    → 最终确认签到状态
 *
 * 只有最终 signToday == true
 * 才会报告签到成功。
 */

const STATUS_KEY = "VAE_STATUS_REQUEST";
const SIGN_KEY = "VAE_SIGN_REQUEST";

const LAST_DATE_KEY = "VAE_LAST_SIGN_DATE";
const LAST_TOTAL_KEY = "VAE_LAST_SIGN_TOTAL";

function log(msg) {
    console.log("[Vae+ AutoSign] " + msg);
}

function notify(title, subtitle, body) {
    $notification.post(
        title || "",
        subtitle || "",
        body || ""
    );
}

function parseJSON(text) {
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

function readStore(key) {
    try {
        return $persistentStore.read(key);
    } catch (e) {
        return null;
    }
}

function writeStore(key, value) {
    try {
        return $persistentStore.write(
            String(value),
            key
        );
    } catch (e) {
        return false;
    }
}

function loadRequest(key) {
    const raw = readStore(key);

    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function cleanHeaders(headers) {
    const result = {};

    if (!headers) return result;

    Object.keys(headers).forEach(function (key) {
        const lower = key.toLowerCase();

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

function buildOptions(template) {
    return {
        url: template.url,

        headers: cleanHeaders(
            template.headers || {}
        ),

        body: template.body || ""
    };
}

function request(template, callback) {
    if (!template) {
        callback(
            new Error("请求模板不存在")
        );
        return;
    }

    const method =
        (template.method || "POST")
            .toUpperCase();

    const options =
        buildOptions(template);

    log(
        "Request Action: " +
        (template.action || "Unknown")
    );

    log("Method: " + method);

    if (method === "GET") {
        delete options.body;

        $httpClient.get(
            options,
            function (error, response, data) {
                callback(
                    error,
                    response,
                    data
                );
            }
        );

        return;
    }

    $httpClient.post(
        options,
        function (error, response, data) {
            callback(
                error,
                response,
                data
            );
        }
    );
}

function getStatusCode(response) {
    if (!response) return 0;

    return Number(
        response.status ||
        response.statusCode ||
        0
    );
}

function findSignRecord(obj) {
    if (!obj || typeof obj !== "object") {
        return null;
    }

    if (
        obj.signRecord &&
        typeof obj.signRecord === "object"
    ) {
        return obj.signRecord;
    }

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            const result =
                findSignRecord(obj[i]);

            if (result) return result;
        }

        return null;
    }

    const keys = Object.keys(obj);

    for (let i = 0; i < keys.length; i++) {
        const value = obj[keys[i]];

        if (
            value &&
            typeof value === "object"
        ) {
            const result =
                findSignRecord(value);

            if (result) return result;
        }
    }

    return null;
}

function findSignSuccessAnimation(obj) {
    if (!obj || typeof obj !== "object") {
        return false;
    }

    if (obj.title === "签到成功") {
        return true;
    }

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            if (
                findSignSuccessAnimation(
                    obj[i]
                )
            ) {
                return true;
            }
        }

        return false;
    }

    const keys = Object.keys(obj);

    for (let i = 0; i < keys.length; i++) {
        const value = obj[keys[i]];

        if (
            value &&
            typeof value === "object"
        ) {
            if (
                findSignSuccessAnimation(
                    value
                )
            ) {
                return true;
            }
        }
    }

    return false;
}

function getTodayString() {
    const d = new Date();

    const y = d.getFullYear();

    const m =
        String(d.getMonth() + 1)
            .padStart(2, "0");

    const day =
        String(d.getDate())
            .padStart(2, "0");

    return y + "-" + m + "-" + day;
}

function finish() {
    $done();
}

function fail(title, body) {
    notify(
        "Vae+ 每日签到",
        title,
        body
    );

    finish();
}

function parseServerResponse(
    error,
    response,
    data
) {
    if (error) {
        return {
            ok: false,
            reason:
                "网络错误：" +
                String(error)
        };
    }

    const statusCode =
        getStatusCode(response);

    log(
        "HTTP Status: " +
        statusCode
    );

    if (
        statusCode === 401 ||
        statusCode === 403
    ) {
        return {
            ok: false,
            authExpired: true,
            reason:
                "HTTP " +
                statusCode +
                "，授权可能已失效"
        };
    }

    if (
        statusCode < 200 ||
        statusCode >= 300
    ) {
        return {
            ok: false,
            reason:
                "HTTP " +
                statusCode
        };
    }

    const json =
        parseJSON(data);

    if (!json) {
        return {
            ok: false,
            reason:
                "服务器响应不是有效 JSON"
        };
    }

    if (json.state === false) {
        return {
            ok: false,
            reason:
                json.errMsg ||
                json.message ||
                "服务器返回 state=false"
        };
    }

    return {
        ok: true,
        json: json
    };
}

function queryStatus(
    statusRequest,
    callback
) {
    log("查询签到状态");

    request(
        statusRequest,
        function (
            error,
            response,
            data
        ) {
            const result =
                parseServerResponse(
                    error,
                    response,
                    data
                );

            if (!result.ok) {
                callback(
                    result,
                    null
                );

                return;
            }

            const signRecord =
                findSignRecord(
                    result.json
                );

            if (!signRecord) {
                callback(
                    {
                        ok: false,
                        reason:
                            "未找到 signRecord"
                    },
                    null
                );

                return;
            }

            log(
                "signToday=" +
                signRecord.signToday
            );

            log(
                "continuity=" +
                signRecord.continuity
            );

            log(
                "totalCount=" +
                signRecord.totalCount
            );

            callback(
                {
                    ok: true,
                    json: result.json
                },
                signRecord
            );
        }
    );
}

function performSign(
    signRequest,
    callback
) {
    log(
        "今日未签到，开始执行签到请求"
    );

    request(
        signRequest,
        function (
            error,
            response,
            data
        ) {
            const result =
                parseServerResponse(
                    error,
                    response,
                    data
                );

            if (!result.ok) {
                callback(result);
                return;
            }

            const animationSuccess =
                findSignSuccessAnimation(
                    result.json
                );

            if (animationSuccess) {
                log(
                    "签到接口返回：签到成功"
                );
            } else {
                log(
                    "签到请求已完成，等待最终状态确认"
                );
            }

            callback({
                ok: true,
                animationSuccess:
                    animationSuccess
            });
        }
    );
}

function reportAlreadySigned(
    signRecord
) {
    const continuity =
        Number(
            signRecord.continuity || 0
        );

    const total =
        Number(
            signRecord.totalCount || 0
        );

    const today =
        getTodayString();

    writeStore(
        LAST_DATE_KEY,
        today
    );

    writeStore(
        LAST_TOTAL_KEY,
        total
    );

    notify(
        "Vae+ 每日签到",
        "今日已签到🎉",
        "连续签到：" +
            continuity +
            "天\n" +
        "累计签到：" +
            total +
            "天"
    );

    finish();
}

function reportSuccess(
    signRecord
) {
    const continuity =
        Number(
            signRecord.continuity || 0
        );

    const total =
        Number(
            signRecord.totalCount || 0
        );

    const today =
        getTodayString();

    writeStore(
        LAST_DATE_KEY,
        today
    );

    writeStore(
        LAST_TOTAL_KEY,
        total
    );

    notify(
        "Vae+ 每日签到",
        "签到成功🎉",
        "连续签到：" +
            continuity +
            "天\n" +
        "累计签到：" +
            total +
            "天"
    );

    finish();
}

function start() {
    log("开始执行自动签到");

    const statusRequest =
        loadRequest(STATUS_KEY);

    const signRequest =
        loadRequest(SIGN_KEY);

    if (!statusRequest) {
        fail(
            "缺少状态查询请求",
            "请先打开 Vae+ 的「发现」页面，让鉴权脚本重新捕获请求。"
        );

        return;
    }

    if (!signRequest) {
        fail(
            "缺少签到请求",
            "请进入一次「发现 → 每日签到」，让鉴权脚本捕获 getRecordByMonth 请求。"
        );

        return;
    }

    /*
     * 第一步：
     * 查询当前签到状态
     */

    queryStatus(
        statusRequest,
        function (
            statusResult,
            signRecord
        ) {
            if (!statusResult.ok) {
                fail(
                    "状态查询失败",
                    statusResult.reason
                );

                return;
            }

            /*
             * 今天已经签到
             */

            if (
                signRecord.signToday === true
            ) {
                log(
                    "服务器确认今日已经签到"
                );

                reportAlreadySigned(
                    signRecord
                );

                return;
            }

            /*
             * 今天尚未签到：
             * 调用 getRecordByMonth
             */

            performSign(
                signRequest,
                function (
                    signResult
                ) {
                    if (!signResult.ok) {
                        fail(
                            "签到请求失败",
                            signResult.reason
                        );

                        return;
                    }

                    /*
                     * 签到请求执行以后，
                     * 再次调用 getRecord。
                     *
                     * 最终必须由服务器
                     * signToday=true
                     * 确认签到成功。
                     */

                    log(
                        "签到请求完成，开始最终确认"
                    );

                    queryStatus(
                        statusRequest,
                        function (
                            verifyResult,
                            finalRecord
                        ) {
                            if (
                                !verifyResult.ok
                            ) {
                                fail(
                                    "签到状态确认失败",
                                    verifyResult.reason
                                );

                                return;
                            }

                            /*
                             * 最终确认成功
                             */

                            if (
                                finalRecord.signToday
                                === true
                            ) {
                                log(
                                    "服务器最终确认 signToday=true"
                                );

                                reportSuccess(
                                    finalRecord
                                );

                                return;
                            }

                            /*
                             * 请求虽然执行成功，
                             * 但服务器仍然显示未签到。
                             *
                             * 此时绝不误报签到成功。
                             */

                            log(
                                "最终确认 signToday=false"
                            );

                            fail(
                                "今日未签到⚠️",
                                "签到请求已执行，但服务器最终仍返回未签到。\n" +
                                "累计签到：" +
                                Number(
                                    finalRecord.totalCount ||
                                    0
                                ) +
                                "天"
                            );
                        }
                    );
                }
            );
        }
    );
}

start();
