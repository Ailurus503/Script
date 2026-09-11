/*
 * 顺丰 Cookie 自动获取 V2
 *
 * 功能：
 * 1. 捕获请求 Cookie
 * 2. 捕获响应 Set-Cookie
 * 3. 保存完整 Cookie
 *
 * 用于顺丰签到脚本
 */


const KEY = "sfexpress_cookie";


function log(msg) {
    console.log("[SF Cookie] " + msg);
}


function notify(msg) {
    $notification.post(
        "顺丰签到",
        "Cookie更新",
        msg
    );
}


/*
 * 从 Cookie 字符串提取字段
 */

function extractCookie(text) {

    if (!text) {
        return "";
    }


    let cookies = [];


    /*
     * sessionId
     */

    let sid =
        text.match(
            /sessionId=[^;]+/i
        );


    if (sid) {
        cookies.push(
            sid[0]
        );
    }


    /*
     * JSESSIONID
     */

    let jsid =
        text.match(
            /JSESSIONID=[^;]+/i
        );


    if (jsid) {

        cookies.push(
            jsid[0]
        );
    }


    /*
     * token
     */

    let token =
        text.match(
            /token=[^;]+/i
        );


    if (token) {

        cookies.push(
            token[0]
        );
    }


    return cookies.join("; ");
}



try {


    let cookie = "";


    /*
     * 1. 请求 Cookie
     */

    if ($request && $request.headers) {


        let reqCookie =
            $request.headers.Cookie ||
            $request.headers.cookie;


        if (reqCookie) {

            cookie =
                extractCookie(
                    reqCookie
                );


            if (cookie) {

                log(
                    "请求Cookie发现：" +
                    cookie
                );
            }
        }
    }



    /*
     * 2. 响应 Set-Cookie
     */

    if (!cookie &&
        $response &&
        $response.headers) {


        let setCookie =
            $response.headers[
                "Set-Cookie"
            ] ||
            $response.headers[
                "set-cookie"
            ];


        if (setCookie) {


            if (
                Array.isArray(
                    setCookie
                )
            ) {

                setCookie =
                    setCookie.join("; ");
            }


            cookie =
                extractCookie(
                    setCookie
                );


            if (cookie) {

                log(
                    "响应Cookie发现：" +
                    cookie
                );
            }
        }
    }



    /*
     * 保存
     */

    if (cookie) {


        let old =
            $persistentStore.read(
                KEY
            );


        if (old !== cookie) {


            let ok =
                $persistentStore.write(
                    cookie,
                    KEY
                );


            if (ok) {

                log(
                    "Cookie保存成功"
                );


                notify(
                    cookie
                );
            }

        } else {

            log(
                "Cookie没有变化"
            );
        }


    } else {


        log(
            "本次请求没有发现Cookie"
        );

    }



} catch(e) {


    log(
        "异常：" +
        e
    );

}


$done();