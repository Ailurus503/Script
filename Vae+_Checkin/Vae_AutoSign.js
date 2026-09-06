/*
 * Vae+ 自动签到 + 每日登录奖励
 * Vae_AutoSign.js
 *
 * 新增：
 * - 每日登录奖励领取前检查
 *   getTaskList 与 completeTask
 *   是否属于同一个 JSESSID 会话
 *
 * 如果检测到会话不同：
 * - 不发送旧的 completeTask 请求
 * - 保留签到成功结果
 * - 提示奖励模板需要重新捕获
 */

const STATUS_KEY =
    "VAE_STATUS_REQUEST";

const SIGN_KEY =
    "VAE_SIGN_REQUEST";

const TASK_LIST_KEY =
    "VAE_TASK_LIST_REQUEST";

const DAILY_REWARD_KEY =
    "VAE_DAILY_REWARD_REQUEST";

const LAST_DATE_KEY =
    "VAE_LAST_SIGN_DATE";

const LAST_TOTAL_KEY =
    "VAE_LAST_SIGN_TOTAL";


function log(msg) {
    console.log(
        "[Vae+ AutoSign] " +
        msg
    );
}


function notify(
    title,
    subtitle,
    body
) {
    $notification.post(
        title || "",
        subtitle || "",
        body || ""
    );
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


function readStore(key) {

    try {
        return $persistentStore.read(
            key
        );

    } catch (e) {
        return null;
    }
}


function writeStore(
    key,
    value
) {

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

    const raw =
        readStore(key);

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);

    } catch (e) {
        return null;
    }
}


/*
 * 清理不适合重放的 Header。
 */
function cleanHeaders(headers) {

    const result = {};

    if (!headers) {
        return result;
    }

    Object.keys(headers)
        .forEach(function (key) {

            const lower =
                key.toLowerCase();

            if (
                lower ===
                    "content-length" ||
                lower === "host" ||
                lower ===
                    "connection" ||
                lower ===
                    "accept-encoding"
            ) {
                return;
            }

            result[key] =
                headers[key];
        });

    return result;
}


/*
 * 不区分大小写读取 Header。
 */
function getHeader(
    headers,
    name
) {

    if (!headers) {
        return "";
    }

    const target =
        String(name)
            .toLowerCase();

    const keys =
        Object.keys(headers);

    for (
        let i = 0;
        i < keys.length;
        i++
    ) {

        if (
            keys[i]
                .toLowerCase() ===
            target
        ) {

            return String(
                headers[keys[i]] ||
                ""
            );
        }
    }

    return "";
}


/*
 * 从请求模板 Cookie 中读取指定值。
 *
 * 不打印 Cookie 内容，
 * 避免敏感信息进入日志。
 */
function getCookieValue(
    template,
    cookieName
) {

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

    const target =
        String(cookieName);

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
            item.substring(
                0,
                pos
            ).trim();

        const value =
            item.substring(
                pos + 1
            ).trim();

        if (
            name === target
        ) {
            return value;
        }
    }

    return "";
}


/*
 * 检查任务列表模板和奖励模板
 * 是否来自同一个登录会话。
 *
 * 返回：
 *
 * same
 *   JSESSID 相同
 *
 * different
 *   JSESSID 不同
 *
 * unknown
 *   某一模板没有可读取的 JSESSID
 */
function checkRewardSession(
    taskListRequest,
    rewardRequest
) {

    const taskSession =
        getCookieValue(
            taskListRequest,
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

        return {
            status: "unknown"
        };
    }


    if (
        taskSession ===
        rewardSession
    ) {

        return {
            status: "same"
        };
    }


    return {
        status: "different"
    };
}


function buildOptions(template) {

    return {

        url:
            template.url,

        headers:
            cleanHeaders(
                template.headers ||
                {}
            ),

        body:
            template.body || ""
    };
}


function request(
    template,
    callback
) {

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
        buildOptions(
            template
        );


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


    if (
        method === "GET"
    ) {

        delete options.body;

        $httpClient.get(
            options,
            function (
                error,
                response,
                data
            ) {

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
        function (
            error,
            response,
            data
        ) {

            callback(
                error,
                response,
                data
            );
        }
    );
}


function getStatusCode(
    response
) {

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
        getStatusCode(
            response
        );


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


/*
 * 查找签到记录。
 */
function findSignRecord(obj) {

    if (
        !obj ||
        typeof obj !==
            "object"
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


    if (
        Array.isArray(obj)
    ) {

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
            typeof value ===
                "object"
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


/*
 * 查找签到成功动画。
 */
function findSignSuccessAnimation(
    obj
) {

    if (
        !obj ||
        typeof obj !==
            "object"
    ) {
        return false;
    }


    if (
        obj.title ===
        "签到成功"
    ) {
        return true;
    }


    if (
        Array.isArray(obj)
    ) {

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
            typeof value ===
                "object"
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


/*
 * 查找每日登录任务。
 *
 * taskKey = 201
 */
function findDailyLoginTask(
    obj
) {

    if (
        !obj ||
        typeof obj !==
            "object"
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


    if (
        Array.isArray(obj)
    ) {

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
            typeof value ===
                "object"
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


/*
 * 从领奖响应里查找 vbi。
 */
function findVbi(obj) {

    if (
        !obj ||
        typeof obj !==
            "object"
    ) {
        return null;
    }


    if (
        obj.vbi !== undefined &&
        obj.vbi !== null
    ) {

        const number =
            Number(obj.vbi);

        if (
            !isNaN(number)
        ) {
            return number;
        }
    }


    if (
        Array.isArray(obj)
    ) {

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
            typeof value ===
                "object"
        ) {

            const result =
                findVbi(
                    value
                );

            if (
                result !== null
            ) {
                return result;
            }
        }
    }


    return null;
}


function getTodayString() {

    const d =
        new Date();

    const y =
        d.getFullYear();

    const m =
        String(
            d.getMonth() + 1
        ).padStart(
            2,
            "0"
        );

    const day =
        String(
            d.getDate()
        ).padStart(
            2,
            "0"
        );


    return (
        y +
        "-" +
        m +
        "-" +
        day
    );
}


function finish() {
    $done();
}


function saveSignRecord(
    signRecord
) {

    const today =
        getTodayString();

    const total =
        Number(
            signRecord.totalCount ||
            0
        );


    writeStore(
        LAST_DATE_KEY,
        today
    );


    writeStore(
        LAST_TOTAL_KEY,
        total
    );
}


/*
 * 查询签到状态。
 */
function queryStatus(
    statusRequest,
    callback
) {

    log(
        "查询签到状态"
    );


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


/*
 * 执行签到。
 */
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


            if (
                animationSuccess
            ) {

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


/*
 * 查询任务中心。
 */
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


/*
 * 领取 taskKey=201。
 */
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


/*
 * 最终通知。
 */
function reportResult(
    signedNow,
    signRecord,
    rewardText
) {

    const continuity =
        Number(
            signRecord.continuity ||
            0
        );

    const total =
        Number(
            signRecord.totalCount ||
            0
        );


    saveSignRecord(
        signRecord
    );


    const subtitle =
        signedNow
            ? "签到成功🎉"
            : "今日已签到🎉";


    let body =
        "连续签到：" +
        continuity +
        "天\n" +
        "累计签到：" +
        total +
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
 * 签到完成后，
 * 处理每日登录 +50。
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


    /*
     * 尚未捕获任务列表。
     * 不影响签到本身。
     */
    if (!taskListRequest) {

        log(
            "缺少任务列表请求模板"
        );

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


            /*
             * 已经领取。
             */
            if (
                task.receiveReward ===
                    true
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


            /*
             * 可以领取。
             */
            if (
                task.complete === true &&
                task.canReceive === true
            ) {

                if (!rewardRequest) {

                    log(
                        "缺少每日登录奖励请求模板"
                    );

                    reportResult(
                        signedNow,
                        signRecord,
                        "待领取（缺少模板）"
                    );

                    return;
                }


                /*
                 * 新增：
                 * 在发送 completeTask 前
                 * 检查 JSESSID 是否一致。
                 */
                const sessionCheck =
                    checkRewardSession(
                        taskListRequest,
                        rewardRequest
                    );


                if (
                    sessionCheck.status ===
                    "different"
                ) {

                    log(
                        "检测到奖励模板属于旧登录会话，停止领取"
                    );


                    reportResult(
                        signedNow,
                        signRecord,
                        "模板已失效，请手动领取一次刷新"
                    );

                    return;
                }


                if (
                    sessionCheck.status ===
                    "same"
                ) {

                    log(
                        "奖励模板会话一致，允许领取"
                    );

                } else {

                    /*
                     * 无法读取 JSESSID 时，
                     * 不破坏原来的行为，
                     * 继续尝试领取。
                     */
                    log(
                        "无法读取 JSESSID，跳过会话校验"
                    );
                }


                claimDailyReward(
                    rewardRequest,
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


                            /*
                             * 如果 Cookie 会话一致，
                             * 但领奖仍失败，
                             * 很可能是请求 Body
                             * 存在其他时效性限制。
                             */
                            if (
                                sessionCheck.status ===
                                "same"
                            ) {

                                reportResult(
                                    signedNow,
                                    signRecord,
                                    "领取失败（会话一致）"
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


                        /*
                         * 领取后再次查询任务状态，
                         * 做最终确认。
                         */
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
                                    (
                                        verifyTask.receiveReward ===
                                            true ||
                                        verifyTask.canReceive ===
                                            false
                                    )
                                ) {

                                    let rewardText;


                                    if (
                                        claimResult.vbi !==
                                        null
                                    ) {

                                        rewardText =
                                            "+" +
                                            claimResult.vbi;

                                    } else {

                                        rewardText =
                                            "已领取";
                                    }


                                    log(
                                        "服务器确认每日登录奖励已领取"
                                    );


                                    reportResult(
                                        signedNow,
                                        signRecord,
                                        rewardText
                                    );

                                    return;
                                }


                                /*
                                 * 请求本身成功，
                                 * 但最终状态无法确认。
                                 */
                                log(
                                    "奖励最终状态未确认"
                                );


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
                                        "请求已执行"
                                    );
                                }
                            }
                        );
                    }
                );

                return;
            }


            /*
             * 每日登录任务尚未完成。
             */
            if (
                task.complete === false
            ) {

                log(
                    "每日登录任务尚未完成"
                );

                reportResult(
                    signedNow,
                    signRecord,
                    "任务未完成"
                );

                return;
            }


            /*
             * complete=true
             * 但目前不能领取。
             */
            log(
                "每日登录奖励当前不可领取"
            );


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
            "请先打开 Vae+ 的「发现」页面重新捕获请求。"
        );

        finish();
        return;
    }


    if (!signRequest) {

        notify(
            "Vae+ 每日签到",
            "缺少签到请求",
            "请进入一次「发现 → 每日签到」重新捕获请求。"
        );

        finish();
        return;
    }


    /*
     * 第一阶段：
     * 查询今天是否签到。
     */
    queryStatus(
        statusRequest,
        function (
            statusResult,
            signRecord
        ) {

            if (
                !statusResult.ok
            ) {

                notify(
                    "Vae+ 每日签到",
                    "状态查询失败",
                    statusResult.reason
                );

                finish();
                return;
            }


            /*
             * 今天已经签到。
             * 仍然继续检查
             * 每日登录 +50。
             */
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


            /*
             * 今天还没签到。
             */
            performSign(
                signRequest,
                function (
                    signResult
                ) {

                    if (
                        !signResult.ok
                    ) {

                        notify(
                            "Vae+ 每日签到",
                            "签到请求失败",
                            signResult.reason
                        );

                        finish();
                        return;
                    }


                    /*
                     * 再次 getRecord
                     * 确认服务器状态。
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


                                /*
                                 * 签到成功后继续领奖励。
                                 */
                                runRewardFlow(
                                    true,
                                    finalRecord
                                );

                                return;
                            }


                            log(
                                "最终确认 signToday=false"
                            );


                            notify(
                                "Vae+ 每日签到",
                                "今日未签到⚠️",
                                "签到请求已执行，但服务器最终仍返回未签到。\n" +
                                "累计签到：" +
                                Number(
                                    finalRecord.totalCount ||
                                    0
                                ) +
                                "天"
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