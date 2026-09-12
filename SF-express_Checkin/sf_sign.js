/*
 * 顺丰会员自动签到
 * Loon
 *
 * 流程：
 * 读取真实签到 Cookie
 * ↓
 * getTodaySign
 * ↓
 * 已签到 -> 通知
 * 未签到 -> sign
 */

const KEY = "sfexpress_cookie";

const BASE =
    "https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/" +
    "~memberNonactivity~integralSignV2Service~";


function notify(title, msg) {

    $notification.post(
        "顺丰签到",
        title,
        msg || ""
    );
}


function parseResponse(data) {

    const raw =
        String(data || "").trim();

    if (!raw) {
        throw new Error(
            "服务器返回空内容"
        );
    }

    return JSON.parse(raw);
}


function headers(cookie) {

    return {

        "Content-Type":
            "application/json",

        "Accept":
            "application/json, text/plain, */*",

        "Origin":
            "https://mcs-mimp-web.sf-express.com",

        "Referer":
            "https://mcs-mimp-web.sf-express.com/up-member/newHome",

        "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) " +
            "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
            "Mobile/15E148 mediaCode=SFEXPRESSAPP-iOS-ML",

        /*
         * 重点：
         * 不再自己拼 sessionId
         * 直接使用签到页面真实请求中的完整 Cookie
         */
        "Cookie":
            cookie
    };
}


function post(api, cookie, callback) {

    console.log(
        "[SF] POST " + api
    );

    $httpClient.post(
        {
            url:
                BASE + api,

            headers:
                headers(cookie),

            /*
             * 已通过实际请求验证：
             * HTTP Body 是 {}
             */
            body:
                "{}"
        },

        function(
            error,
            response,
            data
        ) {

            if (error) {

                console.log(
                    "[SF] HTTP Error: " +
                    String(error)
                );

                callback(
                    new Error(
                        "网络请求失败：" +
                        String(error)
                    )
                );

                return;
            }


            const status =
                response &&
                (
                    response.status ||
                    response.statusCode
                );


            console.log(
                "[SF] HTTP Status: " +
                status
            );


            if (
                status &&
                Number(status) >= 400
            ) {

                callback(
                    new Error(
                        "HTTP " + status
                    )
                );

                return;
            }


            try {

                const result =
                    parseResponse(data);

                console.log(
                    "[SF] " +
                    api +
                    ": " +
                    JSON.stringify(result)
                );

                callback(
                    null,
                    result
                );

            } catch (e) {

                console.log(
                    "[SF] RAW: " +
                    String(data)
                );

                callback(
                    new Error(
                        "返回解析失败：" +
                        e.message
                    )
                );
            }
        }
    );
}


/* ========================
 * 主程序
 * ======================== */

const cookie =
    $persistentStore.read(KEY);


if (!cookie) {

    notify(
        "未获取登录信息",
        "请先打开顺丰 App 的会员签到页面一次。"
    );

    $done();

} else {


    /*
     * 1. 查询今天是否签到
     */

    post(
        "getTodaySign",
        cookie,

        function(
            error,
            today
        ) {

            if (error) {

                notify(
                    "查询失败",
                    error.message
                );

                $done();

                return;
            }


            /*
             * 顺丰接口返回失败
             */

            if (
                !today ||
                today.success !== true
            ) {

                const message =
                    today &&
                    (
                        today.errorMessage ||
                        today.message
                    )
                        ?
                        (
                            today.errorMessage ||
                            today.message
                        )
                        :
                        "顺丰接口返回失败";


                /*
                 * 登录状态失效
                 */

                if (
                    message.indexOf(
                        "用户信息失效"
                    ) !== -1
                ) {

                    notify(
                        "登录状态失效",
                        "请打开一次顺丰 App 会员签到页，Loon 会自动更新 Cookie。"
                    );

                } else {

                    notify(
                        "查询失败",
                        message
                    );
                }


                $done();

                return;
            }


            if (!today.obj) {

                notify(
                    "查询异常",
                    "服务器没有返回签到状态"
                );

                $done();

                return;
            }


            /*
             * 2. 今天已经签到
             */

            if (
                today.obj.signed === true
            ) {

                const days =
                    today.obj.dayCount != null
                        ?
                        today.obj.dayCount
                        :
                        "?";


                const bubble =
                    today.obj.bubbleText || "";


                notify(
                    "今日已签到",

                    "连续签到 " +
                    days +
                    " 天" +

                    (
                        bubble
                            ?
                            "\n" + bubble
                            :
                            ""
                    )
                );


                $done();

                return;
            }


            /*
             * 3. 今天没有签到
             */

            console.log(
                "[SF] 今日未签到，开始执行签到"
            );


            post(
                "sign",
                cookie,

                function(
                    signError,
                    result
                ) {

                    if (signError) {

                        notify(
                            "签到失败",
                            signError.message
                        );

                        $done();

                        return;
                    }


                    if (
                        !result ||
                        result.success !== true
                    ) {

                        const message =
                            result &&
                            (
                                result.errorMessage ||
                                result.message
                            )
                                ?
                                (
                                    result.errorMessage ||
                                    result.message
                                )
                                :
                                "服务器未返回成功状态";


                        if (
                            message.indexOf(
                                "用户信息失效"
                            ) !== -1
                        ) {

                            notify(
                                "登录状态失效",
                                "请打开一次顺丰 App 会员签到页刷新 Cookie。"
                            );

                        } else {

                            notify(
                                "签到失败",
                                message
                            );
                        }


                        $done();

                        return;
                    }


                    if (
                        !result.obj ||
                        result.obj.signed !== true
                    ) {

                        notify(
                            "签到异常",
                            "接口没有返回 signed=true"
                        );

                        $done();

                        return;
                    }


                    const obj =
                        result.obj;


                    const days =
                        obj.dayCount != null
                            ?
                            obj.dayCount
                            :
                            "?";


                    let award = "";


                    if (
                        obj.awardNum != null
                    ) {

                        award =
                            obj.awardNum +
                            (
                                obj.awardType === "SFP"
                                    ?
                                    " 积分"
                                    :
                                    ""
                            );
                    }


                    notify(
                        "签到成功",

                        "连续签到 " +
                        days +
                        " 天" +

                        (
                            award
                                ?
                                "\n获得：" +
                                award
                                :
                                ""
                        )
                    );


                    $done();
                }
            );
        }
    );
}