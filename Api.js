/*************************************************************
 * UNION ONE 출퇴근 웹앱 API   ·   Api.js
 * 새 워크스페이스로 옮기면서 다시 정리 · 2026-08-27
 *
 * [역할]
 *  - 화면은 만들지 않는다. JSON만 주고받는다.
 *    → 구글 "이 앱은 Apps Script로 실행되었습니다" 배너가 나올 자리가 없다.
 *  - 화면은 깃허브의 index.html(PWA)이 전부 그린다.
 *
 * [설치]
 *  1) 출퇴근관리 프로젝트 → 파일 추가 → 스크립트 → 이름 Api
 *  2) 이 내용을 통째로 붙여넣기 (기존 Code.gs 는 그대로 둔다)
 *  3) 배포 → 새 배포 → 유형: 웹 앱
 *       설명: 출퇴근 API v1
 *       실행: 나
 *       액세스 권한: 모든 사용자
 *  4) 나온 /exec 주소를 index.html 의 API_URL 에 붙여넣기
 *
 * [주의]
 *  코드를 고친 뒤에는 "새 배포"가 아니라
 *  배포 관리 → 연필 아이콘 → 버전: 새 버전 → 배포
 *  로 올려야 주소가 바뀌지 않는다. 주소가 바뀌면 직원 폰이 전부 끊긴다.
 *
 * [기준키]
 *  사람 = 전화번호, 기기 = deviceToken. Code.gs 와 동일하다.
 *************************************************************/

/* 근태 기록이 쌓이는 스프레드시트.
   편집기 [프로젝트 설정] > [스크립트 속성] 에 SHEET_ID 로 넣어주세요. */
const API_SPREADSHEET_ID = '';

/* 사람 정보를 가져올 워크보드 스프레드시트.
   스크립트 속성 WORKBOARD_ID 로 넣어주세요.
   이 앱은 명부를 따로 갖지 않고 워크보드 '직원' 시트만 봅니다. */
const WORKBOARD_STAFF_SHEET = '직원';

/* PIN 을 되돌릴 수 없는 형태로 바꿀 때 쓰는 값.
   ★ 워크보드의 SALT 와 반드시 같아야 합니다. 다르면 PIN 이 전부 안 맞습니다. */
const WORKBOARD_SALT = 'ncore-workboard-2026';

/* 현장 목록을 가져올 견적 스프레드시트.
   스크립트 속성 ESTIMATE_ID 로 넣어주세요.
   견적대장에 등록된 현장이 출근할 때 목록으로 뜹니다. */
const ESTIMATE_LEDGER_SHEET = '견적대장';

/* 사무실도 현장도 아닐 때 고르는 항목.
   실측이나 사전 답사처럼 아직 계약 전인 방문에 씁니다. */
const ETC_SITE_NAME = '기타현장';

/* 현장 폴더 안에 출퇴근 사진을 담을 하위 폴더 이름 */
const SITE_ATTENDANCE_FOLDER = '08_출퇴근사진';

/* 현장사진이 쌓일 폴더 — UNION ONE > 02_출퇴근사진 */
const API_PHOTO_ROOT_ID   = '12MU2WVkpG8jndDYFybuhivQNE0VQ_W7h';
const API_MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const CACHE_SITES_ON = true;
const SITE_CACHE_KEY = 'attendance_sites_v1';
const SITE_CACHE_SECONDS = 600;
let requestApiSs = null;
let requestEstimateSs = null;
let requestWorkboardSs = null;


/* ============================================================
 *  값 캐시 (2026-08-28)
 *
 *  status(앱 열기)는 직원 여섯 명이 아침저녁으로 부르는 길인데,
 *  스프레드시트를 열고 시트 세 장을 읽느라 구글에 열 번 가까이 물었습니다.
 *  실측 비용은 스프레드시트 열기 1~2초, 시트 읽기 한 번 0.15~1초입니다.
 *
 *  읽기만 하는 이 길을 CacheService 로 돌립니다.
 *    (1) 시트마다 '번호표' 를 스크립트 속성에 하나씩 둔다
 *    (2) 캐시 칸 이름 = 시트이름 + 번호표
 *    (3) 요청에서 처음 읽을 때 getProperties() 1번 + getAll() 1번
 *    (4) 시트에 쓰면 그 시트의 번호표만 새로 만든다
 *
 *  ★ 쓰기 경로(출근·퇴근·사진·등록)는 캐시를 절대 믿지 않습니다.
 *    언제나 시트를 열어 줄을 찾고 씁니다. 잘못된 줄에 쓰는 것이
 *    느린 것보다 훨씬 나쁘기 때문입니다.
 *  ★ ATT_CACHE_ON = false 한 줄로 옛 방식으로 완전히 돌아갑니다.
 * ========================================================== */

const ATT_CACHE_ON = true;
const ATT_CACHE_SECONDS = 21600;          // 6시간
const ATT_CACHE_MAX_BYTES = 95000;        // 이보다 크면 담지 않고 옛 방식으로
const ATT_TAIL_ROWS = 400;                // 계속 쌓이는 시트는 뒤에서 이만큼만

let _attVer = null;                        // 요청당 속성 1회
let _attGot = null;                        // 요청당 getAll 1회
let _attVals = {};                         // 요청 안에서 두 번 만들지 않게

/** 스크립트 속성을 요청당 한 번만 통째로 가져온다 */
function attVerAll_() {
  if (_attVer) return _attVer;
  try { _attVer = PropertiesService.getScriptProperties().getProperties() || {}; }
  catch (error) { _attVer = {}; }
  return _attVer;
}

function attKey_(name) {
  const v = attVerAll_()['V_' + name] || '0';
  return 'attv|' + name + '|' + v;
}

/** 담아둔 것을 한 번에 꺼낸다 (시트 3장 + 현장목록을 getAll 한 번으로) */
function attGetAll_() {
  if (_attGot) return _attGot;
  _attGot = {};
  if (!ATT_CACHE_ON) return _attGot;
  try {
    const keys = [attKey_(SHEET_USERS), attKey_(SHEET_LOG), attKey_(SHEET_PHOTO), SITE_CACHE_KEY];
    _attGot = CacheService.getScriptCache().getAll(keys) || {};
  } catch (error) { _attGot = {}; }
  return _attGot;
}

/** 시트에 쓴 뒤 부른다. 번호표를 새로 만들어 담아둔 값을 버린다.
    1씩 올리지 않고 매번 새 값을 만든다 — 두 사람이 같은 순간에 저장해도 안전하다. */
function attBump_(name) {
  try {
    PropertiesService.getScriptProperties()
      .setProperty('V_' + name, String(new Date().getTime()) + Math.floor(Math.random() * 1000));
  } catch (error) { /* 번호표를 못 바꾸면 캐시가 6시간 뒤 저절로 만료된다 */ }
  delete _attVals[name];
  _attVer = null;
  _attGot = null;
}

/**
 * 시트 값을 가져온다. { start: 첫 줄 번호, rows: [[...]], last: 마지막 줄 }
 * start 는 rows[0] 이 시트의 몇 번째 줄인지를 뜻한다 (줄 번호를 잃지 않게).
 */
function attValues_(name, headers) {
  if (_attVals[name]) return _attVals[name];

  if (ATT_CACHE_ON) {
    const raw = attGetAll_()[attKey_(name)];
    if (raw) {
      try {
        const box = JSON.parse(raw);
        box.rows = box.rows.map(attDecodeRow_);
        _attVals[name] = box;
        return box;
      } catch (error) { /* 깨졌으면 아래에서 시트를 읽는다 */ }
    }
  }

  const sheet = apiSheet_(name, headers);
  const lastRow = sheet.getLastRow();
  const width = headers.length;

  let start = 2;
  let rows = [];
  if (lastRow >= 2) {
    /* 계속 쌓이는 시트는 뒤에서 몇 줄만 읽는다.
       줄 수가 시간을 만들지는 않지만, 캐시 한 칸(100KB)에 담기 위해서다. */
    if (lastRow - 1 > ATT_TAIL_ROWS) start = lastRow - ATT_TAIL_ROWS + 1;
    rows = sheet.getRange(start, 1, lastRow - start + 1, width).getValues();
  }

  const box = { start: start, rows: rows, last: lastRow };
  _attVals[name] = box;

  if (ATT_CACHE_ON) {
    try {
      const text = JSON.stringify({ start: start, last: lastRow, rows: rows.map(attEncodeRow_) });
      if (attBytes_(text) <= ATT_CACHE_MAX_BYTES) {
        CacheService.getScriptCache().put(attKey_(name), text, ATT_CACHE_SECONDS);
      }
    } catch (error) { /* 담지 못해도 값은 이미 있다 */ }
  }
  return box;
}

/* JSON 은 Date 를 글자로 바꿔버린다. 되살릴 수 있게 표시를 달아 담는다.
   ★ 반드시 Date 객체로 되돌린다. 글자로 두면 시각 계산이 어긋난다. */
function attEncodeRow_(row) {
  return row.map(function (v) {
    return (v instanceof Date) ? { __d: v.getTime() } : v;
  });
}
function attDecodeRow_(row) {
  return row.map(function (v) {
    if (v && typeof v === 'object' && typeof v.__d === 'number') return new Date(v.__d);
    return v;
  });
}
function attBytes_(text) {
  let n = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    n += c < 0x80 ? 1 : (c < 0x800 ? 2 : 3);
  }
  return n;
}


/* ============================================================
 *  입구
 * ========================================================== */

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const action = String(params.action || 'ping');

  if (action === 'ping') {
    return apiOut_({
      ok: true,
      service: 'ncore-attendance',
      time: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')
    });
  }

  return apiOut_(apiRun_({ action: action, deviceToken: params.deviceToken || '' }));
}


function doPost(e) {
  let body = null;

  try {
    body = JSON.parse(e.postData.contents);
  } catch (error) {
    return apiOut_({ ok: false, message: '요청 형식이 올바르지 않습니다.' });
  }

  return apiOut_(apiRun_(body));
}


function apiOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


function apiRun_(body) {
  try {
    requestApiSs = null;
    requestEstimateSs = null;
    requestWorkboardSs = null;
    _attVer = null; _attGot = null; _attVals = {};
    const action = String((body && body.action) || '').trim();
    const token  = String((body && body.deviceToken) || '').trim();

    if (!token) return { ok: false, message: '기기 정보를 확인할 수 없습니다.' };

    switch (action) {
      case 'status':   return apiStatus_(token);
      case 'register': return apiRegister_(token, body);
      case 'checkin':  return apiCheck_(token, body, 'in');
      case 'checkout': return apiCheck_(token, body, 'out');
      case 'photo':    return apiPhoto_(token, body);
      default:         return { ok: false, message: '알 수 없는 요청입니다.' };
    }
  } catch (error) {
    return { ok: false, message: '서버 처리 중 오류가 발생했습니다: ' + (error && error.message ? error.message : error) };
  }
}


/* ============================================================
 *  조회
 * ========================================================== */

function apiStatus_(token) {
  const user = apiUserByToken_(token);
  if (!user) return { ok: true, registered: false };

  const dateKey = todayKey_();

  let inTime = '';
  let outTime = '';
  let todaySite = '';
  let todaySiteId = '';

  /* 보여주기만 하는 길이므로 담아둔 값에서 읽는다 (시트를 열지 않는다).
     예전에는 여기서 스프레드시트를 열고 시트를 세 번 읽었다. */
  const values = apiTodayValues_(dateKey, user.phone);
  if (values) {
    inTime = formatTime_(values[3]);
    outTime = formatTime_(values[8]);
    /* 오늘 이미 출근했다면 그때 고른 현장을 보여준다 */
    todaySite = String(values[LOG_COL.현장명 - 1] || '').trim();
    todaySiteId = String(values[LOG_COL.현장폴더ID - 1] || '').trim();
  }

  let sites = [];
  try { sites = apiSites_(); } catch (error) { sites = [{ name: OFFICE_SITE_NAME, folderId: '' }]; }

  return {
    ok: true,
    registered: true,
    name: user.name,
    phone: user.phone,
    date: dateKey,
    inTime: inTime,
    outTime: outTime,
    status: inTime ? (outTime ? '퇴근완료' : '근무중') : '미출근',
    photos: apiPhotoCount_(dateKey, user.phone),
    serverTime: Utilities.formatDate(new Date(), 'Asia/Seoul', 'HH:mm'),

    sites: sites,
    siteName: todaySite || user.lastSiteName || OFFICE_SITE_NAME,
    siteId: todaySite ? todaySiteId : (user.lastSiteId || ''),
    siteLocked: !!inTime
  };
}

function apiKnownStatus_(user, dateKey, inValue, outValue, sites, siteName, siteId, photoCount) {
  const inTime = formatTime_(inValue);
  const outTime = formatTime_(outValue);

  return {
    ok: true,
    registered: true,
    name: user.name,
    phone: user.phone,
    date: dateKey,
    inTime: inTime,
    outTime: outTime,
    status: inTime ? (outTime ? '퇴근완료' : '근무중') : '미출근',
    photos: photoCount,
    serverTime: Utilities.formatDate(new Date(), 'Asia/Seoul', 'HH:mm'),
    sites: sites,
    siteName: siteName || user.lastSiteName || OFFICE_SITE_NAME,
    siteId: siteName ? (siteId || '') : (user.lastSiteId || ''),
    siteLocked: !!inTime
  };
}


/* ============================================================
 *  등록
 * ========================================================== */

function apiRegister_(token, body) {
  const phone = phoneDigits_((body && body.phone) || '');
  const pin   = String((body && body.pin) || '').replace(/[^0-9]/g, '');

  if (phone.length !== 11) {
    return { ok: false, message: '전화번호를 숫자 11자리로 입력해 주세요.' };
  }
  if (pin.length !== 4) {
    return { ok: false, message: '워크보드에서 쓰시는 PIN 4자리를 입력해 주세요.' };
  }

  /* 워크보드 명부에서 확인한다.
     승인받지 않은 사람은 여기서 막힌다. */
  let staff = null;
  try {
    staff = apiFindStaff_(phone);
  } catch (error) {
    return { ok: false, message: error && error.message ? error.message : '명부를 읽지 못했습니다.' };
  }

  if (!staff) {
    return { ok: false, message: '등록되지 않은 번호입니다. 워크보드에서 사용 신청을 먼저 해주세요.' };
  }
  if (staff.state === '승인대기') {
    return { ok: false, message: '승인 대기 중입니다. 관리자가 승인하면 이용할 수 있습니다.' };
  }
  if (staff.state !== '재직') {
    return { ok: false, message: '사용할 수 없는 번호입니다.' };
  }
  if (!staff.pinHash) {
    return { ok: false, message: '워크보드에서 PIN을 먼저 설정해 주세요.' };
  }
  if (apiHashPin_(phone, pin) !== staff.pinHash) {
    return { ok: false, message: 'PIN이 맞지 않습니다. 워크보드에서 쓰시는 PIN을 입력해 주세요.' };
  }

  /* 이름은 명부 것을 그대로 쓴다. 오타로 딴사람이 되는 일을 막는다. */
  const name = staff.name;
  const phoneText = normalizePhone_(phone);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const sheet = apiSheet_(SHEET_USERS, HEADERS.USERS);
    const lastRow = sheet.getLastRow();
    const now = new Date();

    let found = 0;
    if (lastRow >= 2) {
      const phones = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
      for (let i = 0; i < phones.length; i += 1) {
        if (phoneDigits_(phones[i][0]) === phone) { found = i + 2; break; }
      }
    }

    if (found) {
      // 기기 변경 · 재설치도 같은 사람으로 이어붙인다
      sheet.getRange(found, 2, 1, 5).setValues([[name, phoneText, token, true, now]]);
    } else {
      sheet.appendRow([now, name, phoneText, token, true, now, '']);
    }

    attBump_(SHEET_USERS);
    apiClearCache_();
  } finally {
    lock.releaseLock();
  }

  const result = apiKnownStatus_(
    { name: name, phone: phone },
    todayKey_(),
    '',
    '',
    apiSites_(),
    '',
    '',
    0
  );
  result.message = name + '님, 등록이 완료되었습니다.';
  return result;
}


/* ============================================================
 *  출근 · 퇴근
 * ========================================================== */

function apiCheck_(token, body, kind) {
  const user = apiUserByToken_(token);
  if (!user) {
    return { ok: false, code: 'NOT_REGISTERED', message: '등록되지 않은 기기입니다. 이름과 전화번호를 먼저 등록해 주세요.' };
  }

  const lat = apiNumber_(body && body.lat);
  const lng = apiNumber_(body && body.lng);
  const acc = apiNumber_(body && body.acc);
  const map = (lat === '' || lng === '') ? '' : ('https://www.google.com/maps?q=' + lat + ',' + lng);

  const dateKey = todayKey_();
  const now = new Date();
  let checkInValue = '';

  /* 출근할 때 고른 현장. 보내온 이름이 실제 목록에 있는지 확인한다. */
  let site = { name: OFFICE_SITE_NAME, folderId: '' };
  if (kind === 'in') {
    const wanted = String((body && body.siteName) || '').trim();
    if (wanted) {
      let sites = [];
      try { sites = apiSites_(); } catch (error) { sites = []; }
      sites.forEach(function (one) {
        if (one.name === wanted) site = one;
      });
    }
  }

  let lastSite = null;                 // 출근일 때만 채운다

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const sheet = apiSheet_(SHEET_LOG, HEADERS.LOG);
    /* ★ 쓰기 직전이므로 담아둔 값이 아니라 시트에서 직접 줄을 찾는다 */
    const row = apiTodayRow_(sheet, dateKey, user.phone);

    if (kind === 'in') {
      if (row) {
        const times = sheet.getRange(row, LOG_COL.출근시각, 1,
          LOG_COL.퇴근시각 - LOG_COL.출근시각 + 1).getValues()[0];
        checkInValue = times[0];
        if (times[0]) {
          return { ok: false, message: '오늘 출근 기록이 이미 있습니다.' };
        }
        /* 예전에는 같은 줄에 네 번 나눠 썼다 (구글 왕복 4회).
           빈 칸을 그대로 살려 4번~18번을 한 번에 쓴다 (왕복 1회). */
        const keep = sheet.getRange(row, LOG_COL.출근시각, 1,
          LOG_COL.현장폴더ID - LOG_COL.출근시각 + 1).getValues()[0];
        const put = keep.slice();
        put[LOG_COL.출근시각   - LOG_COL.출근시각] = now;
        put[LOG_COL.출근위도   - LOG_COL.출근시각] = lat;
        put[LOG_COL.출근경도   - LOG_COL.출근시각] = lng;
        put[LOG_COL.출근정확도 - LOG_COL.출근시각] = acc;
        put[LOG_COL.출근지도   - LOG_COL.출근시각] = map;
        put[LOG_COL.상태       - LOG_COL.출근시각] = '근무중';
        put[LOG_COL.기기토큰   - LOG_COL.출근시각] = token;
        put[LOG_COL.기록시각   - LOG_COL.출근시각] = now;
        put[LOG_COL.현장명     - LOG_COL.출근시각] = site.name;
        put[LOG_COL.현장폴더ID - LOG_COL.출근시각] = site.folderId;
        sheet.getRange(row, LOG_COL.출근시각, 1, put.length).setValues([put]);
      } else {
        sheet.appendRow([
          dateKey, user.name, user.phone,
          now, lat, lng, acc, map,
          '', '', '', '', '',
          '근무중', token, now,
          site.name, site.folderId, ''
        ]);
      }

      /* 다음에 열면 이 현장이 이미 골라져 있게 한다.
         '최근접속' 도 같은 줄이라 아래 apiTouchUser_ 와 합쳐 한 번에 쓴다. */
      lastSite = [site.name, site.folderId];

    } else {
      if (!row) {
        return { ok: false, message: '오늘 출근 기록이 없습니다. 출근을 먼저 눌러 주세요.' };
      }
      /* 출근시각(4)부터 근무시간(19)까지 한 번에 읽는다.
         ★ 현장명·현장폴더ID(17,18)도 같이 읽어서 그대로 되돌려 놓는다.
           퇴근할 때 site 는 기본값 '사무실' 이라, 안 읽고 쓰면
           **아침에 고른 현장이 사무실로 덮여버린다.** */
      const times = sheet.getRange(row, LOG_COL.출근시각, 1,
        LOG_COL.근무시간 - LOG_COL.출근시각 + 1).getValues()[0];
      checkInValue = times[0];
      if (!times[0]) {
        return { ok: false, message: '오늘 출근 기록이 없습니다. 출근을 먼저 눌러 주세요.' };
      }
      if (times[LOG_COL.퇴근시각 - LOG_COL.출근시각]) {
        return { ok: false, message: '오늘 퇴근 기록이 이미 있습니다.' };
      }

      /* 퇴근시각(9)부터 근무시간(19)까지 한 번에 쓴다 (예전에는 두 번).
         근무시간은 월별·연별 집계가 더하는 값이다. */
      const outRow = times.slice(LOG_COL.퇴근시각 - LOG_COL.출근시각);   // 9~19 의 지금 값
      const at = function (col) { return col - LOG_COL.퇴근시각; };
      outRow[at(LOG_COL.퇴근시각)]   = now;
      outRow[at(LOG_COL.퇴근위도)]   = lat;
      outRow[at(LOG_COL.퇴근경도)]   = lng;
      outRow[at(LOG_COL.퇴근정확도)] = acc;
      outRow[at(LOG_COL.퇴근지도)]   = map;
      outRow[at(LOG_COL.상태)]       = '퇴근완료';
      outRow[at(LOG_COL.기기토큰)]   = token;
      outRow[at(LOG_COL.기록시각)]   = now;
      outRow[at(LOG_COL.근무시간)]   = workHours_(times[0], now);
      /* 현장명·현장폴더ID 는 읽은 값 그대로 둔다 (건드리지 않는다) */
      sheet.getRange(row, LOG_COL.퇴근시각, 1, outRow.length).setValues([outRow]);
    }

    /* 사용자 줄은 한 번만 쓴다 ('최근접속' 과 '마지막현장' 을 합쳐서).
       전화번호를 같이 넘겨 그 줄이 정말 이 사람인지 확인하게 한다. */
    apiTouchUser_(user.row, now, lastSite, user.phone);

    /* 시트를 고쳤으니 담아둔 값을 버린다 — 다음 status 가 새 값을 본다 */
    attBump_(SHEET_LOG);
    attBump_(SHEET_USERS);
    apiClearCache_();
  } finally {
    lock.releaseLock();
  }

  const sitesForResult = apiSites_();
  const result = apiKnownStatus_(
    user, dateKey,
    kind === 'in' ? now : checkInValue,
    kind === 'out' ? now : '',
    sitesForResult,
    kind === 'in' ? site.name : user.lastSiteName,
    kind === 'in' ? site.folderId : user.lastSiteId,
    apiPhotoCount_(dateKey, user.phone)
  );
  result.message = (kind === 'in')
    ? (site.name + ' 출근이 기록되었습니다.')
    : '퇴근이 기록되었습니다.';
  return result;
}


/* ============================================================
 *  현장 사진
 * ========================================================== */

function apiPhoto_(token, body) {
  const user = apiUserByToken_(token);
  if (!user) {
    return { ok: false, code: 'NOT_REGISTERED', message: '등록되지 않은 기기입니다.' };
  }

  const data = String((body && body.data) || '');
  if (!data) return { ok: false, message: '사진을 읽지 못했습니다. 다시 시도해 주세요.' };

  const mime = String((body && body.mimeType) || 'image/jpeg');
  const bytes = Utilities.base64Decode(data);

  if (bytes.length > API_MAX_PHOTO_BYTES) {
    return { ok: false, message: '사진 용량이 너무 큽니다. 다시 촬영해 주세요.' };
  }

  const dateKey = todayKey_();
  const now = new Date();
  const stamp = Utilities.formatDate(now, 'Asia/Seoul', 'yyyyMMdd_HHmmss');
  const ext = (mime.indexOf('png') >= 0) ? 'png' : 'jpg';

  const savedName = sanitizeFileName_(
    'NCORE_' + dateKey.replace(/-/g, '') + '_' + user.name + '_' + stamp
  ) + '.' + ext;

  /* 오늘 출근할 때 고른 현장 폴더에 넣는다 */
  const logSheet = apiSheet_(SHEET_LOG, HEADERS.LOG);
  const todayRow = apiTodayRow_(logSheet, dateKey, user.phone);
  let rowValues = [];
  if (todayRow) {
    rowValues = logSheet.getRange(todayRow, 1, 1, HEADERS.LOG.length).getValues()[0];
  }
  const site = todayRow
    ? {
        name: String(rowValues[LOG_COL.현장명 - 1] || '').trim(),
        folderId: String(rowValues[LOG_COL.현장폴더ID - 1] || '').trim()
      }
    : { name: OFFICE_SITE_NAME, folderId: '' };

  const folder = apiPhotoFolder_(dateKey, user, site);
  const file = folder.createFile(Utilities.newBlob(bytes, mime, savedName));

  const lat = apiNumber_(body && body.lat);
  const lng = apiNumber_(body && body.lng);
  const acc = apiNumber_(body && body.acc);
  const map = (lat === '' || lng === '') ? '' : ('https://www.google.com/maps?q=' + lat + ',' + lng);

  const sheet = apiSheet_(SHEET_PHOTO, HEADERS.PHOTO);
  sheet.appendRow([
    dateKey, now, user.name, user.phone,
    String((body && body.fileName) || savedName), savedName, mime, bytes.length,
    lat, lng, acc, map,
    file.getUrl(), folder.getUrl(), '완료', site.name || OFFICE_SITE_NAME
  ]);

  apiTouchUser_(user.row, now, null, user.phone);
  attBump_(SHEET_PHOTO);
  attBump_(SHEET_USERS);
  apiClearCache_();

  const result = apiKnownStatus_(
    user, dateKey,
    todayRow ? rowValues[LOG_COL.출근시각 - 1] : '',
    todayRow ? rowValues[LOG_COL.퇴근시각 - 1] : '',
    apiSites_(),
    site.name,
    site.folderId,
    apiPhotoCount_(dateKey, user.phone)
  );
  result.message = '사진이 등록되었습니다.';
  result.fileUrl = file.getUrl();
  return result;
}


/* ============================================================
 *  현장 목록
 * ========================================================== */

function apiEstimateSs_() {
  if (requestEstimateSs) return requestEstimateSs;

  const id = String(attVerAll_()['ESTIMATE_ID'] || '').trim();
  if (!id) return null;

  try {
    requestEstimateSs = SpreadsheetApp.openById(id);
    return requestEstimateSs;
  }
  catch (error) { return null; }
}


/** 출근할 때 고를 현장 목록.
    맨 위는 언제나 사무실이고, 그 아래로 견적에 등록된 현장이 붙습니다. */
function apiSites_() {
  if (CACHE_SITES_ON) {
    try {
      /* ★ 캐시도 따로 묻지 않는다. attGetAll_() 이 시트 세 장과 함께
         현장 목록까지 getAll 한 번으로 가져왔다. */
      const cached = attGetAll_()[SITE_CACHE_KEY]
        || CacheService.getScriptCache().get(SITE_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (error) {
      // 캐시가 없거나 깨졌으면 아래의 기존 조회를 사용합니다.
    }
  }

  const list = [
    { name: OFFICE_SITE_NAME, folderId: '' },
    { name: ETC_SITE_NAME, folderId: '' }
  ];

  const ss = apiEstimateSs_();
  if (!ss) return apiCacheSites_(list);

  const sheet = ss.getSheetByName(ESTIMATE_LEDGER_SHEET);
  if (!sheet) return apiCacheSites_(list);

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return apiCacheSites_(list);

  const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  const head = values[0].map(String);

  const colName   = head.indexOf('현장폴더');
  const colId     = head.indexOf('현장폴더ID');
  const colClient = head.indexOf('고객명');
  const colAddr   = head.indexOf('현장주소');
  const colState  = head.indexOf('진행상태');
  const colContract = head.indexOf('계약상태');

  const seen = {};

  /* 최근 것이 위로 오도록 아래에서부터 읽는다 */
  for (let i = values.length - 1; i >= 1; i -= 1) {
    const row = values[i];

    const state = colState >= 0 ? String(row[colState] || '').trim() : '';
    if (state === '취소' || state === '완료') continue;

    /* 계약된 현장만 목록에 띄운다.
       고객 서명이 끝나면 '견적서 서명완료', 계약이 확정되면 '계약완료' 가 들어간다.
       견적만 뽑아보고 만 현장은 이 칸이 비어 있어서 여기서 걸러진다. */
    const contract = colContract >= 0 ? String(row[colContract] || '').trim() : '';
    if (!contract) continue;

    const folderId = colId >= 0 ? String(row[colId] || '').trim() : '';
    if (!folderId) continue;
    if (seen[folderId]) continue;
    seen[folderId] = true;

    let name = colName >= 0 ? String(row[colName] || '').trim() : '';
    if (!name) {
      const client = colClient >= 0 ? String(row[colClient] || '').trim() : '';
      const addr = colAddr >= 0 ? String(row[colAddr] || '').trim() : '';
      name = client || addr || '이름없는현장';
    }

    list.push({ name: name, folderId: folderId });
    if (list.length >= 40) break;
  }

  return apiCacheSites_(list);
}

function apiCacheSites_(list) {
  if (CACHE_SITES_ON) {
    try {
      CacheService.getScriptCache().put(SITE_CACHE_KEY, JSON.stringify(list), SITE_CACHE_SECONDS);
    } catch (error) {
      // 캐시 저장 실패는 현장 목록 조회 결과에 영향을 주지 않습니다.
    }
  }
  return list;
}


/* ============================================================
 *  사진 폴더
 * ========================================================== */

function apiPhotoFolder_(dateKey, user, site) {
  /* 현장을 골랐으면 그 현장 폴더 안에 넣는다 */
  if (site && site.folderId) {
    try {
      const siteFolder = DriveApp.getFolderById(site.folderId);
      return apiSubFolder_(siteFolder, SITE_ATTENDANCE_FOLDER);
    } catch (error) {
      /* 현장 폴더를 못 찾으면 아래 사무실 방식으로 */
    }
  }

  /* 사무실 근무는 월별 폴더에 */
  return apiSubFolder_(apiRootFolder_(), String(dateKey).slice(0, 7));
}


function apiSubFolder_(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}


function apiRootFolder_() {
  /* 이름으로 찾지 않고 정해진 폴더만 씁니다.
     이름으로 찾으면 내 드라이브에 엉뚱한 폴더가 만들어질 수 있습니다. */
  return DriveApp.getFolderById(API_PHOTO_ROOT_ID);
}


/* ============================================================
 *  공통
 * ========================================================== */

function apiSs_() {
  if (requestApiSs) return requestApiSs;

  /* ★ 속성을 따로 묻지 않는다. attVerAll_() 이 요청당 한 번 통째로 가져왔다.
     getProperty 를 새로 부르면 구글 왕복이 하나 더 붙는다. */
  const propId = String(attVerAll_()['SHEET_ID'] || '').trim();

  const useId = API_SPREADSHEET_ID || propId;
  if (!useId) throw new Error('근태 시트가 연결되지 않았습니다. 스크립트 속성 SHEET_ID 를 확인해 주세요.');

  requestApiSs = SpreadsheetApp.openById(useId);
  return requestApiSs;
}


/* ============================================================
 *  워크보드 직원 명부
 *  이 앱은 사람 정보를 따로 갖지 않습니다.
 *  워크보드에서 승인받은 사람만 기기를 등록할 수 있습니다.
 * ========================================================== */

function apiWorkboardSs_() {
  if (requestWorkboardSs) return requestWorkboardSs;

  const id = String(attVerAll_()['WORKBOARD_ID'] || '').trim();
  if (!id) throw new Error('워크보드 시트가 연결되지 않았습니다. 스크립트 속성 WORKBOARD_ID 를 확인해 주세요.');
  requestWorkboardSs = SpreadsheetApp.openById(id);
  return requestWorkboardSs;
}


/** PIN 을 되돌릴 수 없는 형태로 바꾼다 (워크보드와 같은 방식) */
function apiHashPin_(phone, pin) {
  const raw = WORKBOARD_SALT + '|' + phoneDigits_(phone) + '|' + String(pin);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}


/** 워크보드 명부에서 이 번호를 가진 사람을 찾는다. 재직 중인 사람만 */
function apiFindStaff_(phone) {
  const wanted = phoneDigits_(phone);
  if (!wanted) return null;

  const sheet = apiWorkboardSs_().getSheetByName(WORKBOARD_STAFF_SHEET);
  if (!sheet) throw new Error("워크보드에 '직원' 시트가 없습니다.");

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return null;

  const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  const head = values[0].map(String);

  const col = {};
  ['이름', '전화번호', '직급', '권한등급', '재직상태', 'PIN해시'].forEach(function (name) {
    col[name] = head.indexOf(name);
  });

  for (let i = 1; i < values.length; i += 1) {
    const row = values[i];
    if (col['전화번호'] < 0) break;
    if (phoneDigits_(row[col['전화번호']]) !== wanted) continue;

    return {
      name: col['이름'] >= 0 ? String(row[col['이름']] || '').trim() : '',
      phone: wanted,
      rank: col['직급'] >= 0 ? String(row[col['직급']] || '').trim() : '',
      grade: col['권한등급'] >= 0 ? Number(row[col['권한등급']] || 1) : 1,
      state: col['재직상태'] >= 0 ? String(row[col['재직상태']] || '재직').trim() : '재직',
      pinHash: col['PIN해시'] >= 0 ? String(row[col['PIN해시']] || '').trim() : ''
    };
  }

  return null;
}


function apiSheet_(name, headers) {
  const ss = apiSs_();
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}


function apiUserByToken_(token) {
  /* 담아둔 값에서 찾는다. 없으면 attValues_ 안에서 시트를 읽는다.
     row 는 시트의 실제 줄 번호다 (start 를 더해서 계산한다). */
  const box = attValues_(SHEET_USERS, HEADERS.USERS);
  const values = box.rows;

  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (String(values[i][3] || '').trim() !== token) continue;
    if (values[i][4] === false) return null;

    return {
      row: box.start + i,
      name: String(values[i][1] || '').trim(),
      phone: normalizePhone_(values[i][2]),
      lastSiteName: String(values[i][USER_COL.마지막현장명 - 1] || '').trim(),
      lastSiteId: String(values[i][USER_COL.마지막현장ID - 1] || '').trim()
    };
  }

  return null;
}


/* 쓰기 전에 부른다. ★ 반드시 시트에서 직접 찾는다 —
   담아둔 값이 낡아 있으면 남의 줄에 출퇴근을 쓸 수 있다.
   느린 것은 참아도 줄이 섞이는 것은 못 참는다. */
function apiTodayRow_(sheet, dateKey, phone) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (normalizeDate_(values[i][0]) !== dateKey) continue;
    if (normalizePhone_(values[i][2]) !== phone) continue;
    return i + 2;
  }

  return 0;
}

/* 보여주기만 할 때 쓴다. 담아둔 값에서 오늘 줄을 통째로 돌려준다.
   줄을 못 찾으면 null. 시트를 열지 않는다. */
function apiTodayValues_(dateKey, phone) {
  const box = attValues_(SHEET_LOG, HEADERS.LOG);
  const values = box.rows;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (normalizeDate_(values[i][0]) !== dateKey) continue;
    if (normalizePhone_(values[i][2]) !== phone) continue;
    return values[i];
  }
  return null;
}


function apiPhotoCount_(dateKey, phone) {
  const values = attValues_(SHEET_PHOTO, HEADERS.PHOTO).rows;
  let count = 0;

  values.forEach(function (row) {
    if (normalizeDate_(row[0]) !== dateKey) return;
    if (normalizePhone_(row[3]) !== phone) return;
    count += 1;
  });

  return count;
}


/* '최근접속'(6) 과 '마지막현장명·ID'(8,9) 는 같은 줄이다.
   예전에는 두 번 나눠 썼다. 6~9 를 한 번에 쓴다 (구글 왕복 1회).
   현장을 안 넘기면 7~9 는 있던 값을 그대로 되돌려 놓는다. */
function apiTouchUser_(row, when, lastSite, phone) {
  try {
    const sheet = apiSheet_(SHEET_USERS, HEADERS.USERS);

    /* 전화번호(3)부터 마지막현장ID(9)까지 한 번에 읽는다.
       ★ 줄 번호는 담아둔 값에서 왔다. 그 줄의 전화번호가 정말 이 사람인지
         확인하고 나서 쓴다. 아니면 아무것도 쓰지 않는다 —
         남의 줄을 덮어쓰는 것보다 기록 한 번 빠지는 편이 낫다. */
    const from = USER_COL.전화번호;
    const width = USER_COL.마지막현장ID - from + 1;
    const keep = sheet.getRange(row, from, 1, width).getValues()[0];

    if (phone && normalizePhone_(keep[0]) !== normalizePhone_(phone)) return;

    keep[USER_COL.최근접속 - from] = when;
    if (lastSite) {
      keep[USER_COL.마지막현장명 - from] = lastSite[0];
      keep[USER_COL.마지막현장ID - from] = lastSite[1];
    }
    sheet.getRange(row, from, 1, width).setValues([keep]);
  } catch (error) {
    // 접속시간 기록 실패는 무시한다
  }
}


function apiNumber_(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  return isFinite(num) ? num : '';
}


function apiClearCache_() {
  try {
    clearDataCache_();
  } catch (error) {
    // Code.gs 캐시 초기화 실패는 기록에 영향 없음
  }
}


/* ============================================================
 *  캐시_확인 · 속도_재기   (편집기에서 직접 실행)
 *
 *  캐시를 넣고 나서 값이 한 글자라도 달라지지 않았는지 봅니다.
 *  "느린 것은 참아도 값이 틀리는 것은 못 참는다" 가 기준입니다.
 * ========================================================== */

/**
 * 담아둔 값과 시트를 직접 읽은 값이 같은지 칸 하나하나 견줍니다.
 * 다른 칸이 하나라도 있으면 ATT_CACHE_ON 을 false 로 되돌리세요.
 */
function 캐시_확인() {
  const 줄 = [];
  let 검사 = 0, 다름 = 0;

  const 시트들 = [
    [SHEET_USERS, HEADERS.USERS],
    [SHEET_LOG,   HEADERS.LOG],
    [SHEET_PHOTO, HEADERS.PHOTO]
  ];

  시트들.forEach(function (one) {
    const name = one[0], headers = one[1];

    // ① 캐시를 통해 (담겨 있으면 담긴 값, 없으면 읽고 담는다)
    _attVals = {}; _attGot = null; _attVer = null;
    const 캐시본 = attValues_(name, headers);

    // ② 캐시를 끄고 시트에서 직접
    const sheet = apiSheet_(name, headers);
    const lastRow = sheet.getLastRow();
    let start = 2, 원본 = [];
    if (lastRow >= 2) {
      if (lastRow - 1 > ATT_TAIL_ROWS) start = lastRow - ATT_TAIL_ROWS + 1;
      원본 = sheet.getRange(start, 1, lastRow - start + 1, headers.length).getValues();
    }

    if (캐시본.start !== start) {
      다름 += 1;
      줄.push('[' + name + '] 시작 줄이 다릅니다  캐시 ' + 캐시본.start + ' vs 시트 ' + start);
    }
    if (캐시본.rows.length !== 원본.length) {
      다름 += 1;
      줄.push('[' + name + '] 줄 수가 다릅니다  캐시 ' + 캐시본.rows.length + ' vs 시트 ' + 원본.length);
    }

    const n = Math.min(캐시본.rows.length, 원본.length);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < headers.length; j += 1) {
        검사 += 1;
        const a = 캐시본.rows[i][j];
        const b = 원본[i][j];
        const 같음 = (a instanceof Date && b instanceof Date)
          ? (a.getTime() === b.getTime())
          : (String(a) === String(b));
        if (!같음) {
          다름 += 1;
          if (다름 <= 12) {
            줄.push('[' + name + '] ' + (start + i) + '행 ' + headers[j] +
                    '  캐시 "' + a + '"  vs  시트 "' + b + '"');
          }
        }
      }
    }
    줄.push('[' + name + '] ' + 원본.length + '줄 × ' + headers.length + '칸 확인');
  });

  const 머리 = (다름 === 0)
    ? '통과 — 검사 ' + 검사 + '칸, 다른 칸 0개'
    : '★ 다른 칸 ' + 다름 + '개. ATT_CACHE_ON 을 false 로 되돌리세요';

  const 결과 = 머리 + '\n\n' + 줄.join('\n');
  Logger.log(결과);
  try { SpreadsheetApp.getUi().alert('출퇴근 캐시 확인', 결과, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return 결과;
}


/**
 * status(앱 열기)가 실제로 몇 ms 걸리는지, 구글에 몇 번 묻는지 잽니다.
 * 차가운 캐시(처음)와 더운 캐시(두 번째)를 나란히 보여줍니다.
 */
function 속도_재기() {
  const 줄 = [];

  // 아무 기기토큰이나 하나 집는다
  _attVals = {}; _attGot = null; _attVer = null;
  const users = attValues_(SHEET_USERS, HEADERS.USERS).rows;
  let token = '';
  for (let i = users.length - 1; i >= 0; i -= 1) {
    const t = String(users[i][3] || '').trim();
    if (t) { token = t; break; }
  }
  if (!token) return '등록된 기기가 없어 잴 수 없습니다.';

  function 한번(라벨) {
    _attVals = {}; _attGot = null; _attVer = null;
    const t0 = new Date().getTime();
    const r = apiStatus_(token);
    const ms = new Date().getTime() - t0;
    줄.push(라벨 + '  ' + ms + 'ms   (' + (r && r.registered ? r.name : '?') + ')');
    return ms;
  }

  // 캐시를 비우고 한 번 (차가운 상태)
  try {
    CacheService.getScriptCache().removeAll([
      attKey_(SHEET_USERS), attKey_(SHEET_LOG), attKey_(SHEET_PHOTO), SITE_CACHE_KEY
    ]);
  } catch (e) {}
  const 차가움 = 한번('차가운 캐시 (시트에서 읽음)');
  const 더움1 = 한번('더운 캐시 1회차     ');
  const 더움2 = 한번('더운 캐시 2회차     ');

  줄.push('');
  줄.push('평소 직원이 겪는 것은 더운 캐시 쪽입니다.');
  줄.push('5분 트리거로 데워두면 차가운 경우를 거의 만나지 않습니다.');
  줄.push('');
  줄.push('줄인 폭  ' + 차가움 + 'ms  →  ' + Math.round((더움1 + 더움2) / 2) + 'ms');

  const 결과 = 줄.join('\n');
  Logger.log(결과);
  try { SpreadsheetApp.getUi().alert('출퇴근 속도', 결과, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return 결과;
}


/**
 * 5분마다 캐시를 데워둡니다.
 * 이미 담겨 있으면 아무것도 하지 않습니다 (getAll 한 번, 약 50ms).
 * 아침에 첫 직원이 차가운 캐시를 물어 2~3초 기다리는 일이 없게 합니다.
 */
function 캐시_데우기() {
  _attVals = {}; _attGot = null; _attVer = null;
  const got = attGetAll_();
  const 없는것 = [];
  if (!got[attKey_(SHEET_USERS)]) 없는것.push(SHEET_USERS);
  if (!got[attKey_(SHEET_LOG)])   없는것.push(SHEET_LOG);
  if (!got[attKey_(SHEET_PHOTO)]) 없는것.push(SHEET_PHOTO);
  if (!got[SITE_CACHE_KEY])       없는것.push('현장목록');

  if (!없는것.length) return '이미 담겨 있습니다';

  attValues_(SHEET_USERS, HEADERS.USERS);
  attValues_(SHEET_LOG, HEADERS.LOG);
  attValues_(SHEET_PHOTO, HEADERS.PHOTO);
  try { apiSites_(); } catch (e) {}
  return '데웠습니다: ' + 없는것.join(', ');
}


/** 캐시 데우기 트리거를 겁니다 (한 번만 실행하면 됩니다) */
function 캐시_트리거_설치() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === '캐시_데우기') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('캐시_데우기').timeBased().everyMinutes(5).create();
  const msg = '5분마다 캐시를 데웁니다.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('출퇴근', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return msg;
}


/* ============================================================
 *  점검용 (편집기에서 직접 실행)
 * ========================================================== */

function apiSelfTest() {
  const info = {
    시트: apiSs_().getName(),
    사용자: apiSheet_(SHEET_USERS, HEADERS.USERS).getLastRow() - 1,
    출퇴근: apiSheet_(SHEET_LOG, HEADERS.LOG).getLastRow() - 1,
    사진: apiSheet_(SHEET_PHOTO, HEADERS.PHOTO).getLastRow() - 1,
    사진폴더: apiRootFolder_().getUrl()
  };
  console.log(JSON.stringify(info, null, 2));
  return info;
}
