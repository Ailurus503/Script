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

function headers() {
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
    headers: headers(),

    // HAR 中显示 e30= 是因为 HAR 使用了 Base64 编码。
    // 实际请求体必须是 {}
    body: "{}"
  };

  $httpClient.post(options, function (error, response, data) {
    if (error) {
      callback(error, null, response);
      return;
    }

    console.log(
      "[SF] HTTP Status: " +
        (response ? response.status : "unknown")
    );

    console.log("[SF] " + api + ": " + data);

    try {
      const json = JSON.parse(data);
      callback(null, json, response);
    } catch (e) {
      callback("JSON 解析失败：" + e, null, response);
    }
  });
}

function finish(title, subtitle, message) {
  $notification.post(title, subtitle, message);
  $done();
}

function getErrorMessage(data) {
  if (!data) return "";

  return (
    data.errorMessage ||
    data.message ||
    data.msg ||
    ""
  );
}


// ==============================
// 查询今天是否已经签到
// ==============================

post("getTodaySign", function (error, data) {

  if (error) {
    finish(
      "顺丰签到",
      "查询失败",
      String(error)
    );
    return;
  }

  if (!data) {
    finish(
      "顺丰签到",
      "查询失败",
      "接口没有返回有效数据"
    );
    return;
  }


  // ==============================
  // Cookie / 登录状态失效
  // ==============================

  if (data.success === false) {

    const msg = getErrorMessage(data);

    if (
      msg.indexOf("用户信息失效") !== -1 ||
      data.errorCode === "100111"
    ) {
      finish(
        "顺丰签到",
        "登录状态失效",
        "请打开一次顺丰 App 会员签到页，Loon 会自动更新 Cookie。"
      );

      return;
    }

    finish(
      "顺丰签到",
      "查询失败",
      msg || "未知错误"
    );

    return;
  }


  const obj = data.obj || {};


  // ==============================
  // 今天已经签到
  // ==============================

  if (obj.signed === true) {

    const dayCount =
      obj.dayCount !== undefined
        ? obj.dayCount
        : "-";

    const bubbleText =
      obj.bubbleText || "";

    finish(
      "顺丰签到",
      "今日已签到",
      "连续签到 " +
        dayCount +
        " 天" +
        (bubbleText ? "\n" + bubbleText : "")
    );

    return;
  }


  // ==============================
  // 今天未签到，开始签到
  // ==============================

  post("sign", function (error2, signData) {

    if (error2) {
      finish(
        "顺丰签到",
        "签到失败",
        String(error2)
      );

      return;
    }

    if (!signData) {
      finish(
        "顺丰签到",
        "签到失败",
        "接口没有返回有效数据"
      );

      return;
    }


    if (signData.success === false) {

      const msg = getErrorMessage(signData);

      if (
        msg.indexOf("用户信息失效") !== -1 ||
        signData.errorCode === "100111"
      ) {
        finish(
          "顺丰签到",
          "登录状态失效",
          "请打开一次顺丰 App 会员签到页，Loon 会自动更新 Cookie。"
        );

        return;
      }

      finish(
        "顺丰签到",
        "签到失败",
        msg || "未知错误"
      );

      return;
    }


    const signObj = signData.obj || {};

    const dayCount =
      signObj.dayCount !== undefined
        ? signObj.dayCount
        : "-";

    const awardNum =
      signObj.awardNum !== undefined
        ? signObj.awardNum
        : "";

    const awardType =
      signObj.awardType || "";


    let awardText = "";

    if (awardNum !== "") {
      if (awardType === "SFP") {
        awardText = "\n获得 " + awardNum + " 积分";
      } else {
        awardText = "\n获得奖励：" + awardNum;
      }
    }


    finish(
      "顺丰签到",
      "签到成功",
      "连续签到 " +
        dayCount +
        " 天" +
        awardText
    );
  });
});