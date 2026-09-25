/* Vae+ 自动签到。Surge cron/generic，必须使用 engine=webview。
 * 从 GetAuth 的 VAE_AUTH_V2 读取凭证，自行生成 q；不保存或重放请求模板。
 */
(function () {
    'use strict';
    const AUTH_KEY = 'VAE_AUTH_V2';
    const URL = 'https://api1.starfans.com/auth/';
    const DEVICE_KEYS = ['app_o', 'app_v', 'registrationId', 'self_userid', 'sysModel', 'sys_v', 'terminal', 'userId', 'uvkey', 'uvsign'];
    function fail(s) { throw new Error(s); }
    function bytes(s) { return new TextEncoder().encode(String(s)); }
    function hex(n) { return ('00000000' + (n >>> 0).toString(16)).slice(-8); }
    // UTF-8 MD5，与 APK 的 FileUtil.MD5 一致。
    function md5(input) {
        const src = bytes(input), size = src.length, padded = new Uint8Array((size + 9 + 63 & ~63));
        padded.set(src); padded[size] = 128;
        let bits = BigInt(size) * 8n;
        for (let i = 0; i < 8; i++) { padded[padded.length - 8 + i] = Number(bits & 255n); bits >>= 8n; }
        let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
        const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
        for (let offset = 0; offset < padded.length; offset += 64) {
            const w = new Uint32Array(16);
            for (let j = 0; j < 16; j++) { const p = offset + j * 4; w[j] = (padded[p] | padded[p+1]<<8 | padded[p+2]<<16 | padded[p+3]<<24) >>> 0; }
            let A=a,B=b,C=c,D=d;
            for (let i=0;i<64;i++) {
                let f,g;
                if (i<16) { f=(B&C)|(~B&D); g=i; }
                else if (i<32) { f=(D&B)|(~D&C); g=(5*i+1)%16; }
                else if (i<48) { f=B^C^D; g=(3*i+5)%16; }
                else { f=C^(B|~D); g=(7*i)%16; }
                const v=(A+f+w[g]+Math.floor(Math.abs(Math.sin(i+1))*4294967296))>>>0;
                A=D;D=C;C=B;B=(B+((v<<S[i])|(v>>>(32-S[i]))))>>>0;
            }
            a=(a+A)>>>0;b=(b+B)>>>0;c=(c+C)>>>0;d=(d+D)>>>0;
        }
        return [a,b,c,d].map(x => { const h=hex(x); return h.slice(6)+h.slice(4,6)+h.slice(2,4)+h.slice(0,2); }).join('');
    }
    function secureRandom(n) {
        if (!globalThis.crypto || !crypto.getRandomValues) fail('需要 Surge WebView 引擎的安全随机数');
        const out = new Uint8Array(n); crypto.getRandomValues(out); return out;
    }
    function tlv(data, at) {
        if (at >= data.length) fail('公钥 DER 不完整');
        const tag = data[at++]; let len = data[at++];
        if (len & 128) { const count = len & 127; len=0; for(let i=0;i<count;i++) len=(len<<8)|data[at++]; }
        const start=at,end=start+len;
        if(end>data.length) fail('公钥 DER 长度错误');
        return {tag,start,end};
    }
    function num(arr) { let n=0n; for (const x of arr) n=(n<<8n)|BigInt(x); return n; }
    function publicKey(raw) {
        const der = Uint8Array.from(atob(raw.replace(/-----[^-]+-----|\s/g,'')), x=>x.charCodeAt(0));
        const root=tlv(der,0), alg=tlv(der,root.start), bit=tlv(der,alg.end);
        if(root.tag!==48 || bit.tag!==3 || der[bit.start]!==0) fail('公钥格式不支持');
        const seq=tlv(der,bit.start+1), mod=tlv(der,seq.start), exp=tlv(der,mod.end);
        if(mod.tag!==2 || exp.tag!==2) fail('公钥整数格式错误');
        const modulus=num(der.slice(mod.start,mod.end)), exponent=num(der.slice(exp.start,exp.end));
        const keySize=Math.ceil((mod.end-mod.start-(der[mod.start]===0?1:0)));
        if(keySize!==128 || exponent!==65537n) fail('此版本只验证了 1024 位 RSA 公钥');
        return {modulus,exponent,keySize};
    }
    function pow(base, exp, modulus) {
        let out=1n;
        while(exp>0n) { if(exp&1n) out=out*base%modulus; base=base*base%modulus; exp>>=1n; }
        return out;
    }
    function rsaEncrypt(message, key) {
        const input=bytes(message), width=key.keySize, max=width-11;
        const out=new Uint8Array(Math.ceil(input.length/max)*width);
        for(let offset=0,block=0;offset<input.length;offset+=max,block++) {
            const part=input.slice(offset,offset+max), padded=new Uint8Array(width);
            padded[0]=0;padded[1]=2;
            for(let i=2;i<width-part.length-1;i++) { let v=0; while(!v) v=secureRandom(1)[0]; padded[i]=v; }
            padded[width-part.length-1]=0;padded.set(part,width-part.length);
            let encrypted=pow(num(padded),key.exponent,key.modulus);
            for(let i=width-1;i>=0;i--) { out[block*width+i]=Number(encrypted&255n);encrypted>>=8n; }
        }
        let binary='';for(const byte of out) binary+=String.fromCharCode(byte);
        return btoa(binary);
    }
    function generateQ(action, specific, auth, key) {
        const p={};
        for(const name of DEVICE_KEYS) if(auth[name]!==undefined && auth[name]!=='') p[name]=String(auth[name]);
        Object.assign(p,specific || {});
        p._authOnce=Array.from(secureRandom(8),v=>'abcdefghijklmnopqrstuvwxyz0123456789'[v%36]).join('');
        p.action=action;
        const sorted=Object.keys(p).sort();
        const signature=sorted.filter(k=>p[k]!==null && typeof p[k]!=='object').map(k=>k+'='+p[k]).join('&')+'#xusong#';
        p._authKey=md5(signature);
        // Android RequestParams 使用 JSON.toJSONString；服务端将其解密后再解析。
        const value=rsaEncrypt(JSON.stringify(p),key);
        const index=Number.parseInt(auth.userId,10)%128;
        if(!Number.isSafeInteger(index) || index<0 || index>=value.length) fail('userId 不适合 q 编码');
        const chars=value.split('');[chars[0],chars[index]]=[chars[index],chars[0]];
        return chars.join('');
    }
    function request(action, params, auth, key) {
        return new Promise((resolve,reject)=>{
            let q;
            try { q=generateQ(action,params,auth,key); } catch(e) { reject(e);return; }
            // 只记录 action 和长度，便于与手机 HAR 对照；不输出 q 或登录凭证。
            console.log('[Vae+ AutoSign] '+action+' q.length='+q.length);
            const headers={'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','Cookie':auth.cookie};
            if(auth.userAgent) headers['User-Agent']=auth.userAgent;
            $httpClient.post({url:URL,headers,body:'q='+encodeURIComponent(q),timeout:20},(err,res,data)=>{
                if(err) return reject(new Error('请求失败：'+err));
                if(!res || Number(res.status || res.statusCode)!==200) return reject(new Error('HTTP '+(res && (res.status||res.statusCode))));
                try {
                    const obj=JSON.parse(data);
                    if(obj.state!==true || (obj.errNo!=='' && obj.errNo!==0 && obj.errNo!==undefined && obj.errNo!==null))
                        return reject(new Error('接口返回错误：'+String(obj.errMsg||obj.errNo||obj.state)));
                    resolve(obj.result || {});
                } catch(e) { reject(e); }
            });
        });
    }
    function findTask(root) {
        if(!root || typeof root!=='object') return null;
        if(String(root.taskKey)==='201') return root;
        for(const v of Object.values(root)) { const item=findTask(v);if(item) return item; }
        return null;
    }
    function notify(message) { console.log('[Vae+ AutoSign] '+message);if(typeof $notification!=='undefined') $notification.post('Vae+ 自动签到','',message); }
    function signSummary(record) {
        const total=Number(record.totalCount), streak=Number(record.continuity);
        return Number.isSafeInteger(total) && total>=0 && Number.isSafeInteger(streak) && streak>=0
            ? '累计签到 '+total+' 天，连续签到 '+streak+' 天'
            : '签到天数暂不可用';
    }
    async function main() {
        const auth=JSON.parse($persistentStore.read(AUTH_KEY)||'{}');
        if(!auth.cookie || !auth.userId || !auth.sslPubKey || !auth.uvkey || !auth.uvsign)
            fail('授权资料不完整：请在启用 GetAuth 后重新登录 Vae+ 并打开一次首页');
        const key=publicKey(auth.sslPubKey);
        const status=await request('/USER_HOME/getRecord.json',{loginUserId:auth.userId},auth,key);
        if(!status.signRecord || typeof status.signRecord.signToday!=='boolean') fail('签到状态响应缺少 signRecord');
        let signedNow=false;
        let signRecord=status.signRecord;
        if(!status.signRecord.signToday) {
            await request('/USER_HOME/addRecord.json',{loginUserId:auth.userId},auth,key);
            const confirmed=await request('/USER_HOME/getRecord.json',{loginUserId:auth.userId},auth,key);
            if(!confirmed.signRecord || confirmed.signRecord.signToday!==true) fail('签到请求后未获服务器确认');
            signRecord=confirmed.signRecord;
            signedNow=true;
        }
        const signedMessage=(signedNow?'签到成功':'今日已签到')+'；'+signSummary(signRecord);
        const taskParams={loginUserId:auth.userId,page:'1',pageNo:'1',pageSize:'10'};
        const taskResult=await request('/GAME/getTaskList.json',taskParams,auth,key);
        const task=findTask(taskResult);
        if(!task) fail('未找到每日登录任务 taskKey=201');
        if(task.receiveReward===true) { notify(signedMessage+'；每日登录奖励已领取');return; }
        if(task.complete===true && task.canReceive===true) {
            await request('/GAME/completeTask.json',{loginUserId:auth.userId,taskKey:'201'},auth,key);
            const check=findTask(await request('/GAME/getTaskList.json',taskParams,auth,key));
            if(!check || check.receiveReward!==true) fail('领取请求已发送，但奖励未获服务器确认');
            notify(signedMessage+'；每日登录奖励领取成功');return;
        }
        notify(signedMessage+'；每日登录奖励尚不满足领取条件');
    }
    main().catch(e=>notify('执行失败：'+String(e.message||e))).finally(()=>$done());
})();