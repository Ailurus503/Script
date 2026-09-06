/**
 * VaePlus.js
 * Loon 单脚本：
 * - http-response：自动捕获请求模板
 * - cron / generic：自动签到 + 每日登录奖励
 */

const KEY = {
  status: "VAE_STATUS_REQUEST",
  sign: "VAE_SIGN_REQUEST",
  task: "VAE_TASK_LIST_REQUEST",
  reward: "VAE_DAILY_REWARD_REQUEST",
  firstCapture: "VAE_AUTH_FIRST_CAPTURE_TIME",
  lastCapture: "VAE_AUTH_CAPTURE_TIME",
  lastSuccess: "VAE_LAST_SUCCESS_TIME",
  successDays: "VAE_AUTH_SUCCESS_DAYS",
  lastError: "VAE_LAST_AUTH_ERROR",
  lastRunDate: "VAE_LAST_RUN_DATE",
  lastResult: "VAE_LAST_RESULT"
};

const DEBUG = argBool("debug", false);
const NOTIFY = argBool("notify", true);

function argBool(name, fallback) {
  try {
    if (typeof $argument === "object" && $argument && name in $argument) {
      const v = $argument[name];
      if (typeof v === "boolean") return v;
      return String(v).toLowerCase() === "true";
    }
  } catch (_) {}
  return fallback;
}

function log(msg) {
  console.log(`[Vae+] ${msg}`);
}

function dbg(msg) {
  if (DEBUG) log(msg);
}

function json(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function cleanHeaders(headers) {
  const out = {};
  const blocked = new Set(["content-length", "host", "connection", "accept-encoding"]);
  Object.keys(headers || {}).forEach(k => {
    if (!blocked.has(k.toLowerCase())) out[k] = headers[k];
  });
  return out;
}

function notify(title, subtitle, body) {
  $notification.post(title, subtitle, body);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function findObject(root, test, depth=0) {
  if (depth > 12 || root == null) return null;
  if (typeof root === "object") {
    try { if (test(root)) return root; } catch (_) {}
    if (Array.isArray(root)) {
      for (const x of root) {
        const r = findObject(x, test, depth + 1);
        if (r) return r;
      }
    } else {
      for (const k of Object.keys(root)) {
        const r = findObject(root[k], test, depth + 1);
        if (r) return r;
      }
    }
  }
  return null;
}

function isResponseMode() {
  return typeof $response !== "undefined" && typeof $request !== "undefined";
}

/* ==================== 捕获模式 ==================== */

function saveTemplate(key, label, shouldNotify=false) {
  const tpl = {
    url: $request.url,
    method: ($request.method || "POST").toUpperCase(),
    headers: cleanHeaders($request.headers || {}),
    body: typeof $request.body === "string" ? $request.body : "",
    updateTime: Date.now()
  };

  const oldRaw = $persistentStore.read(key);
  const old = oldRaw ? json(oldRaw) : null;

  const normalize = x => x ? {
    url: x.url || "",
    method: x.method || "",
    headers: x.headers || {},
    body: x.body || ""
  } : null;

  const changed = JSON.stringify(normalize(old)) !== JSON.stringify(normalize(tpl));

  $persistentStore.write(JSON.stringify(tpl), key);

  const now = String(Date.now());
  if (!$persistentStore.read(KEY.firstCapture)) {
    $persistentStore.write(now, KEY.firstCapture);
  }
  $persistentStore.write(now, KEY.lastCapture);

  dbg(`${label} 已保存，changed=${changed}`);

  if (shouldNotify && changed) {
    notify("Vae+ 授权更新", label, "新的请求模板已保存");
  }
}

function captureMode() {
  try {
    const body = json($response.body || "");
    const rv = body && typeof body.requestVar === "string" ? body.requestVar : "";

    if (!rv) return $done({});

    if (rv.includes("/GAME/completeTask.json") && rv.includes("taskKey=201")) {
      saveTemplate(KEY.reward, "每日登录奖励请求已保存", true);
    } else if (rv.includes("/GAME/getTaskList.json")) {
      saveTemplate(KEY.task, "任务列表请求已保存");
    } else if (rv.includes("/USER_HOME/getRecordByMonth.json")) {
      saveTemplate(KEY.sign, "签到请求已保存");
    } else if (rv.includes("/USER_HOME/getRecord.json")) {
      saveTemplate(KEY.status, "签到状态请求已保存");
    }
  } catch (e) {
    log(`捕获异常：${e}`);
  }

  $done({});
}

/* ==================== 自动执行模式 ==================== */

let finished = false;

function done() {
  if (finished) return;
  finished = true;
  $done();
}

function loadTemplate(key) {
  const raw = $persistentStore.read(key);
  if (!raw) return null;
  const t = json(raw);
  if (!t || !t.url) return null;

  return {
    url: t.url,
    method: (t.method || "POST").toUpperCase(),
    headers: cleanHeaders(t.headers || {}),
    body: typeof t.body === "string" ? t.body : ""
  };
}

function requestTpl(tpl, cb) {
  const p = {
    url: tpl.url,
    headers: tpl.headers || {},
    timeout: 15000,
    "auto-cookie": true
  };
  if (tpl.body) p.body = tpl.body;

  const fn = {
    GET: "get",
    PUT: "put",
    PATCH: "patch",
    DELETE: "delete"
  }[tpl.method] || "post";

  $httpClient[fn](p, cb);
}

function parseResponse(error, response, data, label) {
  if (error) return {ok:false, authError:false, message:`${label}网络错误：${error}`};

  const status = response && response.status ? Number(response.status) : 0;

  if (status === 401 || status === 403) {
    return {ok:false, authError:true, message:`${label}授权失效（HTTP ${status}）`};
  }

  if (status < 200 || status >= 300) {
    return {ok:false, authError:false, message:`${label}HTTP ${status || "未知"}`};
  }

  const j = json(data || "");
  if (!j) return {ok:false, authError:false, message:`${label}返回数据无法解析`};

  if (j.state === false) {
    const m = j.message || j.msg || j.error || "state=false";
    const text = typeof m === "string" ? m : JSON.stringify(m);
    const authError = /登录|login|认证|授权|session|cookie|过期|失效|重新登录/i.test(text);
    return {ok:false, authError, message:`${label}${text}`};
  }

  return {ok:true, json:j};
}

function recordSuccess(text) {
  const d = today();
  const last = $persistentStore.read(KEY.lastRunDate);
  let days = Number($persistentStore.read(KEY.successDays) || "0");
  if (last !== d) days++;

  $persistentStore.write(String(Date.now()), KEY.lastSuccess);
  $persistentStore.write(String(days), KEY.successDays);
  $persistentStore.write(d, KEY.lastRunDate);
  $persistentStore.write("", KEY.lastError);
  $persistentStore.write(text, KEY.lastResult);
}

function recordFailure(text) {
  $persistentStore.write(JSON.stringify({time:Date.now(), message:text}), KEY.lastError);
  $persistentStore.write(text, KEY.lastResult);
}

function fail(message, authError=false) {
  log(message);
  recordFailure(message);

  if (authError) {
    notify(
      "Vae+ 授权已失效",
      "自动签到无法继续",
      "请打开 Vae+ 重新登录一次；登录后进入“每日签到”和“任务中心”各一次，插件会自动恢复。"
    );
  } else {
    notify("Vae+ 自动签到", "执行失败", message);
  }

  done();
}

function queryStatus(cb) {
  const tpl = loadTemplate(KEY.status);
  if (!tpl) return cb({ok:false, message:"缺少签到状态请求模板"});

  log("查询签到状态");
  requestTpl(tpl, (e,r,d) => {
    const p = parseResponse(e,r,d,"查询签到状态：");
    if (!p.ok) return cb(p);

    const record = findObject(
      p.json,
      o => Object.prototype.hasOwnProperty.call(o,"signToday") &&
           (Object.prototype.hasOwnProperty.call(o,"totalCount") ||
            Object.prototype.hasOwnProperty.call(o,"continuity"))
    );

    if (!record) return cb({ok:false, message:"未找到 signRecord"});
    cb({ok:true, record});
  });
}

function performSign(cb) {
  const tpl = loadTemplate(KEY.sign);
  if (!tpl) return cb({ok:false, message:"缺少签到请求模板"});

  log("执行签到");
  requestTpl(tpl, (e,r,d) => cb(parseResponse(e,r,d,"执行签到：")));
}

function queryTask(cb) {
  const tpl = loadTemplate(KEY.task);
  if (!tpl) return cb({ok:false, missing:true, message:"缺少任务列表模板"});

  log("查询每日登录任务状态");
  requestTpl(tpl, (e,r,d) => {
    const p = parseResponse(e,r,d,"查询任务列表：");
    if (!p.ok) return cb(p);

    const task = findObject(p.json, o => String(o.taskKey || "") === "201");
    if (!task) return cb({ok:false, message:"未找到 taskKey=201"});
    cb({ok:true, task});
  });
}

function claimReward(cb) {
  const tpl = loadTemplate(KEY.reward);
  if (!tpl) return cb({ok:false, missing:true, message:"缺少奖励领取模板"});

  log("领取每日登录奖励");
  requestTpl(tpl, (e,r,d) => {
    const p = parseResponse(e,r,d,"领取每日登录奖励：");
    if (!p.ok) return cb(p);

    const vbiObj = findObject(
      p.json,
      o => Object.prototype.hasOwnProperty.call(o,"vbi") && !Number.isNaN(Number(o.vbi))
    );

    cb({ok:true, vbi:vbiObj ? Number(vbiObj.vbi) : null});
  });
}

function report(signedNow, record, rewardText) {
  const subtitle = signedNow ? "签到成功🎉" : "今日已签到🎉";
  const body = [
    `连续签到：${Number(record.continuity || 0)}天`,
    `累计签到：${Number(record.totalCount || 0)}天`,
    `每日登录奖励：${rewardText}`
  ].join("\n");

  recordSuccess(`${subtitle} | ${body.replace(/\n/g," | ")}`);

  if (NOTIFY) notify("Vae+ 每日签到", subtitle, body);
  log(`${subtitle}；奖励=${rewardText}`);
  done();
}

function processReward(signedNow, record) {
  queryTask(res => {
    if (!res.ok) {
      if (res.authError) return fail(res.message, true);
      return report(signedNow, record, res.missing ? "未配置" : "查询失败");
    }

    const t = res.task;

    if (t.receiveReward === true) {
      return report(signedNow, record, "已领取");
    }

    if (t.complete === false) {
      return report(signedNow, record, "任务未完成");
    }

    if (t.complete === true && t.canReceive === true) {
      return claimReward(c => {
        if (!c.ok) {
          if (c.authError) return fail(c.message, true);
          return report(signedNow, record, c.missing ? "待领取（缺少模板）" : "领取失败");
        }

        queryTask(v => {
          if (v.ok && v.task.receiveReward === true) {
            return report(signedNow, record, c.vbi != null ? `+${c.vbi}` : "已领取");
          }

          if (v.authError) return fail(v.message, true);

          return report(signedNow, record, c.vbi != null ? `+${c.vbi}` : "已领取");
        });
      });
    }

    report(signedNow, record, "当前不可领取");
  });
}

function runMode() {
  log("开始执行自动签到");

  if (!loadTemplate(KEY.status) || !loadTemplate(KEY.sign)) {
    return fail("尚未初始化，请打开 Vae+ 并进入“每日签到”一次。");
  }

  queryStatus(first => {
    if (!first.ok) return fail(first.message, first.authError);

    if (first.record.signToday === true) {
      return processReward(false, first.record);
    }

    performSign(sign => {
      if (!sign.ok) return fail(sign.message, sign.authError);

      queryStatus(final => {
        if (!final.ok) return fail(final.message, final.authError);
        if (final.record.signToday !== true) {
          return fail("签到请求已发送，但服务器未确认今日签到成功");
        }

        processReward(true, final.record);
      });
    });
  });
}

if (isResponseMode()) {
  captureMode();
} else {
  runMode();
}
