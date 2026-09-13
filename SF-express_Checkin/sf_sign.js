const COOKIE_KEY = "sfexpress_cookie";

const BASE =
  "https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralSignV2Service~";

const cookie = $persistentStore.read(COOKIE_KEY);

if (!cookie) {
  $notification.post(
    "顺丰签到",
    "未获取登录状态",
    "请先打开一次顺丰 App 的会员签到页面"
  );

  $done();
  return;
}

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://mcs-mimp-web.sf-express.com",
    "Referer": "https://mcs-mimp-web.sf-express.com/up-member/newHome",
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "Cookie": cookie
  };
}

function post(api, callback) {
  const options = {
    url: BASE + api,
    headers: getHeaders(),
    body: "{}"
  };

  $httpClient.post(options, function (error, response, data) {
    if (error) {
      callback(error, null);
      return;
    }

    console.log(
      "[SF] " +
      api +
      " HTTP " +
      (response ? response.status : "unknown")
    );

    console.log("[SF] " + api + ": " + data);

    try {
      callback(null, JSON.parse(data));
    } catch (e) {
      callback("JSON 解析失败：" + e, null);
    }
  });
}

function finish(subtitle, message) {
  $notification.post(
    "顺丰签到",
    subtitle,
    message
  );

  $done();
}

function getMsg(data) {
  if (!data) return "";

  return (
    data.errorMessage ||
    data.message ||
    data.msg ||
    ""
  );
}

function isLoginExpired(data) {
  if (!data) return false;

  const msg = getMsg(data);

  return (
    String(data.errorCode || "") === "100111" ||
    msg.indexOf("用户信息失效") !== -1
  );
}


// 查询签到状态
post("getTodaySign", function (error, data) {

  if (error) {
    finish(
      "查询失败",
      String(error)
    );
    return;
  }

  if (!data) {
    finish(
      "查询失败",
      "接口没有返回有效数据"
    );
    return;
  }

  if (data.success === false) {

    if (isLoginExpired(data)) {
      finish(
        "登录状态失效",
        "请打开一次顺丰 App → 会员签到页，登录状态会自动更新。"
      );
      return;
    }

    finish(
      "查询失败",
      getMsg(data) || "未知错误"
    );

    return;
  }

  const obj = data.obj || {};

  if (obj.signed === true) {

    let text =
      "连续签到 " +
      (obj.dayCount !== undefined ? obj.dayCount : "-") +
      " 天";

    if (obj.bubbleText) {
      text += "\n" + obj.bubbleText;
    }

    finish(
      "今日已签到",
      text
    );

    return;
  }


  // 未签到，执行签到
  post("sign", function (error2, signData) {

    if (error2) {
      finish(
        "签到失败",
        String(error2)
      );
      return;
    }

    if (!signData) {
      finish(
        "签到失败",
        "接口没有返回有效数据"
      );
      return;
    }

    if (signData.success === false) {

      if (isLoginExpired(signData)) {
        finish(
          "登录状态失效",
          "请打开一次顺丰 App → 会员签到页，登录状态会自动更新。"
        );
        return;
      }

      finish(
        "签到失败",
        getMsg(signData) || "未知错误"
      );

      return;
    }

    const obj2 = signData.obj || {};

    let text =
      "连续签到 " +
      (obj2.dayCount !== undefined ? obj2.dayCount : "-") +
      " 天";

    if (obj2.awardNum !== undefined) {

      if (obj2.awardType === "SFP") {
        text += "\n获得 " + obj2.awardNum + " 积分";
      } else {
        text += "\n获得奖励：" + obj2.awardNum;
      }
    }

    finish(
      "签到成功",
      text
    );
  });
});