/*
 * Vae+ 自动签到 + 每日登录奖励
 *
 * 实验版：
 * - 签到流程保持不变
 * - 每日登录奖励 taskKey=201
 * - 如果 completeTask 模板与当前 getTaskList
 *   的 JSESSID 不一致：
 *   使用当前 getTaskList 的 Cookie
 *   覆盖奖励模板 Cookie 后尝试领取
 */

const STATUS_KEY = "VAE_STATUS_REQUEST";
const SIGN_KEY = "VAE_SIGN_REQUEST";
const TASK_LIST_KEY = "VAE_TASK_LIST_REQUEST";
const DAILY_REWARD_KEY = "VAE_DAILY_REWARD_REQUEST";

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

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}


function parseJSON(text) {

    if (!text) {
        return null;
    }

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


function getHeader(headers, name) {

    if (!headers) {
        return "";
    }

    const target = name.toLowerCase();
    const keys = Object.keys(headers);

    for (let i = 0; i < keys.length; i++) {

        if (
            keys[i].toLowerCase() === target
        ) {
            return String(
                headers[keys[i]] || ""
            );
        }
    }

    return "";
}


function setHeader(headers, name, value) {

    const result =
        Object.assign({}, headers || {});

    const target =
        name.toLowerCase();

    const keys =
        Object.keys(result);

    for (let i = 0; i < keys.length; i++) {

        if (
            keys[i].toLowerCase() === target
        ) {

            delete result[keys[i]];
        }
    }

    result[name] = value;

    return result;
}


function getCookieValue(template, cookieName) {

    if (
        !template ||
        !template.headers
    ) {
        return "";
    }

    const cookie =
        getHeader(
            template.headers,
            "Cookie"
        );

    if (!cookie) {
        return "";
    }

    const parts =
        cookie.split(";");

    for (
        let i = 0;
        i < parts.length;
        i++
    ) {

        const item =
            parts[i].trim();

        const pos =
            item.indexOf("=");

        if (pos <= 0) {
            continue;
        }

        const name =
            item
                .substring(0, pos)
                .trim();

        const value =
            item
                .substring(pos + 1)
                .trim();

        if (
            name === cookieName
        ) {
            return value;
        }
    }

    return "";
}


function checkRewardSession(
    taskRequest,
    rewardRequest
) {

    const taskSession =
        getCookieValue(
            taskRequest,
            "JSESSID"
        );

    const rewardSession =
        getCookieValue(
            rewardRequest,
            "JSESSID"
        );

    if (
        !taskSession ||
        !rewardSession
    ) {
        return "unknown";
    }

    if (
        taskSession === rewardSession
    ) {
        return "same";
    }

    return "different";
}


/*
 * 实验核心：
 *
 * 保留奖励模板的：
 * - URL
 * - Body
 * - 其他 Header
 *
 * 仅替换 Cookie 为当前 getTaskList 使用的 Cookie。
 */
function buildRewardRequestWithCurrentCookie(
    rewardRequest,
    taskListRequest
) {

    if (
        !rewardRequest ||
        !taskListRequest
    ) {
        return null;
    }

    const currentCookie =
        getHeader(
            taskListRequest.headers,
            "Cookie"
        );

    if (!currentCookie) {

        log(
            "当前任务列表模板没有 Cookie"
        );

        return null;
    }

    const cloned = {

        action:
            rewardRequest.action,

        url:
            rewardRequest.url,

        method:
            rewardRequest.method,

        headers:
            Object.assign(
                {},
                rewardRequest.headers || {}
            ),

        body:
            rewardRequest.body || ""
    };


    cloned.headers =
        setHeader(
            cloned.headers,
            "Cookie",
            currentCookie
        );


    log(
        "已使用当前任务列表 Cookie 构造奖励请求"
    );

    return cloned;
}


function buildOptions(template) {

    return {

        url:
            template.url,

        headers:
            cleanHeaders(
                template.headers || {}
            ),

        body:
            template.body || ""
    };
}


function request(template, callback) {

    if (!template) {

        callback(
            new Error(
                "请求模板不存在"
            )
        );

        return;
    }

    const method =
        (
            template.method ||
            "POST"
        ).toUpperCase();

    const options =
        buildOptions(template);

    log(
        "Request Action: " +
        (
            template.action ||
            "Unknown"
        )
    );

    log(
        "Method: " +
        method
    );

    if (method === "GET") {

        delete options.body;

        $httpClient.get(
            options,
            callback
        );

        return;
    }

    $httpClient.post(
        options,
        callback
    );
}


function getStatusCode(response) {

    if (!response) {
        return 0;
    }

    return Number(
        response.status ||
        response.statusCode ||
        0
    );
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

    if (
        json.state === false
    ) {

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


function findSignRecord(obj) {

    if (
        !obj ||
        typeof obj !== "object"
    ) {
        return null;
    }

    if (
        obj.signRecord &&
        typeof obj.signRecord ===
            "object"
    ) {
        return obj.signRecord;
    }

    if (Array.isArray(obj)) {

        for (
            let i = 0;
            i < obj.length;
            i++
        ) {

            const result =
                findSignRecord(
                    obj[i]
                );

            if (result) {
                return result;
            }
        }

        return null;
    }

    const keys =
        Object.keys(obj);

    for (
        let i = 0;
        i < keys.length;
        i++
    ) {

        const value =
            obj[keys[i]];

        if (
            value &&
            typeof value === "object"
        ) {

            const result =
                findSignRecord(
                    value
                );

            if (result) {
                return result;
            }
        }
    }

    return null;
}


function findSignSuccessAnimation(obj) {

    if (
        !obj ||
        typeof obj !== "object"
    ) {
        return false;
    }

    if (
        obj.title ===
        "签到成功"
    ) {
        return true;
    }

    if (Array.isArray(obj)) {

        for (
            let i = 0;
            i < obj.length;
            i++
        ) {

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

    const keys =
        Object.keys(obj);

    for (
        let i = 0;
        i < keys.length;
        i++
    ) {

        const value =
            obj[keys[i]];

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


function findDailyLoginTask(obj) {

    if (
        !obj ||
        typeof obj !== "object"
    ) {
        return null;
    }

    if (
        String(
            obj.taskKey
        ) === "201"
    ) {
        return obj;
    }

    if (Array.isArray(obj)) {

        for (
            let i = 0;
            i < obj.length;
            i++
        ) {

            const result =
                findDailyLoginTask(
                    obj[i]
                );

            if (result) {
                return result;
            }
        }

        return null;
    }

    const keys =
        Object.keys(obj);

    for (
        let i = 0;
        i < keys.length;
        i++
    ) {

        const value =
            obj[keys[i]];

        if (
            value &&
            typeof value === "object"
        ) {

            const result =
                findDailyLoginTask(
                    value
                );

            if (result) {
                return result;
            }
        }
    }

    return null;
}


function findVbi(obj) {

    if (
        !obj ||
        typeof obj !== "object"
    ) {
        return null;
    }

    if (
        obj.vbi !== undefined &&
        obj.vbi !== null
    ) {

        const number =
            Number(obj.vbi);

        if (!isNaN(number)) {
            return number;
        }
    }

    if (Array.isArray(obj)) {

        for (
            let i = 0;
            i < obj.length;
            i++
        ) {

            const result =
                findVbi(
                    obj[i]
                );

            if (
                result !== null
            ) {
                return result;
            }
        }

        return null;
    }

    const keys =
        Object.keys(obj);

    for (
        let i = 0;
        i < keys.length;
        i++
    ) {

        const value =
            obj[keys[i]];

        if (
            value &&
            typeof value === "object"
        ) {

            const result =
                findVbi(value);

            if (
                result !== null
            ) {
                return result;
            }
        }
    }

    return null;
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
                    json:
                        result.json
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

            const success =
                findSignSuccessAnimation(
                    result.json
                );

            if (success) {

                log(
                    "签到接口返回：签到成功"
                );

            } else {

                log(
                    "签到请求已完成，等待最终状态确认"
                );
            }

            callback({
                ok: true
            });
        }
    );
}


function queryDailyTask(
    taskListRequest,
    callback
) {

    log(
        "查询每日登录任务状态"
    );

    request(
        taskListRequest,
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

            const task =
                findDailyLoginTask(
                    result.json
                );

            if (!task) {

                callback(
                    {
                        ok: false,
                        reason:
                            "未找到每日登录任务 taskKey=201"
                    },
                    null
                );

                return;
            }

            log(
                "每日登录 complete=" +
                task.complete
            );

            log(
                "每日登录 canReceive=" +
                task.canReceive
            );

            log(
                "每日登录 receiveReward=" +
                task.receiveReward
            );

            callback(
                {
                    ok: true,
                    json:
                        result.json
                },
                task
            );
        }
    );
}


function claimDailyReward(
    rewardRequest,
    callback
) {

    log(
        "开始领取每日登录奖励"
    );

    request(
        rewardRequest,
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

            const vbi =
                findVbi(
                    result.json
                );

            if (
                vbi !== null
            ) {

                log(
                    "每日登录奖励领取成功：+" +
                    vbi
                );

            } else {

                log(
                    "每日登录奖励请求执行成功"
                );
            }

            callback({

                ok: true,

                json:
                    result.json,

                vbi:
                    vbi
            });
        }
    );
}


function getTodayString() {

    const d =
        new Date();

    return (
        d.getFullYear() +
        "-" +
        String(
            d.getMonth() + 1
        ).padStart(2, "0") +
        "-" +
        String(
            d.getDate()
        ).padStart(2, "0")
    );
}


function saveSignRecord(
    signRecord
) {

    writeStore(
        LAST_DATE_KEY,
        getTodayString()
    );

    writeStore(
        LAST_TOTAL_KEY,
        Number(
            signRecord.totalCount ||
            0
        )
    );
}


function finish() {
    $done();
}


function reportResult(
    signedNow,
    signRecord,
    rewardText
) {

    saveSignRecord(
        signRecord
    );

    const subtitle =
        signedNow
            ? "签到成功🎉"
            : "今日已签到🎉";

    let body =
        "连续签到：" +
        Number(
            signRecord.continuity ||
            0
        ) +
        "天\n" +
        "累计签到：" +
        Number(
            signRecord.totalCount ||
            0
        ) +
        "天";

    if (rewardText) {

        body +=
            "\n每日登录奖励：" +
            rewardText;
    }

    notify(
        "Vae+ 每日签到",
        subtitle,
        body
    );

    finish();
}


/*
 * 每日奖励流程
 */
function runRewardFlow(
    signedNow,
    signRecord
) {

    const taskListRequest =
        loadRequest(
            TASK_LIST_KEY
        );

    const rewardRequest =
        loadRequest(
            DAILY_REWARD_KEY
        );


    if (!taskListRequest) {

        reportResult(
            signedNow,
            signRecord,
            "未配置"
        );

        return;
    }


    queryDailyTask(
        taskListRequest,
        function (
            taskResult,
            task
        ) {

            if (!taskResult.ok) {

                log(
                    "任务状态查询失败：" +
                    taskResult.reason
                );

                reportResult(
                    signedNow,
                    signRecord,
                    "状态查询失败"
                );

                return;
            }


            if (
                task.receiveReward === true
            ) {

                log(
                    "每日登录奖励今日已经领取"
                );

                reportResult(
                    signedNow,
                    signRecord,
                    "已领取"
                );

                return;
            }


            if (
                task.complete === true &&
                task.canReceive === true
            ) {

                if (!rewardRequest) {

                    reportResult(
                        signedNow,
                        signRecord,
                        "待领取（缺少模板）"
                    );

                    return;
                }


                const sessionState =
                    checkRewardSession(
                        taskListRequest,
                        rewardRequest
                    );


                let requestToUse =
                    rewardRequest;


                if (
                    sessionState ===
                    "different"
                ) {

                    log(
                        "奖励模板会话不一致"
                    );

                    log(
                        "尝试使用当前任务列表 Cookie 重建奖励请求"
                    );


                    const rebuilt =
                        buildRewardRequestWithCurrentCookie(
                            rewardRequest,
                            taskListRequest
                        );


                    if (!rebuilt) {

                        reportResult(
                            signedNow,
                            signRecord,
                            "模板已失效"
                        );

                        return;
                    }


                    requestToUse =
                        rebuilt;


                } else if (
                    sessionState ===
                    "same"
                ) {

                    log(
                        "奖励模板会话一致"
                    );


                } else {

                    log(
                        "无法判断奖励模板会话"
                    );
                }


                claimDailyReward(
                    requestToUse,
                    function (
                        claimResult
                    ) {

                        if (
                            !claimResult.ok
                        ) {

                            log(
                                "奖励领取失败：" +
                                claimResult.reason
                            );


                            if (
                                sessionState ===
                                "different"
                            ) {

                                reportResult(
                                    signedNow,
                                    signRecord,
                                    "Cookie替换后领取失败"
                                );

                            } else {

                                reportResult(
                                    signedNow,
                                    signRecord,
                                    "领取失败"
                                );
                            }

                            return;
                        }


                        log(
                            "奖励请求完成，开始最终确认"
                        );


                        queryDailyTask(
                            taskListRequest,
                            function (
                                verifyResult,
                                verifyTask
                            ) {

                                if (
                                    verifyResult.ok &&
                                    verifyTask &&
                                    verifyTask.receiveReward ===
                                        true
                                ) {

                                    let text =
                                        "已领取";


                                    if (
                                        claimResult.vbi !==
                                        null
                                    ) {

                                        text =
                                            "+" +
                                            claimResult.vbi;
                                    }


                                    log(
                                        "服务器确认每日登录奖励已领取"
                                    );


                                    reportResult(
                                        signedNow,
                                        signRecord,
                                        text
                                    );

                                    return;
                                }


                                /*
                                 * 如果接口明确返回了 vbi，
                                 * 即使二次状态查询没确认，
                                 * 也保留接口成功结果。
                                 */
                                if (
                                    claimResult.vbi !==
                                    null
                                ) {

                                    reportResult(
                                        signedNow,
                                        signRecord,
                                        "+" +
                                        claimResult.vbi
                                    );

                                } else {

                                    reportResult(
                                        signedNow,
                                        signRecord,
                                        "请求已执行，状态未确认"
                                    );
                                }
                            }
                        );
                    }
                );

                return;
            }


            if (
                task.complete === false
            ) {

                reportResult(
                    signedNow,
                    signRecord,
                    "任务未完成"
                );

                return;
            }


            reportResult(
                signedNow,
                signRecord,
                "当前不可领取"
            );
        }
    );
}


function start() {

    log(
        "开始执行自动签到"
    );


    const statusRequest =
        loadRequest(
            STATUS_KEY
        );

    const signRequest =
        loadRequest(
            SIGN_KEY
        );


    if (!statusRequest) {

        notify(
            "Vae+ 每日签到",
            "缺少状态查询请求",
            "请打开 Vae+ 后重新捕获。"
        );

        finish();
        return;
    }


    if (!signRequest) {

        notify(
            "Vae+ 每日签到",
            "缺少签到请求",
            "请进入一次每日签到页面重新捕获。"
        );

        finish();
        return;
    }


    queryStatus(
        statusRequest,
        function (
            statusResult,
            signRecord
        ) {

            if (!statusResult.ok) {

                notify(
                    "Vae+ 每日签到",
                    "状态查询失败",
                    statusResult.reason
                );

                finish();
                return;
            }


            if (
                signRecord.signToday ===
                    true
            ) {

                log(
                    "服务器确认今日已经签到"
                );

                runRewardFlow(
                    false,
                    signRecord
                );

                return;
            }


            performSign(
                signRequest,
                function (
                    signResult
                ) {

                    if (!signResult.ok) {

                        notify(
                            "Vae+ 每日签到",
                            "签到请求失败",
                            signResult.reason
                        );

                        finish();
                        return;
                    }


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

                                notify(
                                    "Vae+ 每日签到",
                                    "签到状态确认失败",
                                    verifyResult.reason
                                );

                                finish();
                                return;
                            }


                            if (
                                finalRecord.signToday ===
                                    true
                            ) {

                                log(
                                    "服务器最终确认 signToday=true"
                                );

                                runRewardFlow(
                                    true,
                                    finalRecord
                                );

                                return;
                            }


                            notify(
                                "Vae+ 每日签到",
                                "今日未签到⚠️",
                                "签到请求已执行，但服务器最终仍返回未签到。"
                            );

                            finish();
                        }
                    );
                }
            );
        }
    );
}


start();