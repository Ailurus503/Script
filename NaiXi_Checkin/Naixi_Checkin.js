/*
🍦 奶昔论坛自动签到
Loon版
*/

const DOMAIN = "https://forum.naixi.net";
const HOME_PAGE = DOMAIN + "/forum.php?forumlist=1";
const SIGN_PAGE = DOMAIN + "/plugin.php?id=k_misign:sign";
const COOKIE_KEY = "NaixiCookie";

const cookie = $persistentStore.read(COOKIE_KEY);

if (!cookie) {
    notify(
        "❌ 签到失败",
        "未找到 Cookie"
    );
    $done();
}

const headers = {
    "Cookie": cookie,
    "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    "Referer": DOMAIN + "/"
};


// GET 请求
function get(url) {
    return new Promise((resolve, reject) => {
        $httpClient.get(
            {
                url: url,
                headers: headers
            },
            (err, res, data) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve({
                    status: res ? res.status : 0,
                    data: data || ""
                });
            }
        );
    });
}


(async () => {

    try {

        console.log("[奶昔签到] 开始执行");

        // 1. 获取论坛首页
        console.log("[奶昔签到] 获取论坛首页");

        let homeResp = await get(HOME_PAGE);

        if (!homeResp.data) {
            notify(
                "❌ 签到失败",
                "无法获取论坛首页"
            );
            $done();
            return;
        }


        let home = homeResp.data;


        // 2. 判断 Cookie 是否失效
        // Discuz 登录后页面通常存在非 0 的 discuz_uid
        let uidMatch = home.match(
            /discuz_uid\s*=\s*['"](\d+)['"]/
        );

        if (
            !uidMatch ||
            !uidMatch[1] ||
            uidMatch[1] === "0"
        ) {

            console.log("[奶昔签到] Cookie 可能已失效");

            notify(
                "❌ Cookie 已失效",
                "请重新登录奶昔论坛并更新 Cookie"
            );

            $done();
            return;
        }


        console.log(
            "[奶昔签到] 登录状态正常"
        );


        // 3. 从论坛首页提取 formhash
        let match = home.match(
            /formhash=([a-zA-Z0-9]+)/
        );

        if (!match) {

            console.log(
                "[奶昔签到] 获取 formhash 失败"
            );

            notify(
                "❌ 签到失败",
                "登录正常，但获取 formhash 失败"
            );

            $done();
            return;
        }


        let formhash = match[1];

        console.log(
            "[奶昔签到] formhash 获取成功"
        );


        // 4. 先检查签到页面当前状态
        console.log(
            "[奶昔签到] 检查今日签到状态"
        );

        let signPageResp = await get(SIGN_PAGE);
        let signPage = signPageResp.data || "";


        if (
            signPage.includes("已签到") ||
            signPage.includes("今日已签")
        ) {

            let info = parseInfo(signPage);

            notify(
                "今日已签到🎉",
                buildMessage(info)
            );

            $done();
            return;
        }


        // 5. 构造签到请求
        let signURL =
            SIGN_PAGE +
            "&operation=qiandao" +
            "&format=text" +
            "&formhash=" +
            encodeURIComponent(formhash);


        console.log(
            "[奶昔签到] 执行签到"
        );


        // 6. 执行签到
        let signResp = await get(signURL);

        let signResult =
            signResp.data || "";


        console.log(
            "[奶昔签到] 签到接口返回：" +
            clean(signResult)
        );


        // HAR 已确认接口可能直接返回 “已签到”
        let apiSuccess =
            signResult.includes("已签到") ||
            signResult.includes("签到成功");


        // 7. 等待数据更新
        await sleep(1000);


        // 8. 重新获取签到页面确认最终状态
        console.log(
            "[奶昔签到] 验证签到结果"
        );

        let finalResp =
            await get(SIGN_PAGE);

        let finalPage =
            finalResp.data || "";


        if (
            finalPage.includes("已签到") ||
            finalPage.includes("今日已签") ||
            apiSuccess
        ) {

            let info =
                parseInfo(finalPage);

            notify(
                "签到成功🎉",
                buildMessage(info)
            );

        } else {

            notify(
                "❌ 签到失败",
                "签到接口已执行，但未确认成功"
            );

        }


    } catch (e) {

        console.log(
            "[奶昔签到] 异常：" +
            (e.message || String(e))
        );

        notify(
            "❌ 签到异常",
            e.message || String(e)
        );

    }

    $done();

})();


// 解析签到信息
function parseInfo(html) {

    let data = {
        rank: "--",
        continuous: "--",
        total: "--",
        level: "--"
    };

    let m;


    // 今日排名
    m = html.match(
        /<span[^>]*>(.*?)<\/span>\s*今日排名/
    );

    if (m) {
        data.rank = clean(m[1]);
    }


    // 连续签到
    m = html.match(
        /<span[^>]*>(.*?)<\/span>\s*连续签到/
    );

    if (m) {
        data.continuous = clean(m[1]);
    }


    // 累计签到
    m = html.match(
        /<span[^>]*>(.*?)<\/span>\s*累计签到/
    );

    if (m) {
        data.total = clean(m[1]);
    }


    // 签到等级
    m = html.match(
        /<span[^>]*>(.*?)<\/span>\s*签到等级/
    );

    if (m) {
        data.level = clean(m[1]);
    }


    return data;
}


// 构建通知内容
function buildMessage(info) {

    return (
        "今日排名：" +
        info.rank +

        "\n连续签到：" +
        info.continuous +

        "\n累计签到：" +
        info.total +

        "\n签到等级：" +
        info.level
    );
}


// 清理 HTML
function clean(str) {

    return String(str || "")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}


// 延迟
function sleep(ms) {
    return new Promise(
        resolve => setTimeout(resolve, ms)
    );
}


// Loon 通知
function notify(title, body) {

    $notification.post(
        "🍦奶昔论坛签到",
        title,
        body
    );
}