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
 * ========================================================== */

/** 오늘 날짜를 2026-08-27 모양으로 */
function todayKey_() {
  return Utilities.formatDate(new Date(), TZ_KR, 'yyyy-MM-dd');
}

/** 어떤 모양으로 들어와도 2026-08-27 로 맞춘다 */
function normalizeDate_(value) {
  if (!value && value !== 0) return '';

  if (value instanceof Date) {
    return Utilities.formatDate(value, TZ_KR, 'yyyy-MM-dd');
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
    return Utilities.formatDate(value, TZ_KR, 'HH:mm');
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
