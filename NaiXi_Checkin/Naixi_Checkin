/*
🍦 奶昔论坛自动签到
Loon版
*/

const DOMAIN = "https://forum.naixi.net";
const SIGN_PAGE = DOMAIN + "/plugin.php?id=k_misign:sign";
const COOKIE_KEY = "NaixiCookie";

const cookie = $persistentStore.read(COOKIE_KEY);

if (!cookie) {
    notify(
        "❌ 签到失败",
        "未找到Cookie"
    );
    $done();
}

const headers = {
    "Cookie": cookie,
    "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    "Referer": SIGN_PAGE
};


// GET请求
function get(url) {
    return new Promise(resolve => {
        $httpClient.get(
            {
                url: url,
                headers: headers
            },
            (err, res, data) => {
                resolve(data || "");
            }
        );
    });
}


(async () => {

    try {

        // 获取签到页面
        let page = await get(SIGN_PAGE);

        if (!page) {
            notify(
                "❌ 签到失败",
                "无法获取签到页面"
            );

            $done();
            return;
        }


        // 判断今日是否已经签到
        if (page.includes("已签到")) {

            let info = parseInfo(page);

            notify(
                "今日已签到 🎉",
                buildMessage(info)
            );

            $done();
            return;
        }


        // 获取 formhash
        let match = page.match(
            /formhash=([a-zA-Z0-9]+)/
        );

        if (!match) {

            notify(
                "❌ 签到失败",
                "获取formhash失败"
            );

            $done();
            return;
        }


        let formhash = match[1];


        // 构造签到请求
        let signURL =
            SIGN_PAGE +
            "&operation=qiandao" +
            "&format=text" +
            "&formhash=" +
            formhash;


        // 执行签到
        await get(signURL);


        // 等待页面数据更新
        await sleep(1000);


        // 重新获取签到页面
        let finalPage = await get(SIGN_PAGE);


        // 判断签到是否成功
        if (finalPage.includes("已签到")) {

            let info = parseInfo(finalPage);

            notify(
                "签到成功 🎉",
                buildMessage(info)
            );

        } else {

            notify(
                "❌ 签到失败",
                "论坛签到页面状态异常"
            );

        }


    } catch (e) {

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


// 清理HTML
function clean(str) {

    return str
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


// Loon通知
function notify(title, body) {

    $notification.post(
        "🍦奶昔论坛签到",
        title,
        body
    );
}
