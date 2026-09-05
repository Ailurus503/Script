/*
奶昔论坛 Cookie 获取
Loon
*/

const cookie = $request.headers["Cookie"] || 
               $request.headers["cookie"];

if(cookie){

    $persistentStore.write(
        cookie,
        "NaixiCookie"
    );

    $notification.post(
        "奶昔论坛",
        "Cookie保存成功",
        "已更新登录状态"
    );

}

$done();
