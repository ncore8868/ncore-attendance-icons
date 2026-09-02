/*************************************************************
 * UNION ONE 출퇴근 — 연결 확인
 * 파일명: 연결확인.js
 *
 * 붙어야 할 곳이 다 붙었는지만 봅니다. 아무것도 바꾸지 않습니다.
 *************************************************************/
function 연결확인() {
  const 줄 = [];

  try {
    줄.push('근태 시트      →  ' + apiSs_().getName());
  } catch (error) {
    줄.push('근태 시트      →  실패. 스크립트 속성 SHEET_ID 를 확인하세요');
  }

  try {
    줄.push('워크보드 시트  →  ' + apiWorkboardSs_().getName());
  } catch (error) {
    줄.push('워크보드 시트  →  실패. 스크립트 속성 WORKBOARD_ID 를 확인하세요');
  }

  const 견적 = apiEstimateSs_();
  줄.push('견적 시트      →  ' + (견적 ? 견적.getName() : '실패. 스크립트 속성 ESTIMATE_ID 를 확인하세요'));

  try {
    줄.push('사진 폴더      →  ' + apiRootFolder_().getName());
  } catch (error) {
    줄.push('사진 폴더      →  실패. 폴더 ID 를 확인하세요');
  }

  try {
    const 현장들 = apiSites_();
    줄.push('현장 목록      →  ' + 현장들.length + '개  (사무실 · 기타현장 + 계약된 현장)');
    현장들.slice(0, 10).forEach(function (one) {
      줄.push('   ' + one.name + (one.folderId ? '' : '   (폴더 없음)'));
    });
    if (현장들.length > 10) 줄.push('   … 외 ' + (현장들.length - 10) + '개');
  } catch (error) {
    줄.push('현장 목록      →  실패. ' + (error && error.message ? error.message : error));
  }

  try {
    const ss = apiSs_();
    [SHEET_USERS, SHEET_LOG, SHEET_PHOTO].forEach(function (name) {
      const sheet = ss.getSheetByName(name);
      const 줄수 = sheet ? (sheet.getLastRow() - 1) : -1;
      줄.push('탭 ' + name + '  →  ' + (sheet ? 줄수 + '줄  (담아두는 것은 뒤에서 ' + attTail_(name) + '줄)' : '아직 없음'));
    });
  } catch (error) { /* 위에서 이미 알렸다 */ }

  /* ★ 캐시가 실제로 담겨 있는지 (2026-09-02).
     예전에는 담기에 실패해도 아무 데도 안 나와서, 요청마다 시트를 새로 읽는데도
     아무도 몰랐습니다. 여기서 눈으로 보이게 합니다. */
  줄.push('');
  줄.push('── 담아둔 값 ──');
  _attVer = null; _attGot = null;
  [SHEET_USERS, SHEET_LOG, SHEET_PHOTO].forEach(function (name) {
    const raw = attJoin_(name);
    줄.push('   ' + (name + '            ').slice(0, 10) +
            (raw ? ('담겨 있음  ' + attBytes_(raw).toLocaleString() + '바이트') : '★ 비어 있음 — 5분 트리거를 확인하세요'));
  });
  줄.push('   ' + ('현장목록' + '            ').slice(0, 10) +
          (attGetAll_()[SITE_CACHE_KEY] ? '담겨 있음' : '★ 비어 있음'));

  /* ★ 5분 트리거가 실제로 걸려 있는지.
     메뉴를 뒤지지 않고 여기서 한 번에 봅니다. */
  줄.push('');
  try {
    let 걸린것 = 0;
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === '캐시_데우기') 걸린것 += 1;
    });
    줄.push('캐시 트리거    →  ' + (걸린것
      ? (걸린것 + '개 걸려 있음' + (걸린것 > 1 ? '  ★ 하나만 있으면 됩니다. 캐시_트리거_설치 를 다시 실행하세요' : '  (정상)'))
      : '★ 없음 — 편집기에서 캐시_트리거_설치 를 한 번 실행하세요'));
  } catch (error) {
    줄.push('캐시 트리거    →  확인하지 못했습니다');
  }

  /* ★ 날짜 함수가 구글 것과 같은지 (한 줄 요약).
     자세한 것은 날짜_확인() 을 따로 실행합니다. */
  const 오늘_구글 = Utilities.formatDate(new Date(), TZ_KR, 'yyyy-MM-dd');
  줄.push('날짜 함수      →  ' + (오늘_구글 === todayKey_()
    ? '정상 (자세히 보려면 날짜_확인 을 실행하세요)'
    : '★ 다릅니다. 구글 [' + 오늘_구글 + '] 새 [' + todayKey_() + ']'));

  /* ★ '누른 시각' 규칙이 살아 있는가 (2026-09-02).

     통신이 끊겼다가 뒤늦게 붙은 출근을 **누른 시각으로** 적어 주는 규칙입니다.
     동시에 폰 시계를 돌려 시각을 지어내지 못하게 막는 규칙이기도 합니다.
     여기가 망가지면 임금 계산이 조용히 틀어집니다. */
  줄.push('누른 시각 규칙 →  ' + 누른시각점검_());

  const 결과 = 줄.join('\n');
  Logger.log(결과);
  return 결과;
}


/**
 * 누른 시각(at)을 받아들이는 규칙이 그대로인지 봅니다.
 * 실제로 pressedAt_ 을 불러서 확인합니다 — 주석만 보고 안심하지 않습니다.
 */
function 누른시각점검_() {
  const 지금 = new Date(2026, 8, 2, 9, 0, 0);      // 09:00
  const 분 = 60 * 1000;

  const 본다 = function (body, 기대) {
    const got = pressedAt_(body, 지금).getTime();
    return got === 기대.getTime();
  };

  const 목록 = [
    ['30분 전은 받는다',        { at: 지금.getTime() - 30 * 분 }, new Date(지금.getTime() - 30 * 분)],
    ['89분 전은 받는다',        { at: 지금.getTime() - 89 * 분 }, new Date(지금.getTime() - 89 * 분)],
    ['91분 전은 안 받는다',     { at: 지금.getTime() - 91 * 분 }, 지금],
    ['미래는 안 받는다',        { at: 지금.getTime() + 5 * 분 },  지금],
    ['안 보내면 서버 시각',     {},                               지금],
    ['이상한 값이면 서버 시각', { at: 'ㅁㄴㅇㄹ' },                지금]
  ];

  const 틀린것 = 목록.filter(function (one) { return !본다(one[1], one[2]); })
                     .map(function (one) { return one[0]; });

  return 틀린것.length
    ? ('★ 규칙이 달라졌습니다 — ' + 틀린것.join(' · '))
    : ('정상 (거슬러 인정하는 한도 ' + ATT_BACKDATE_MINUTES + '분 · 미래는 거부)');
}


/*************************************************************
 * 탭 미리 만들기 — 처음 한 번만 실행하세요
 *************************************************************/
function 탭만들기() {
  apiSheet_(SHEET_USERS, HEADERS.USERS);
  apiSheet_(SHEET_LOG, HEADERS.LOG);
  apiSheet_(SHEET_PHOTO, HEADERS.PHOTO);

  const 결과 = '탭 3개를 준비했습니다 — ' + [SHEET_USERS, SHEET_LOG, SHEET_PHOTO].join(' · ');
  Logger.log(결과);
  return 결과;
}
