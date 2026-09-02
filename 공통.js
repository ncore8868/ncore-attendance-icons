/*************************************************************
 * UNION ONE 출퇴근 — 공통 설정
 * 파일명: 공통.js
 *
 * 시트 이름, 제목줄, 날짜·전화번호 다듬는 함수가 들어 있습니다.
 * Api.js 와 집계.js 가 이 파일의 값을 씁니다.
 *************************************************************/

/* ── 시트 이름 ───────────────────────────────────────── */
const SHEET_USERS = '사용자';
const SHEET_LOG   = '출퇴근';
const SHEET_PHOTO = '사진';

const SHEET_DAY   = '90_일별현황';
const SHEET_MONTH = '91_월별집계';
const SHEET_YEAR  = '92_연별집계';


/* ── 제목줄 ──────────────────────────────────────────
   순서를 바꾸면 안 됩니다. Api.js 가 칸 번호로 읽고 씁니다.
   새 칸이 필요하면 반드시 맨 뒤에 붙이세요.
── */
const HEADERS = {

  USERS: [
    '등록일시', '이름', '전화번호', '기기토큰', '사용여부', '최근접속', '비고',
    '마지막현장명', '마지막현장ID'
  ],

  LOG: [
    '날짜', '이름', '전화번호',
    '출근시각', '출근위도', '출근경도', '출근정확도', '출근지도',
    '퇴근시각', '퇴근위도', '퇴근경도', '퇴근정확도', '퇴근지도',
    '상태', '기기토큰', '기록시각',
    '현장명', '현장폴더ID', '근무시간'
  ],

  PHOTO: [
    '날짜', '등록시각', '이름', '전화번호',
    '원본파일명', '저장파일명', '형식', '바이트',
    '위도', '경도', '정확도', '지도',
    '파일링크', '폴더링크', '상태', '현장명'
  ]
};

/* 출퇴근 시트의 칸 번호 — 코드에서 숫자를 직접 쓰지 않기 위해 */
const LOG_COL = {
  날짜: 1, 이름: 2, 전화번호: 3,
  출근시각: 4, 출근위도: 5, 출근경도: 6, 출근정확도: 7, 출근지도: 8,
  퇴근시각: 9, 퇴근위도: 10, 퇴근경도: 11, 퇴근정확도: 12, 퇴근지도: 13,
  상태: 14, 기기토큰: 15, 기록시각: 16,
  현장명: 17, 현장폴더ID: 18, 근무시간: 19
};

/* 사용자 시트의 칸 번호 */
const USER_COL = {
  등록일시: 1, 이름: 2, 전화번호: 3, 기기토큰: 4, 사용여부: 5,
  최근접속: 6, 비고: 7, 마지막현장명: 8, 마지막현장ID: 9
};


/* ── 사무실 근무 ─────────────────────────────────────
   현장이 아닌 근무를 고를 때 쓰는 고정 항목입니다.
── */
const OFFICE_SITE_NAME = '사무실';


/* ── 시간대 ──────────────────────────────────────────── */
const TZ_KR = 'Asia/Seoul';


/* ============================================================
 *  날짜 · 시각
 *
 *  ★ Utilities.formatDate 를 쓰지 않습니다 (2026-09-02).
 *
 *    워크보드에서 직접 재어 코드에 적어둔 값이 있습니다 —
 *    이 함수는 **한 번에 1ms 가까이** 듭니다 (Code.js 의 '날짜를 글자로' 참고).
 *
 *    출퇴근 앱은 이것을 **시트 줄마다** 불렀습니다.
 *      · 앱 열기      출퇴근 400줄 + 사진 400줄  = 800번  ≈ 880ms
 *      · 출근 누르기  찾기 400줄                 = 400번  ≈ 440ms  (그것도 잠금 안에서)
 *
 *    시트가 아직 작아서 아무도 못 느꼈을 뿐입니다.
 *    여섯 명 × 한 달 22일 = 한 달에 132줄이므로 3개월이면 400줄에 닿고,
 *    그때부터는 영영 400줄입니다.
 *
 *  ★ 서울은 서머타임이 없어 **언제나 UTC+9** 입니다.
 *    9시간을 더한 뒤 UTC 로 읽으면 서울 시각이 그대로 나옵니다.
 *    구글 함수를 부르지 않으므로 1.1ms 가 0.001ms 가 됩니다.
 *
 *  ★ 이 부분을 고치면 반드시 편집기에서 **`날짜_확인()`** 을 다시 돌리세요.
 *    옛 방식과 새 방식이 한 글자라도 다르면 그 자리에서 알려줍니다.
 * ========================================================== */

const KST_MS = 9 * 60 * 60 * 1000;

function z2_(n) { return n < 10 ? '0' + n : '' + n; }
function z4_(n) { return n < 10 ? '000' + n : (n < 100 ? '00' + n : (n < 1000 ? '0' + n : '' + n)); }

/** 서울 기준 연·월·일·시·분·초 */
function kst_(d) {
  const t = new Date(d.getTime() + KST_MS);
  return {
    y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(),
    h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds()
  };
}

/** 오늘 날짜를 2026-08-27 모양으로 */
function todayKey_() {
  const p = kst_(new Date());
  return z4_(p.y) + '-' + z2_(p.mo) + '-' + z2_(p.d);
}

/** 지금 시각을 09:12 모양으로 */
function nowTime_() {
  const p = kst_(new Date());
  return z2_(p.h) + ':' + z2_(p.mi);
}

/** 지금을 2026-08-27 09:12:33 모양으로 (ping 응답용) */
function nowStamp_() {
  const p = kst_(new Date());
  return z4_(p.y) + '-' + z2_(p.mo) + '-' + z2_(p.d) + ' ' +
         z2_(p.h) + ':' + z2_(p.mi) + ':' + z2_(p.s);
}

/** 사진 파일이름에 붙이는 20260827_091233 */
function fileStamp_(d) {
  const p = kst_(d);
  return z4_(p.y) + z2_(p.mo) + z2_(p.d) + '_' + z2_(p.h) + z2_(p.mi) + z2_(p.s);
}

/** 어떤 모양으로 들어와도 2026-08-27 로 맞춘다 */
function normalizeDate_(value) {
  if (!value && value !== 0) return '';

  if (value instanceof Date) {
    const p = kst_(value);
    return z4_(p.y) + '-' + z2_(p.mo) + '-' + z2_(p.d);
  }

  const text = String(value).trim();
  const matched = text.match(/(\d{4})[-.\/]\s*(\d{1,2})[-.\/]\s*(\d{1,2})/);
  if (!matched) return text;

  const pad = function (n) { return (String(n).length < 2 ? '0' : '') + n; };
  return matched[1] + '-' + pad(matched[2]) + '-' + pad(matched[3]);
}

/** 시각을 09:12 모양으로. 값이 없으면 빈 문자열 */
function formatTime_(value) {
  if (!value && value !== 0) return '';

  if (value instanceof Date) {
    const p = kst_(value);
    return z2_(p.h) + ':' + z2_(p.mi);
  }

  const text = String(value).trim();
  if (!text) return '';

  const matched = text.match(/(\d{1,2}):(\d{2})/);
  if (!matched) return text;

  const pad = function (n) { return (String(n).length < 2 ? '0' : '') + n; };
  return pad(matched[1]) + ':' + matched[2];
}

/** 두 시각 사이를 시간 단위 숫자로. 소수 둘째자리까지 */
function workHours_(inTime, outTime) {
  if (!(inTime instanceof Date) || !(outTime instanceof Date)) return '';

  const ms = outTime.getTime() - inTime.getTime();
  if (!(ms > 0)) return '';

  return Math.round((ms / 3600000) * 100) / 100;
}


/* ============================================================
 *  전화번호
 * ========================================================== */

/** 숫자만 남기고, 앞의 0 이 떨어진 10자리는 되살린다.
    워크보드와 같은 방식이어야 PIN 이 맞습니다. */
function phoneDigits_(value) {
  let digits = String(value || '').replace(/[^0-9]/g, '');
  if (digits.length === 10 && digits.charAt(0) !== '0') digits = '0' + digits;
  return digits;
}

/** 시트에 넣을 모양으로. 010-1234-5678 */
function normalizePhone_(value) {
  const digits = phoneDigits_(value);

  if (digits.length === 11) {
    return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
  }
  if (digits.length === 10) {
    return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
  }
  return digits;
}


/* ============================================================
 *  파일 이름
 * ========================================================== */

/** 드라이브가 싫어하는 글자를 걷어낸다 */
function sanitizeFileName_(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'UNIONONE';
}


/* ============================================================
 *  날짜_확인()  — 편집기에서 직접 실행
 *
 *  빠른 날짜 함수가 구글 함수와 **한 글자라도** 다른지 봅니다.
 *  느린 것은 참아도 날짜가 하루 밀리는 것은 못 참습니다.
 *
 *  1년치(365일)를 하루 15분 간격으로 견주고, 시트에서 나올 법한
 *  글자·숫자 모양도 같이 봅니다. 다른 칸이 0개여야 정상입니다.
 * ========================================================== */
function 날짜_확인() {
  const 줄 = [];
  let 본것 = 0, 다른것 = 0;

  function 견줌(라벨, 옛, 새) {
    본것 += 1;
    if (옛 !== 새) {
      다른것 += 1;
      if (다른것 <= 20) 줄.push('  ✕ ' + 라벨 + '   구글 [' + 옛 + ']   새 [' + 새 + ']');
    }
  }

  /* ① 1년치를 6시간 1분씩 옮겨가며 견준다.
       1분씩 밀리므로 하루 중 온갖 시각을 지나가고, 자정·월말·윤년도 모두 지난다.
       1,460번 × 6시간 1분 ≈ 366일. */
  const 시작 = new Date(2026, 0, 1, 0, 0, 0);
  const 걸음 = (6 * 60 + 1) * 60 * 1000;
  for (let i = 0; i < 1460; i += 1) {
    const d = new Date(시작.getTime() + i * 걸음);
    견줌('날짜', Utilities.formatDate(d, TZ_KR, 'yyyy-MM-dd'), normalizeDate_(d));
    견줌('시각', Utilities.formatDate(d, TZ_KR, 'HH:mm'), formatTime_(d));
    견줌('파일', Utilities.formatDate(d, TZ_KR, 'yyyyMMdd_HHmmss'), fileStamp_(d));
  }

  /* ② 연도 경계 — 12월 31일 밤과 1월 1일 새벽 */
  [
    new Date(2026, 11, 31, 23, 59, 59),
    new Date(2027, 0, 1, 0, 0, 0),
    new Date(2028, 1, 29, 12, 0, 0),      // 윤년 2월 29일
    new Date(2029, 2, 1, 0, 0, 0)
  ].forEach(function (d) {
    견줌('경계 날짜', Utilities.formatDate(d, TZ_KR, 'yyyy-MM-dd'), normalizeDate_(d));
    견줌('경계 시각', Utilities.formatDate(d, TZ_KR, 'HH:mm'), formatTime_(d));
  });

  /* ③ 시트에서 글자로 들어오는 경우 — 이 부분은 고치지 않았지만 같이 확인한다 */
  [
    ['2026-08-27', '2026-08-27'],
    ['2026. 8. 27', '2026-08-27'],
    ['2026/8/7', '2026-08-07'],
    ['', ''],
    ['사무실', '사무실']
  ].forEach(function (pair) {
    견줌('글자 날짜 ' + pair[0], pair[1], normalizeDate_(pair[0]));
  });

  [
    ['09:12', '09:12'],
    ['9:12', '09:12'],
    ['09:12:33', '09:12'],
    ['', '']
  ].forEach(function (pair) {
    견줌('글자 시각 ' + pair[0], pair[1], formatTime_(pair[0]));
  });

  /* ④ 오늘 날짜가 구글이 말하는 오늘과 같은가 */
  견줌('오늘', Utilities.formatDate(new Date(), TZ_KR, 'yyyy-MM-dd'), todayKey_());
  견줌('지금', Utilities.formatDate(new Date(), TZ_KR, 'HH:mm'), nowTime_());

  줄.unshift(다른것
    ? ('★ 다른 칸이 ' + 다른것 + '개 있습니다. 올리지 마세요.')
    : '전부 같습니다. 올려도 됩니다.');
  줄.splice(1, 0, '  견준 칸 ' + 본것 + '개 · 다른 칸 ' + 다른것 + '개', '');

  const 결과 = 줄.join('\n');
  Logger.log(결과);
  return 결과;
}
